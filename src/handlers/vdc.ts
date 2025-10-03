import { Hono } from 'hono';
import { Environment, APIResponse } from '../types';
import { initializeVDC } from '../utils/blockchain';

const vdcHandler = new Hono<{ Bindings: Environment }>();

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
  let body: any = {};

  try {
    if (c.req.header('content-type')?.includes('application/json')) {
      body = await c.req.json();
    }
  } catch (error) {
    console.warn('VDC mine: unable to parse body, continuing with header secret only');
  }

  const adminSecret = extractAdminSecret(c.req.header('x-admin-secret'), body);
  const authError = ensureAdminAccess(c, adminSecret);
  if (authError) {
    return authError;
  }

  try {
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

export default vdcHandler;
