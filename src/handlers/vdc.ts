import { Hono } from 'hono';
import { Environment, APIResponse, User } from '../types';
import { initializeVDC } from '../utils/blockchain';
import { storeChainBlock } from '../utils/store';

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

export default vdcHandler;
