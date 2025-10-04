/**
 * Storage Verification and Rehydration Handler
 * 
 * Ensures all VDC blocks are present in all three storage tiers:
 * - KV (source of truth)
 * - R2 (durable cloud storage)
 * - IPFS (decentralized verification)
 * 
 * Rehydrates missing data from available sources.
 */

import { Hono } from 'hono';
import { Environment, APIResponse } from '../types';
import { initializeVDC } from '../utils/blockchain';
import { storeChainBlock } from '../utils/store';
import { IPFSClient } from '../utils/ipfs';

const storageVerifyHandler = new Hono<{ Bindings: Environment }>();

interface BlockVerificationResult {
  blockNumber: number;
  kv: { present: boolean; hash?: string; error?: string };
  r2: { present: boolean; hash?: string; error?: string };
  ipfs: { present: boolean; hash?: string; error?: string };
  rehydrated: {
    kv?: boolean;
    r2?: boolean;
    ipfs?: boolean;
  };
  status: 'ok' | 'partial' | 'rehydrated' | 'failed';
  message?: string;
}

interface VerificationSummary {
  totalBlocks: number;
  verified: number;
  rehydrated: number;
  failed: number;
  results: BlockVerificationResult[];
  duration: number;
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
    console.error('Admin access attempted without ADMIN_SECRET_KEY configured');
    return c.json({ success: false, error: 'Server configuration error' } as APIResponse, 500);
  }

  if (!providedSecret || providedSecret !== env.ADMIN_SECRET_KEY) {
    return c.json({ success: false, error: 'Unauthorized' } as APIResponse, 401);
  }

  return null;
}

/**
 * Verify a single block across all storage tiers
 */
async function verifyBlock(
  env: Environment,
  blockNumber: number
): Promise<BlockVerificationResult> {
  const result: BlockVerificationResult = {
    blockNumber,
    kv: { present: false },
    r2: { present: false },
    ipfs: { present: false },
    rehydrated: {},
    status: 'ok'
  };

  let kvBlock: any = null;
  let r2Block: any = null;
  let ipfsBlock: any = null;

  // 1. Check KV (source of truth)
  try {
    const kvData = await env.VERITAS_KV.get(`vdc:block:${blockNumber}`);
    if (kvData) {
      kvBlock = JSON.parse(kvData);
      result.kv.present = true;
      result.kv.hash = kvBlock.hash;
    }
  } catch (error) {
    result.kv.error = error instanceof Error ? error.message : 'Unknown error';
  }

  // 2. Check R2
  if (env.VDC_STORAGE) {
    try {
      const r2Object = await env.VDC_STORAGE.get(`blocks/${blockNumber}.json`);
      if (r2Object) {
        const r2Text = await r2Object.text();
        r2Block = JSON.parse(r2Text);
        result.r2.present = true;
        result.r2.hash = r2Block.hash;
      }
    } catch (error) {
      result.r2.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  // 3. Check IPFS (if hash is known)
  const ipfsHash = kvBlock?.ipfsHash || r2Block?.ipfsHash;
  if (ipfsHash && ipfsHash.startsWith('Qm')) {
    try {
      const ipfsClient = new IPFSClient(env);
      const ipfsData = await ipfsClient.retrieveFromIPFS(ipfsHash);
      ipfsBlock = JSON.parse(ipfsData);
      result.ipfs.present = true;
      result.ipfs.hash = ipfsBlock.hash;
    } catch (error) {
      result.ipfs.error = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  // 4. Determine status and rehydrate if needed
  const presenceCount = [result.kv.present, result.r2.present, result.ipfs.present].filter(Boolean).length;

  if (presenceCount === 0) {
    result.status = 'failed';
    result.message = 'Block not found in any storage tier';
    return result;
  }

  if (presenceCount === 3) {
    result.status = 'ok';
    result.message = 'Block present in all storage tiers';
    return result;
  }

  // Rehydration needed - use KV as source of truth, then R2, then IPFS
  const sourceBlock = kvBlock || r2Block || ipfsBlock;
  
  if (!sourceBlock) {
    result.status = 'failed';
    result.message = 'No valid source block found for rehydration';
    return result;
  }

  result.status = 'partial';
  let rehydrated = false;

  // Rehydrate KV if missing (critical - source of truth)
  if (!result.kv.present && sourceBlock) {
    try {
      await env.VERITAS_KV.put(`vdc:block:${blockNumber}`, JSON.stringify(sourceBlock));
      result.rehydrated.kv = true;
      result.kv.present = true;
      result.kv.hash = sourceBlock.hash;
      rehydrated = true;
      console.log(`✅ Rehydrated KV for block ${blockNumber}`);
    } catch (error) {
      console.error(`❌ Failed to rehydrate KV for block ${blockNumber}:`, error);
    }
  }

  // Rehydrate R2 if missing
  if (!result.r2.present && env.VDC_STORAGE && sourceBlock) {
    try {
      await env.VDC_STORAGE.put(`blocks/${blockNumber}.json`, JSON.stringify(sourceBlock, null, 2), {
        httpMetadata: { contentType: 'application/json' },
        customMetadata: {
          blockNumber: blockNumber.toString(),
          hash: sourceBlock.hash,
          rehydratedAt: Date.now().toString()
        }
      });
      result.rehydrated.r2 = true;
      result.r2.present = true;
      result.r2.hash = sourceBlock.hash;
      rehydrated = true;
      console.log(`✅ Rehydrated R2 for block ${blockNumber}`);
    } catch (error) {
      console.error(`❌ Failed to rehydrate R2 for block ${blockNumber}:`, error);
    }
  }

  // Rehydrate IPFS if missing (use unified storage layer)
  if (!result.ipfs.present && sourceBlock) {
    try {
      // Use storeChainBlock to ensure proper IPFS pinning
      const storageResult = await storeChainBlock(env, blockNumber, sourceBlock);
      if (storageResult.success && storageResult.ipfsHash) {
        result.rehydrated.ipfs = true;
        result.ipfs.present = true;
        result.ipfs.hash = sourceBlock.hash;
        rehydrated = true;
        
        // Update KV block with new IPFS hash
        sourceBlock.ipfsHash = storageResult.ipfsHash;
        sourceBlock.storage = sourceBlock.storage || {};
        sourceBlock.storage.ipfsHash = storageResult.ipfsHash;
        sourceBlock.storage.ipfsGatewayUrl = storageResult.ipfsGatewayUrl;
        await env.VERITAS_KV.put(`vdc:block:${blockNumber}`, JSON.stringify(sourceBlock));
        
        console.log(`✅ Rehydrated IPFS for block ${blockNumber}: ${storageResult.ipfsHash}`);
      }
    } catch (error) {
      console.error(`❌ Failed to rehydrate IPFS for block ${blockNumber}:`, error);
    }
  }

  if (rehydrated) {
    result.status = 'rehydrated';
    result.message = `Block rehydrated: ${Object.keys(result.rehydrated).join(', ')}`;
  } else {
    result.message = 'Block partially present, rehydration not needed';
  }

  return result;
}

/**
 * Verify all blocks in the blockchain
 */
storageVerifyHandler.post('/verify-all', async (c) => {
  try {
    const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
    const authError = ensureAdminAccess(c, adminSecret);
    if (authError) return authError;

    const startTime = Date.now();
    
    // Get blockchain stats
    const vdc = await initializeVDC(c.env);
    const stats = await vdc.getStats();
    
    if (!stats.initialized) {
      return c.json<APIResponse>({
        success: false,
        error: 'Blockchain not initialized'
      }, 400);
    }

    const totalBlocks = stats.latestBlock + 1; // Include genesis block (0)
    const results: BlockVerificationResult[] = [];
    let verified = 0;
    let rehydrated = 0;
    let failed = 0;

    console.log(`🔍 Starting verification of ${totalBlocks} blocks...`);

    // Verify each block
    for (let i = 0; i < totalBlocks; i++) {
      const result = await verifyBlock(c.env, i);
      results.push(result);

      if (result.status === 'ok') {
        verified++;
      } else if (result.status === 'rehydrated') {
        rehydrated++;
      } else if (result.status === 'failed') {
        failed++;
      }

      console.log(`Block ${i}: ${result.status}`);
    }

    const duration = Date.now() - startTime;

    const summary: VerificationSummary = {
      totalBlocks,
      verified,
      rehydrated,
      failed,
      results,
      duration
    };

    console.log(`✅ Verification complete in ${duration}ms`);
    console.log(`   Verified: ${verified}, Rehydrated: ${rehydrated}, Failed: ${failed}`);

    return c.json<APIResponse>({
      success: true,
      data: summary
    });

  } catch (error: any) {
    console.error('Verification error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error?.message || 'Failed to verify blocks' 
    }, 500);
  }
});

/**
 * Verify a single block
 */
storageVerifyHandler.post('/verify/:blockNumber', async (c) => {
  try {
    const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
    const authError = ensureAdminAccess(c, adminSecret);
    if (authError) return authError;

    const blockNumber = parseInt(c.req.param('blockNumber'), 10);
    
    if (Number.isNaN(blockNumber) || blockNumber < 0) {
      return c.json<APIResponse>({
        success: false,
        error: 'Invalid block number'
      }, 400);
    }

    const result = await verifyBlock(c.env, blockNumber);

    return c.json<APIResponse>({
      success: true,
      data: result
    });

  } catch (error: any) {
    console.error('Verification error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error?.message || 'Failed to verify block' 
    }, 500);
  }
});

/**
 * Get verification status for all blocks (quick check without rehydration)
 */
storageVerifyHandler.get('/status', async (c) => {
  try {
    const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), null);
    const authError = ensureAdminAccess(c, adminSecret);
    if (authError) return authError;

    const vdc = await initializeVDC(c.env);
    const stats = await vdc.getStats();
    
    if (!stats.initialized) {
      return c.json<APIResponse>({
        success: false,
        error: 'Blockchain not initialized'
      }, 400);
    }

    const totalBlocks = stats.latestBlock + 1;
    const quickStatus: any[] = [];

    for (let i = 0; i < totalBlocks; i++) {
      const kvData = await c.env.VERITAS_KV.get(`vdc:block:${i}`);
      const kvPresent = !!kvData;
      
      let r2Present = false;
      if (c.env.VDC_STORAGE) {
        const r2Object = await c.env.VDC_STORAGE.head(`blocks/${i}.json`);
        r2Present = !!r2Object;
      }

      let ipfsHash: string | undefined;
      if (kvData) {
        try {
          const block = JSON.parse(kvData);
          ipfsHash = block.ipfsHash;
        } catch (error) {
          // Ignore parse errors in quick check
        }
      }

      quickStatus.push({
        blockNumber: i,
        kv: kvPresent,
        r2: r2Present,
        ipfs: ipfsHash && ipfsHash.startsWith('Qm') ? ipfsHash : 'unknown',
        complete: kvPresent && r2Present && ipfsHash?.startsWith('Qm')
      });
    }

    return c.json<APIResponse>({
      success: true,
      data: {
        totalBlocks,
        blocks: quickStatus,
        summary: {
          complete: quickStatus.filter(b => b.complete).length,
          incomplete: quickStatus.filter(b => !b.complete).length
        }
      }
    });

  } catch (error: any) {
    console.error('Status check error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error?.message || 'Failed to check status' 
    }, 500);
  }
});

export default storageVerifyHandler;
