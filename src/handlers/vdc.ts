import { Hono } from 'hono';
import { Environment, APIResponse, User } from '../types';
import { initializeVDC } from '../utils/blockchain';
import { IPFSClient } from '../utils/ipfs';
import { storeChainBlock } from '../utils/store';
import { submitAdminCommit, EthereumAnchoringClient } from '../utils/ethereum';
import { MaataraClient } from '../utils/crypto';

const vdcHandler = new Hono<{ Bindings: Environment }>();

interface SessionRecord {
  userId: string;
  expiresAt: number;
  createdAt: number;
}

// Helper function to authenticate user from request headers
async function authenticateUser(c: any): Promise<User | null> {
  const env = c.env;
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7);

  try {
    const sessionData = await env.VERITAS_KV.get(`session:${token}`);
    if (!sessionData) {
      return null;
    }

    const session: SessionRecord = JSON.parse(sessionData);
    if (!session || !session.userId) {
      return null;
    }

    if (session.expiresAt < Date.now()) {
      await env.VERITAS_KV.delete(`session:${token}`);
      return null;
    }

    const userData = await env.VERITAS_KV.get(`user:${session.userId}`);
    if (!userData) {
      return null;
    }

    return JSON.parse(userData) as User;
  } catch (error) {
    console.error('Authentication error:', error);
    return null;
  }
}

function extractAdminSecret(headerSecret: string | undefined, body: any): string | undefined {
  if (headerSecret && headerSecret.trim().length > 0) {
    return headerSecret.trim();
  }

  if (body) {
    if (typeof body.adminSecret === 'string' && body.adminSecret.trim().length > 0) {
      return body.adminSecret.trim();
    }

    if (typeof body.secret === 'string' && body.secret.trim().length > 0) {
      return body.secret.trim();
    }
  }

  return undefined;
}

function ensureAdminAccess(c: any, providedSecret?: string): Response | null {
  const env = c.env as Environment;

  if (!env.ADMIN_SECRET_KEY) {
    console.error('VDC admin access attempted without ADMIN_SECRET_KEY configured');
    return c.json({ success: false, error: 'Server configuration error' } as APIResponse, 500);
  }

  if (!providedSecret || providedSecret !== env.ADMIN_SECRET_KEY) {
    return c.json({ success: false, error: 'Unauthorized' } as APIResponse, 401);
  }

  return null;
}

vdcHandler.post('/initialize-genesis', async (c) => {
  let body: any = {};

  try {
    if (c.req.header('content-type')?.includes('application/json')) {
      body = await c.req.json();
    }
  } catch (error) {
    console.warn('VDC initialize-genesis: unable to parse body, continuing with header secret only');
  }

  const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), body);
  const authError = ensureAdminAccess(c, adminSecret);
  if (authError) {
    return authError;
  }

  try {
    const vdc = await initializeVDC(c.env);
    const block = await vdc.createGenesisBlock();

    return c.json<APIResponse>({
      success: true,
      data: {
        block,
        message: 'Genesis block created successfully'
      }
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to create genesis block';

    if (message.includes('Genesis block already exists')) {
      return c.json<APIResponse>({
        success: false,
        error: message
      }, 409);
    }

    console.error('VDC initialize-genesis error:', error);
    return c.json<APIResponse>({ success: false, error: message }, 500);
  }
});

  // Admin: warm Cloudflare IPFS gateway for a hash (non-fatal best-effort)
vdcHandler.post('/ipfs/warm', async (c) => {
    try {
      // Accept either session-based admin auth or admin secret header
      let isAdmin = false;
      const user = await authenticateUser(c);
      if (user && user.accountType === 'admin') {
        isAdmin = true;
      } else {
        const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
        const authError = ensureAdminAccess(c, adminSecret);
        if (!authError) {
          isAdmin = true;
        }
      }

      if (!isAdmin) {
        return c.json({ success: false, error: 'Admin access required' }, 403);
      }

      const env = c.env as Environment;
      const { hash, timeoutMs, retries, backoffMs, primeWithPinata } = await c.req.json();
      if (!hash || typeof hash !== 'string') return c.json({ success: false, error: 'hash required' }, 400);

      const ipfs = new (await import('../utils/ipfs')).IPFSClient(env);
      const result = await ipfs.warmCloudflareRobust(hash, {
        timeoutMs: Math.max(1000, Math.min(15000, timeoutMs || 5000)),
        retries: retries ?? 3,
        backoffMs: backoffMs ?? 750,
        primeWithPinata: primeWithPinata ?? true
      });
      return c.json({ success: true, data: { hash, cloudflareWarmed: result.ok, primedPinata: result.primedPinata, attempts: result.attempts } });
    } catch (e: any) {
      return c.json({ success: false, error: e?.message || 'Failed to warm IPFS gateway' }, 500);
    }
  });

// Admin: submit an Ethereum commit (super-root) via Cloudflare Web3 gateway
vdcHandler.post('/ethereum/commit', async (c) => {
  try {
    let body: any = {};
    try {
      if (c.req.header('content-type')?.includes('application/json')) {
        body = await c.req.json();
      }
    } catch {}

    // Accept either session-based admin auth or admin secret header/body (consistent with other endpoints)
    let isAdmin = false;
    const user = await authenticateUser(c);
    if (user && user.accountType === 'admin') {
      isAdmin = true;
    } else {
      const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), body);
      const authError = ensureAdminAccess(c, adminSecret);
      if (!authError) {
        isAdmin = true;
      } else {
        return authError; // 401/500 depending on config
      }
    }

    if (!isAdmin) {
      return c.json<APIResponse>({ success: false, error: 'Admin access required' }, 403);
    }

    const { superRoot, latestBlock, note } = body || {};
    if (!superRoot || typeof superRoot !== 'string') {
      return c.json<APIResponse>({ success: false, error: 'superRoot is required' }, 400);
    }

    const res = await submitAdminCommit(c.env as Environment, {
      superRoot,
      latestBlock: typeof latestBlock === 'number' ? latestBlock : undefined,
      note: typeof note === 'string' ? note : undefined
    });

    return c.json<APIResponse>({ success: true, data: { txHash: res.txHash, submittedAt: res.submittedAt } });
  } catch (error: any) {
    console.error('Ethereum commit error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to submit Ethereum commit' }, 500);
  }
});

// Admin: ping Ethereum RPC (eth_chainId) to test connectivity/latency
vdcHandler.get('/ethereum/ping', async (c) => {
  try {
    // Accept either session-based admin auth or admin secret header
    let isAdmin = false;
    const user = await authenticateUser(c);
    if (user && user.accountType === 'admin') {
      isAdmin = true;
    } else {
      const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
      const authError = ensureAdminAccess(c, adminSecret);
      if (!authError) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }

    const env = c.env as Environment;
    const rpcUrl = env.ETHEREUM_RPC_URL;
    const started = Date.now();
    const resp = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] })
    });
    const elapsed = Date.now() - started;
    const contentType = resp.headers.get('content-type') || '';
    let json: any | null = null;
    let text: string | null = null;
    try {
      if (contentType.includes('application/json')) {
        json = await resp.json();
      } else {
        text = await resp.text();
      }
    } catch (e) {
      // If parsing fails, try text as a last resort
      try { text = await resp.text(); } catch {}
    }

    const ok = resp.ok && json && (json.result || json.error == null);
    if (ok) {
      return c.json<APIResponse>({ success: true, data: { chainId: json.result, elapsedMs: elapsed, status: resp.status, url: rpcUrl } });
    }

    // Not OK or not JSON -> return a helpful error including a small snippet
    const snippet = (text || JSON.stringify(json) || '').slice(0, 200);
    const errMsg = (json && json.error && (json.error.message || json.error)) || snippet || 'RPC failed';
    return c.json<APIResponse>({ success: false, error: errMsg, data: { elapsedMs: elapsed, status: resp.status, url: rpcUrl } }, 502);
  } catch (error: any) {
    return c.json<APIResponse>({ success: false, error: error?.message || 'RPC ping failed' }, 500);
  }
});

// Admin: verify an Ethereum payload (no on-chain submission) and RPC connectivity
vdcHandler.post('/ethereum/verify', async (c) => {
  try {
    let body: any = {};
    try {
      if (c.req.header('content-type')?.includes('application/json')) {
        body = await c.req.json();
      }
    } catch {}

    // Accept either session-based admin auth or admin secret
    let isAdmin = false;
    const user = await authenticateUser(c);
    if (user && user.accountType === 'admin') {
      isAdmin = true;
    } else {
      const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), body);
      const authError = ensureAdminAccess(c, adminSecret);
      if (!authError) isAdmin = true; else return authError;
    }

    if (!isAdmin) {
      return c.json<APIResponse>({ success: false, error: 'Admin access required' }, 403);
    }

    const { superRoot } = body || {};
    if (!superRoot || typeof superRoot !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(superRoot)) {
      return c.json<APIResponse>({ success: false, error: 'Valid superRoot (0x + 64 hex) is required' }, 400);
    }

    const env = c.env as Environment;
  const client = new EthereumAnchoringClient(env);
  // Build the canonical anchor payload (no signing, no submit), use provided superRoot
  const anchor = await client.createEthereumAnchor('system', [superRoot], [], new Date().toISOString().slice(0,7), superRoot);

    // Build the tx data payload as hex (same shape as real submission)
    const payloadObj = {
      anchor: anchor.anchorHash,
      canonical: anchor.canonical,
      msg_b64u: anchor.msg_b64u,
      ts: anchor.timestamp
    };
    const encoder = new TextEncoder();
    const bytes = encoder.encode(JSON.stringify(payloadObj));
    let dataHex = '0x';
    for (let i = 0; i < bytes.length; i++) dataHex += bytes[i].toString(16).padStart(2, '0');

    // RPC checks
    const rpcUrl = env.ETHEREUM_RPC_URL;
    const rpcResults: any = {};
    // eth_chainId
    try {
      const resp = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }) });
  const json: any = await resp.json();
  rpcResults.chainId = (json && json.result) || null;
      rpcResults.status = resp.status;
    } catch (e: any) {
      rpcResults.chainIdError = e?.message || String(e);
    }

    // eth_gasPrice
    try {
      const resp = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'eth_gasPrice', params: [] }) });
  const json: any = await resp.json();
  rpcResults.gasPrice = (json && json.result) || null;
    } catch (e: any) {
      rpcResults.gasPriceError = e?.message || String(e);
    }

    // eth_estimateGas if from address is configured
    const from = (env as any).SYSTEM_ETH_FROM_ADDRESS as string | undefined;
    if (from && from.length > 0) {
      try {
        const params = [{ from, to: from, data: dataHex, value: '0x0' }];
        const resp = await fetch(rpcUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'eth_estimateGas', params }) });
  const json: any = await resp.json();
  rpcResults.estimateGas = (json && json.result) || null;
      } catch (e: any) {
        rpcResults.estimateGasError = e?.message || String(e);
      }
    } else {
      rpcResults.estimateGas = null;
      rpcResults.estimateGasNote = 'SYSTEM_ETH_FROM_ADDRESS not configured; skipping gas estimation';
    }

    return c.json<APIResponse>({
      success: true,
      data: {
        superRoot,
        anchor: {
          anchorHash: anchor.anchorHash,
          canonicalLength: anchor.canonical.length,
          msgLength: anchor.msg_b64u.length,
          timestamp: anchor.timestamp
        },
        payload: { dataHexLength: dataHex.length },
        rpc: rpcResults
      }
    });
  } catch (error: any) {
    return c.json<APIResponse>({ success: false, error: error?.message || 'Verification failed' }, 500);
  }
});

// Admin: get system Ethereum wallet info (address only, no secrets)
vdcHandler.get('/ethereum/wallet', async (c) => {
  try {
    // Accept either session-based admin auth or admin secret header
    let isAdmin = false;
    const user = await authenticateUser(c);
    if (user && user.accountType === 'admin') {
      isAdmin = true;
    } else {
      const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
      const authError = ensureAdminAccess(c, adminSecret);
      if (!authError) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }

    const env = c.env as Environment;
    const address = (env as any).SYSTEM_ETH_FROM_ADDRESS as string | undefined;
    const configured = !!((env as any).SYSTEM_ETH_PRIVATE_KEY || (env as any).SYSTEM_ETH_PRIVATE_KEY_PART1 || (env as any).SYSTEM_ETH_PRIVATE_KEY_PART2);

    return c.json<APIResponse>({ success: true, data: { address: address || null, configured } });
  } catch (error: any) {
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to retrieve wallet info' }, 500);
  }
});

// Admin: compute super-root over all existing blocks using Maatara Core (fallback to local SHA-256)
vdcHandler.get('/ethereum/super-root', async (c) => {
  try {
    // Accept either session-based admin auth or admin secret header
    let isAdmin = false;
    const user = await authenticateUser(c);
    if (user && user.accountType === 'admin') {
      isAdmin = true;
    } else {
      const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
      const authError = ensureAdminAccess(c, adminSecret);
      if (!authError) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }

    const env = c.env as Environment;
    const latestData = await env.VERITAS_KV.get('vdc:latest');
    if (!latestData) return c.json<APIResponse>({ success: false, error: 'Chain not initialized' }, 400);
    const latest = JSON.parse(latestData) as { blockNumber: number };
    const latestBlockNumber = latest.blockNumber;

    // Walk blocks and gather their canonical hashes
    const hashes: string[] = [];
    for (let i = 0; i <= latestBlockNumber; i++) {
      const blockStr = await env.VERITAS_KV.get(`vdc:block:${i}`);
      if (!blockStr) {
        return c.json<APIResponse>({ success: false, error: `Block ${i} not found in KV (try maintenance rebuild)` }, 500);
      }
      const block = JSON.parse(blockStr);
      if (!block || !block.hash) {
        return c.json<APIResponse>({ success: false, error: `Block ${i} missing hash` }, 500);
      }
      hashes.push(String(block.hash));
    }

    // Compute super-root via Maatara Core (with local fallback baked in)
    const maatara = new MaataraClient(env);
    const superRoot = await maatara.computeSuperRoot(hashes);
    return c.json<APIResponse>({ success: true, data: { superRoot, latestBlockNumber, count: hashes.length } });
  } catch (error: any) {
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to compute super-root' }, 500);
  }
});

// Admin: test fetching first byte via storage gateway for a given CID
vdcHandler.get('/ipfs/test/:cid', async (c) => {
  try {
    // Accept either session-based admin auth or admin secret header
    let isAdmin = false;
    const user = await authenticateUser(c);
    if (user && user.accountType === 'admin') {
      isAdmin = true;
    } else {
      const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
      const authError = ensureAdminAccess(c, adminSecret);
      if (!authError) {
        isAdmin = true;
      }
    }

    if (!isAdmin) {
      return c.json({ success: false, error: 'Admin access required' }, 403);
    }

    const { cid } = c.req.param();
    if (!cid) return c.json<APIResponse>({ success: false, error: 'cid required' }, 400);

    const env = c.env as Environment;
    const base = env.IPFS_GATEWAY_URL || 'https://storage.ma-atara.io';
    const url = `${base}/ipfs/${cid}`;
    const controller = new AbortController();
    const started = Date.now();
    let headOk = false; let headStatus: number | undefined;
    try {
      const h = await fetch(url, { method: 'HEAD', signal: controller.signal });
      headOk = h.ok; headStatus = h.status;
      if (headOk) {
        return c.json<APIResponse>({ success: true, data: { url, method: 'HEAD', status: headStatus, elapsedMs: Date.now() - started } });
      }
    } catch {}
    // Fallback to GET with a range to minimize bytes
    const g = await fetch(url, { method: 'GET', headers: { 'Range': 'bytes=0-0', 'Accept': '*/*' }, signal: controller.signal });
    const elapsed = Date.now() - started;
    const ok = g.ok;
    return c.json<APIResponse>({ success: ok, data: { url, method: 'GET', status: g.status, elapsedMs: elapsed } }, ok ? 200 : 502);
  } catch (error: any) {
    return c.json<APIResponse>({ success: false, error: error?.message || 'CID test failed' }, 500);
  }
});
// Admin endpoint: migrate all blocks missing storage/ipfs metadata
vdcHandler.post('/migrate-missing-storage', async (c) => {
  let body: any = {};
  try {
    if (c.req.header('content-type')?.includes('application/json')) {
      body = await c.req.json();
    }
  } catch {}

  const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), body);
  const authError = ensureAdminAccess(c, adminSecret);
  if (authError) return authError;

  try {
    const env = c.env as Environment;
    const vdc = await initializeVDC(env);

    const latestData = await env.VERITAS_KV.get('vdc:latest');
    if (!latestData) {
      return c.json<APIResponse>({ success: false, error: 'Chain not initialized' }, 400);
    }
    const latest = JSON.parse(latestData);
    const latestBlockNumber = latest.blockNumber as number;

    let migrated = 0;
    const details: Array<{ block: number; r2Key?: string; ipfsHash?: string; skipped?: boolean; error?: string }> = [];

    for (let i = 0; i <= latestBlockNumber; i++) {
      try {
        const block = await vdc.getBlock(i);
        if (!block) {
          details.push({ block: i, error: 'not found' });
          continue;
        }
        const missing = !block.storage?.r2Key || !block.ipfsHash || !block.storage?.ipfsHash;
        if (!missing) {
          details.push({ block: i, skipped: true, r2Key: block.storage?.r2Key, ipfsHash: block.ipfsHash });
          continue;
        }
        const storageResult = await storeChainBlock(env, i, block);
        if (!storageResult.success) {
          details.push({ block: i, error: storageResult.error || 'storage failed' });
          continue;
        }
        block.ipfsHash = storageResult.ipfsHash;
        block.storage = {
          r2Key: storageResult.r2Key!,
          storedAt: storageResult.storedAt,
          ipfsHash: storageResult.ipfsHash,
          ipfsGatewayUrl: storageResult.ipfsGatewayUrl,
          ipfsPinned: true
        };
        await env.VERITAS_KV.put(`vdc:block:${i}`, JSON.stringify(block));
        migrated++;
        details.push({ block: i, r2Key: storageResult.r2Key, ipfsHash: storageResult.ipfsHash });
      } catch (err: any) {
        details.push({ block: i, error: err?.message || 'error' });
      }
    }

    return c.json<APIResponse>({ success: true, data: { latestBlockNumber, migrated, details } });
  } catch (error: any) {
    console.error('Migrate missing storage error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to migrate blocks' }, 500);
  }
});

vdcHandler.get('/stats', async (c) => {
  try {
    const vdc = await initializeVDC(c.env);
    const stats = await vdc.getStats();

    return c.json<APIResponse>({ success: true, data: stats });
  } catch (error: any) {
    console.error('VDC stats error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to retrieve stats' }, 500);
  }
});

vdcHandler.get('/blocks/:blockNumber', async (c) => {
  const blockParam = c.req.param('blockNumber');
  const blockNumber = parseInt(blockParam, 10);

  if (Number.isNaN(blockNumber) || blockNumber < 0) {
    return c.json<APIResponse>({ success: false, error: 'Invalid block number' }, 400);
  }

  try {
    const vdc = await initializeVDC(c.env);
    const block = await vdc.getBlock(blockNumber);

    if (!block) {
      return c.json<APIResponse>({ success: false, error: 'Block not found' }, 404);
    }

    return c.json<APIResponse>({ success: true, data: block });
  } catch (error: any) {
    console.error('VDC get block error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to retrieve block' }, 500);
  }
});

// Migrate block from KV to R2 + IPFS
vdcHandler.post('/migrate-block/:blockNumber', async (c) => {
  const blockParam = c.req.param('blockNumber');
  const blockNumber = parseInt(blockParam, 10);

  if (Number.isNaN(blockNumber) || blockNumber < 0) {
    return c.json<APIResponse>({ success: false, error: 'Invalid block number' }, 400);
  }

  try {
    const vdc = await initializeVDC(c.env);
    const block = await vdc.getBlock(blockNumber);

    if (!block) {
      return c.json<APIResponse>({ success: false, error: 'Block not found' }, 404);
    }

    // Check if already migrated
    if (block.storage?.r2Key && block.ipfsHash) {
      return c.json<APIResponse>({
        success: true,
        data: {
          blockNumber,
          alreadyMigrated: true,
          r2Key: block.storage.r2Key,
          ipfsHash: block.ipfsHash,
          ipfsGatewayUrl: block.storage.ipfsGatewayUrl
        }
      });
    }

    // Store using unified storage layer (KV + R2 + IPFS)
    console.log(`Migrating block #${blockNumber} to R2 + IPFS...`);
    const storageResult = await storeChainBlock(c.env, blockNumber, block);

    if (!storageResult.success) {
      throw new Error(storageResult.error || 'Storage failed');
    }

    // Update block in KV with new storage metadata
    block.storage = {
      r2Key: storageResult.r2Key!,
      storedAt: storageResult.storedAt,
      ipfsHash: storageResult.ipfsHash,
      ipfsGatewayUrl: storageResult.ipfsGatewayUrl,
      ipfsPinned: true
    };
    block.ipfsHash = storageResult.ipfsHash;

    await c.env.VERITAS_KV.put(`vdc:block:${blockNumber}`, JSON.stringify(block));

    console.log(`✅ Block #${blockNumber} migrated successfully`);
    console.log(`   R2: ${storageResult.r2Key}`);
    console.log(`   IPFS: ${storageResult.ipfsHash || 'pending'}`);

    return c.json<APIResponse>({
      success: true,
      data: {
        blockNumber,
        r2Key: storageResult.r2Key,
        ipfsHash: storageResult.ipfsHash,
        ipfsGatewayUrl: storageResult.ipfsGatewayUrl,
        storedAt: storageResult.storedAt
      }
    });
  } catch (error: any) {
    console.error(`VDC migrate block #${blockNumber} error:`, error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error?.message || 'Failed to migrate block' 
    }, 500);
  }
});

// Get block info (alias for /blocks/:blockNumber)
vdcHandler.get('/block/:blockNumber', async (c) => {
  const blockParam = c.req.param('blockNumber');
  const blockNumber = parseInt(blockParam, 10);

  if (Number.isNaN(blockNumber) || blockNumber < 0) {
    return c.json<APIResponse>({ success: false, error: 'Invalid block number' }, 400);
  }

  try {
    const vdc = await initializeVDC(c.env);
    const block = await vdc.getBlock(blockNumber);

    if (!block) {
      return c.json<APIResponse>({ success: false, error: 'Block not found' }, 404);
    }

    return c.json<APIResponse>({ success: true, data: block });
  } catch (error: any) {
    console.error('VDC get block error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to retrieve block' }, 500);
  }
});

vdcHandler.get('/transactions/:txId', async (c) => {
  const txId = c.req.param('txId');

  if (!txId) {
    return c.json<APIResponse>({ success: false, error: 'Transaction ID is required' }, 400);
  }

  try {
    const vdc = await initializeVDC(c.env);
    const transaction = await vdc.getTransaction(txId);

    if (!transaction) {
      return c.json<APIResponse>({ success: false, error: 'Transaction not found' }, 404);
    }

    return c.json<APIResponse>({ success: true, data: transaction });
  } catch (error: any) {
    console.error('VDC get transaction error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to retrieve transaction' }, 500);
  }
});

vdcHandler.post('/admin/actions', async (c) => {
  const body = await c.req.json();
  const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), body);

  const authError = ensureAdminAccess(c, adminSecret);
  if (authError) {
    return authError;
  }

  const { action, payload, autoMine } = body || {};

  if (!action || typeof action !== 'string') {
    return c.json<APIResponse>({ success: false, error: 'Action name is required' }, 400);
  }

  try {
    const vdc = await initializeVDC(c.env);
    const { transaction, pendingCount } = await vdc.addAdminAction(action, payload || {});

    let minedBlock = null;
    if (autoMine) {
      try {
        minedBlock = await vdc.mineBlock();
      } catch (mineError: any) {
        console.warn('VDC admin autoMine failed:', mineError?.message || mineError);
      }
    }

    return c.json<APIResponse>({
      success: true,
      data: {
        transaction,
        pendingCount,
        minedBlock
      }
    });
  } catch (error: any) {
    console.error('VDC admin action error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to queue admin action' }, 500);
  }
});

vdcHandler.post('/mine', async (c) => {
  try {
    // Authenticate user via session token
    const user = await authenticateUser(c);
    if (!user) {
      return c.json<APIResponse>({ success: false, error: 'Authentication required' }, 401);
    }

    // Check if user is admin
    if (user.accountType !== 'admin') {
      return c.json<APIResponse>({ success: false, error: 'Forbidden: Admin access required' }, 403);
    }

    const vdc = await initializeVDC(c.env);
    const block = await vdc.mineBlock();

    return c.json<APIResponse>({
      success: true,
      data: {
        block,
        pendingTransactions: 0
      }
    });
  } catch (error: any) {
    const message = error?.message || 'Failed to mine block';

    if (message.includes('No pending transactions')) {
      return c.json<APIResponse>({ success: false, error: message }, 400);
    }

    console.error('VDC mine error:', error);
    return c.json<APIResponse>({ success: false, error: message }, 500);
  }
});

// Get pending VDC transactions (using VDC standard prefix)
vdcHandler.get('/pending', async (c) => {
  try {
    const vdc = await initializeVDC(c.env);
    const transactions = await vdc.getPendingTransactions();

    return c.json<APIResponse>({
      success: true,
      data: {
        count: transactions.length,
        transactions
      }
    });
  } catch (error: any) {
    console.error('VDC pending transactions error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to get pending transactions' }, 500);
  }
});

vdcHandler.post('/debug/kv', async (c) => {
  const body = await c.req.json();
  const { key, value } = body || {};

  if (!key || !value) {
    return c.json<APIResponse>({ success: false, error: 'Key and value are required' }, 400);
  }

  try {
    await c.env.VERITAS_KV.put(key, value);
    return c.json<APIResponse>({ success: true, message: `Set ${key}` });
  } catch (error: any) {
    console.error('VDC debug kv error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to set KV' }, 500);
  }
});

// Diagnostic endpoint to check KV namespace and asset location
vdcHandler.get('/debug/find-asset/:assetId', async (c) => {
  try {
    const assetId = c.req.param('assetId');
    const env = c.env;
    
    // Try different key patterns
    const patterns = [
      `asset:${assetId}`,
      assetId,
      `asset_${assetId}`,
      `web3_asset:${assetId}`
    ];
    
    const results: any = {};
    
    for (const pattern of patterns) {
      const value = await env.VERITAS_KV.get(pattern);
      if (value) {
        results[pattern] = JSON.parse(value);
      }
    }
    
    return c.json<APIResponse>({
      success: true,
      data: {
        assetId,
        found: Object.keys(results).length > 0,
        results
      }
    });
  } catch (error: any) {
    console.error('Find asset error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Failed to find asset' }, 500);
  }
});

// Admin endpoint to manually update mined asset with block number
vdcHandler.post('/admin/fix-mined-asset', async (c) => {
  try {
    const body = await c.req.json();
    const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), body);
    const authError = ensureAdminAccess(c, adminSecret);
    if (authError) return authError;
    
    const { assetId, blockNumber } = body;
    
    if (!assetId || blockNumber === undefined) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'assetId and blockNumber are required' 
      }, 400);
    }
    
    const env = c.env;
    
    // Try to find the asset
    const assetKey = `asset:${assetId}`;
    const assetData = await env.VERITAS_KV.get(assetKey);
    
    if (!assetData) {
      return c.json<APIResponse>({ 
        success: false, 
        error: `Asset not found: ${assetKey}` 
      }, 404);
    }
    
    const asset = JSON.parse(assetData);
    
    // Update with block number
    asset.vdcBlockNumber = blockNumber;
    asset.status = 'confirmed';
    asset.minedAt = Date.now();
    
    // Save back to KV
    await env.VERITAS_KV.put(assetKey, JSON.stringify(asset));
    
    console.log(`✅ Fixed mined asset ${assetId} with block number ${blockNumber}`);
    
    return c.json<APIResponse>({
      success: true,
      data: {
        assetId,
        blockNumber,
        updatedAsset: asset
      }
    });
  } catch (error: any) {
    console.error('Fix mined asset error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error?.message || 'Failed to fix mined asset' 
    }, 500);
  }
});

// Admin endpoint to delete a pending transaction
vdcHandler.delete('/transaction/:txId', async (c) => {
  try {
    const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
    const authError = ensureAdminAccess(c, adminSecret);
    if (authError) return authError;
    
    const txId = c.req.param('txId');
    const vdc = await initializeVDC(c.env);
    const { transaction: deletedTx, remainingCount } = await vdc.removePendingTransaction(txId);

    if (!deletedTx) {
      return c.json<APIResponse>({
        success: false,
        error: `Transaction not found: ${txId}`
      }, 404);
    }

    console.log(`✅ Deleted pending transaction ${txId}, new count: ${remainingCount}`);
    
    return c.json<APIResponse>({
      success: true,
      data: {
        deletedTransaction: deletedTx,
        remainingCount
      }
    });
  } catch (error: any) {
    console.error('Delete transaction error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error?.message || 'Failed to delete transaction' 
    }, 500);
  }
});

// Diagnostic endpoint to check IPFS configuration (admin only)
vdcHandler.get('/ipfs-config', async (c) => {
  try {
    const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
    const authError = ensureAdminAccess(c, adminSecret);
    if (authError) return authError;

    const env = c.env;
    
    return c.json<APIResponse>({
      success: true,
      data: {
        pinataApiKeyConfigured: !!env.PINATA_API_KEY,
        pinataSecretKeyConfigured: !!env.PINATA_SECRET_KEY,
        ipfsGatewayUrl: env.IPFS_GATEWAY_URL,
        // Show first 4 chars of API key if configured (for verification)
        pinataApiKeyPrefix: env.PINATA_API_KEY ? env.PINATA_API_KEY.substring(0, 4) + '...' : 'NOT_SET'
      }
    });
  } catch (error: any) {
    console.error('IPFS config check error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error?.message || 'Failed to check IPFS config' 
    }, 500);
  }
});

// Rebuild transaction indexes by scanning all blocks (admin only)
vdcHandler.post('/rebuild-indexes', async (c) => {
  try {
    const user = await authenticateUser(c);
    if (!user || user.accountType !== 'admin') {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Admin access required' 
      }, 403);
    }

    const env = c.env;
    const vdc = await initializeVDC(env);
    
    console.log('🔧 Starting transaction index rebuild...');
    
    let totalBlocks = 0;
    let totalTransactions = 0;
    let errors = 0;

    // Scan up to 200 blocks
    for (let blockNumber = 0; blockNumber < 200; blockNumber++) {
      const block = await vdc.getBlock(blockNumber);
      
      if (!block) {
        // No more blocks
        break;
      }
      
      totalBlocks++;
      console.log(`📦 Indexing block ${blockNumber} (${block.transactions?.length || 0} transactions)...`);
      
      if (block.transactions && Array.isArray(block.transactions)) {
        for (const tx of block.transactions) {
          try {
            await env.VERITAS_KV.put(
              `vdc:tx:${tx.id}`,
              JSON.stringify({
                blockNumber: blockNumber,
                blockHash: block.hash,
                txId: tx.id,
                type: tx.type,
                timestamp: tx.timestamp
              })
            );
            totalTransactions++;
          } catch (txError) {
            console.error(`❌ Failed to index tx ${tx.id}:`, txError);
            errors++;
          }
        }
      }
    }

    console.log(`✅ Index rebuild complete: ${totalTransactions} transactions indexed across ${totalBlocks} blocks`);
    
    return c.json<APIResponse>({
      success: true,
      data: {
        blocksScanned: totalBlocks,
        transactionsIndexed: totalTransactions,
        errors: errors
      }
    });
  } catch (error: any) {
    console.error('Rebuild indexes error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error?.message || 'Failed to rebuild indexes' 
    }, 500);
  }
});

export default vdcHandler;

// --- Maintenance: verify chain, sync storage tiers, rebuild tx index, log results ---
vdcHandler.post('/maintenance/run', async (c) => {
  try {
    // Prefer session-based admin auth
    const user = await authenticateUser(c);
    if (!user || user.accountType !== 'admin') {
      return c.json<APIResponse>({ success: false, error: 'Admin access required' }, 403);
    }

    const env = c.env as Environment;
    const vdc = await initializeVDC(env);
    const ipfs = new IPFSClient(env);
    // Accept relaxed verify mode and verbosity from request body (defaults: false)
    let relaxed = false;
    try {
      const body = await c.req.json();
      if (body && typeof body.relaxed === 'boolean') relaxed = body.relaxed;
    } catch {}

    const latestData = await env.VERITAS_KV.get('vdc:latest');
    if (!latestData) {
      return c.json<APIResponse>({ success: false, error: 'Chain not initialized' }, 400);
    }

    const latest = JSON.parse(latestData) as { blockNumber: number };
    const latestBlockNumber = latest.blockNumber;

    const results: any[] = [];
    let verified = 0, repaired = 0, errors = 0;

    for (let i = 0; i <= latestBlockNumber; i++) {
      const entry: any = { block: i, steps: [] };
      try {
        entry.steps.push(`block ${i}: start`);
        // Fetch from KV
        let kvBlockRaw = await env.VERITAS_KV.get(`vdc:block:${i}`);
        let kvBlock = kvBlockRaw ? JSON.parse(kvBlockRaw) : null;
        entry.steps.push(`block ${i}: KV ${kvBlock ? 'found' : 'missing'}`);

        // Fetch from R2
        let r2Block: any = null;
        const r2Obj = await env.VDC_STORAGE.get(`blocks/${i}.json`);
        if (r2Obj) {
          const r2Data = await r2Obj.json() as any;
          r2Block = r2Data.data || r2Data;
        }
        entry.steps.push(`block ${i}: R2 ${r2Block ? 'found' : 'missing'}`);

        // Fetch from IPFS if ipfsHash is known (prefer KV hash, fallback R2)
        let ipfsBlock: any = null;
        const ipfsHash = (kvBlock && kvBlock.ipfsHash) || (r2Block && r2Block.ipfsHash) || null;
        if (ipfsHash) {
          try {
            const ipfsText = await ipfs.retrieveFromIPFS(ipfsHash);
            ipfsBlock = JSON.parse(ipfsText);
            if (ipfsBlock && ipfsBlock.data) ipfsBlock = ipfsBlock.data;
          } catch {}
        }
        entry.steps.push(`block ${i}: IPFS ${ipfsBlock ? 'found' : (ipfsHash ? 'hash-known-not-fetched' : 'hash-unknown')}`);

        // Choose best candidate that verifies
        const candidates = [kvBlock, r2Block, ipfsBlock].filter(Boolean) as any[];
        let good: any = null;
        for (const cand of candidates) {
          if (!cand) continue;
          entry.steps.push(`block ${i}: verifying candidate from ${cand === kvBlock ? 'KV' : cand === r2Block ? 'R2' : 'IPFS'}`);
          const ok = await vdc.verifyBlock(cand, { relaxed, log: (m) => entry.steps.push(`block ${i}: ${m}`) });
          if (ok) { good = cand; break; }
        }

        // If none verify, try fallback: getBlock (which may restore from tiers)
        if (!good) {
          entry.steps.push(`block ${i}: attempting fallback getBlock()`);
          const fetched = await vdc.getBlock(i);
          if (fetched && await vdc.verifyBlock(fetched, { relaxed, log: (m) => entry.steps.push(`block ${i}: ${m}`) })) {
            good = fetched;
          }
        }

        if (!good) {
          entry.status = 'error';
          entry.message = 'No valid copy found or verification failed';
          errors++;
          results.push(entry);
          continue;
        }

        entry.status = 'verified';
        verified++;
        entry.steps.push(`block ${i}: verification ${relaxed ? 'OK (relaxed)' : 'OK'}`);

        // Repair missing/corrupted tiers by re-storing canonical block
  const needKV = !kvBlockRaw || !(await vdc.verifyBlock(kvBlock, { relaxed, log: (m) => entry.steps.push(`block ${i}: ${m}`) }));
  const needR2 = !r2Block || !(await vdc.verifyBlock(r2Block, { relaxed, log: (m) => entry.steps.push(`block ${i}: ${m}`) }));
        const needIPFS = !ipfsHash;

        if (needKV || needR2 || needIPFS) {
          entry.steps.push(`block ${i}: repairing tiers -> KV:${needKV} R2:${needR2} IPFS:${needIPFS}`);
          const storeRes = await storeChainBlock(env, i, good);
          if (!storeRes.success) {
            entry.repair = { success: false, error: storeRes.error };
          } else {
            entry.repair = {
              success: true,
              r2Key: storeRes.r2Key,
              ipfsHash: storeRes.ipfsHash,
              ipfsGatewayUrl: storeRes.ipfsGatewayUrl
            };
            repaired++;
            entry.steps.push(`block ${i}: repair OK (r2Key=${storeRes.r2Key}, ipfs=${storeRes.ipfsHash})`);
          }
        }

        results.push(entry);
      } catch (err: any) {
        entry.status = 'error';
        entry.message = err?.message || 'Unknown error';
        errors++;
        results.push(entry);
      }
    }

    // Rebuild transaction index
    let indexed = 0, indexErrors = 0;
    for (let blockNumber = 0; blockNumber <= latestBlockNumber; blockNumber++) {
      const block = await vdc.getBlock(blockNumber);
      if (!block || !block.transactions) continue;
      for (const tx of block.transactions) {
        try {
          await env.VERITAS_KV.put(
            `vdc:tx:${tx.id}`,
            JSON.stringify({ blockNumber, blockHash: block.hash, txId: tx.id, type: tx.type, timestamp: tx.timestamp })
          );
          indexed++;
        } catch (txErr) {
          indexErrors++;
        }
      }
    }

    // Compose log
    const log = {
      startedAt: Date.now(),
      latestBlockNumber,
      summary: { verified, repaired, errors, indexed, indexErrors },
      mode: relaxed ? 'relaxed' : 'strict',
      results
    };

    // Store log to R2 and index in KV
    const logId = `maint_${Date.now()}`;
    const logKey = `maintenance/logs/${logId}.json`;
    await env.VDC_STORAGE.put(logKey, JSON.stringify(log, null, 2), {
      httpMetadata: { contentType: 'application/json' },
      customMetadata: { logId, createdAt: Date.now().toString() }
    });

    const indexKey = 'maintenance:logs:index';
    const existingIndex = await env.VERITAS_KV.get(indexKey);
    const list = existingIndex ? JSON.parse(existingIndex) : [];
    list.unshift({ id: logId, r2Key: logKey, createdAt: Date.now(), size: JSON.stringify(log).length });
    if (list.length > 100) list.length = 100;
    await env.VERITAS_KV.put(indexKey, JSON.stringify(list));

    // Queue pending maintenance log admin action (to be mined later)
    try {
      // initializeVDC already above, so reuse instance method
      const { transaction } = await vdc.addAdminAction('maintenance_log', {
        logId,
        r2Key: logKey,
        summary: log.summary
      });
      // Record the queued tx id in KV for quick reference
      await env.VERITAS_KV.put(`maintenance:log:${logId}:tx`, transaction.id);
    } catch (queueErr) {
      // Non-fatal: logging only
      console.warn('Failed to queue maintenance_log admin action:', queueErr);
    }

    return c.json<APIResponse>({ success: true, data: { logId, r2Key: logKey, summary: log.summary } });
  } catch (error: any) {
    console.error('Maintenance run error:', error);
    return c.json<APIResponse>({ success: false, error: error?.message || 'Maintenance failed' }, 500);
  }
});

// List past maintenance logs (admin only)
vdcHandler.get('/maintenance/logs', async (c) => {
  const user = await authenticateUser(c);
  if (!user || user.accountType !== 'admin') {
    return c.json<APIResponse>({ success: false, error: 'Admin access required' }, 403);
  }
  const env = c.env as Environment;
  const indexKey = 'maintenance:logs:index';
  const existingIndex = await env.VERITAS_KV.get(indexKey);
  const list = existingIndex ? JSON.parse(existingIndex) : [];
  return c.json<APIResponse>({ success: true, data: list });
});

// Download a specific maintenance log (admin only)
vdcHandler.get('/maintenance/logs/:id', async (c) => {
  const user = await authenticateUser(c);
  if (!user || user.accountType !== 'admin') {
    return c.json<APIResponse>({ success: false, error: 'Admin access required' }, 403);
  }
  const env = c.env as Environment;
  const id = c.req.param('id');
  const indexKey = 'maintenance:logs:index';
  const existingIndex = await env.VERITAS_KV.get(indexKey);
  const list = existingIndex ? JSON.parse(existingIndex) : [];
  const item = list.find((x: any) => x.id === id);
  if (!item) return c.json<APIResponse>({ success: false, error: 'Log not found' }, 404);
  const obj = await env.VDC_STORAGE.get(item.r2Key);
  if (!obj) return c.json<APIResponse>({ success: false, error: 'Log object not found' }, 404);
  const text = await obj.text();
  return new Response(text, { headers: { 'Content-Type': 'application/json' } });
});
