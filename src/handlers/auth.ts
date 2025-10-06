import { Hono } from 'hono';
import { Environment, OneTimeLink, User, APIResponse } from '../types';
import { MaataraClient, generateId, generateMnemonic } from '../utils/crypto';
import { initializeVDC, addUserToVDC } from '../utils/blockchain';
import { loadActivationLink, storeActivationLink } from '../utils/activation';

const authHandler = new Hono<{ Bindings: Environment }>();

const SESSION_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours
interface SessionRecord {
  userId: string;
  expiresAt: number;
}

async function createSession(env: Environment, userId: string): Promise<string> {
  const sessionToken = crypto.randomUUID();
  const expiresAt = Date.now() + SESSION_TTL_MS;

  const record: SessionRecord = {
    userId,
    expiresAt,
  };

  await env.VERITAS_KV.put(`session:${sessionToken}`, JSON.stringify(record), {
    expiration: Math.floor(expiresAt / 1000),
  });

  return sessionToken;
}

// Helper function to authenticate user from request headers
async function authenticateUser(c: any): Promise<User | null> {
  const env = c.env;
  const authHeader = c.req.header('Authorization');
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }
  
  const token = authHeader.substring(7); // Remove 'Bearer ' prefix

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
    console.error('Session authentication error:', error);
    return null;
  }
}

// Debug endpoint to check user status (remove in production)
authHandler.get('/debug-user/:email', async (c) => {
  try {
    const env = c.env;
    const email = c.req.param('email');

    console.log(`🔍 Debug lookup for email: ${email}`);

    const userId = await env.VERITAS_KV.get(`user:email:${email}`);
    if (!userId) {
      return c.json({ success: false, error: 'User not found', step: 'user_lookup' });
    }

    console.log(`✅ Found userId: ${userId}`);

    const userData = await env.VERITAS_KV.get(`user:${userId}`);
    if (!userData) {
      return c.json({ success: false, error: 'User data not found', step: 'user_data', userId });
    }

    const user: User = JSON.parse(userData);
    console.log(`✅ Found user data for: ${userId}`);

    const vdcTxId = await env.VERITAS_KV.get(`vdc:user:${userId}`);
    if (!vdcTxId) {
      return c.json({ success: false, error: 'VDC transaction mapping not found', step: 'vdc_mapping', userId, user: { id: user.id, email: user.email } });
    }

    console.log(`✅ Found VDC transaction ID: ${vdcTxId}`);

    const vdc = await initializeVDC(env);
    const vdcTx = await vdc.getTransaction(vdcTxId);
    if (!vdcTx) {
      return c.json({ success: false, error: 'VDC transaction data not found', step: 'vdc_transaction', userId, vdcTxId });
    }

    console.log(`✅ Found VDC transaction data`);

    const dilithiumPublicKey = vdcTx.data?.dilithiumPublicKey || user.dilithiumPublicKey;
    const hasEncryptedData = !!vdcTx.data?.encryptedUserData;

    return c.json({
      success: true,
      data: {
        userId,
        email: user.email,
        accountType: user.accountType,
        vdcTxId,
        vdcTxType: vdcTx.type,
        hasDilithiumKey: !!dilithiumPublicKey,
        hasEncryptedData,
        dilithiumKeyLength: dilithiumPublicKey?.length || 0
      }
    });
  } catch (error: any) {
    console.error('Debug error:', error);
    return c.json({ success: false, error: 'Debug endpoint error', details: error?.message || String(error) });
  }
});

// Get token info (for frontend to retrieve email)
authHandler.get('/token-info', async (c) => {
  try {
    const env = c.env;
    const token = c.req.query('token');
    
    if (!token) {
      return c.json<APIResponse>({ success: false, error: 'Token is required' }, 400);
    }
    
    // Get one-time link from R2 (with KV fallback)
    const oneTimeLink = await loadActivationLink(env, token);
    if (!oneTimeLink) {
      return c.json<APIResponse>({ success: false, error: 'Invalid or expired token' }, 400);
    }

    if (oneTimeLink.used) {
      return c.json<APIResponse>({ success: false, error: 'Token has already been used' }, 400);
    }

    if (oneTimeLink.expiresAt < Date.now()) {
      return c.json<APIResponse>({ success: false, error: 'Token has expired' }, 400);
    }

    return c.json<APIResponse>({
      success: true,
      data: { 
        email: oneTimeLink.email,
        inviteType: oneTimeLink.inviteType
      },
    });
  } catch (error) {
    console.error('Error getting token info:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});
authHandler.post('/create-link', async (c) => {
  try {
    const env = c.env;
    const { email, adminSecret } = await c.req.json();

    // Verify admin credentials
    if (adminSecret !== env.ADMIN_SECRET_KEY) {
      return c.json<APIResponse>({ success: false, error: 'Unauthorized' }, 401);
    }

    if (!email) {
      return c.json<APIResponse>({ success: false, error: 'Email is required' }, 400);
    }

    const linkId = generateId();
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

    const oneTimeLink: OneTimeLink = {
      id: linkId,
      token,
      createdBy: 'admin',
      inviteType: 'admin',
      email,
      expiresAt,
      used: false,
    };

  await storeActivationLink(env, oneTimeLink);

    const activationUrl = `${c.req.url.split('/api')[0]}/activate?token=${token}`;

    return c.json<APIResponse>({
      success: true,
      data: { activationUrl, expiresAt },
      message: 'One-time activation link created successfully',
    });
  } catch (error) {
    console.error('Error creating one-time link:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Admin endpoint - uses stored ADMIN_SECRET_KEY from environment
authHandler.post('/create-link-admin', async (c) => {
  try {
    const env = c.env;
    const { email, adminKey } = await c.req.json();

    console.log(`🔐 Admin endpoint called for email: ${email}`);
    
    // Verify the provided adminKey matches the stored ADMIN_SECRET_KEY
    if (!adminKey || adminKey !== env.ADMIN_SECRET_KEY) {
      console.log('❌ Unauthorized: Invalid admin key');
      return c.json<APIResponse>({ success: false, error: 'Unauthorized' }, 401);
    }

    if (!email) {
      return c.json<APIResponse>({ success: false, error: 'Email is required' }, 400);
    }

    const linkId = generateId();
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

    const oneTimeLink: OneTimeLink = {
      id: linkId,
      token,
      createdBy: 'admin',
      inviteType: 'admin',
      email,
      expiresAt,
      used: false,
    };

  await storeActivationLink(env, oneTimeLink);

    const activationUrl = `${c.req.url.split('/api')[0]}/activate?token=${token}`;

    console.log(`✅ Activation link created successfully`);

    return c.json<APIResponse>({
      success: true,
      data: { activationUrl, expiresAt, token },
      message: 'One-time activation link created successfully',
    });
  } catch (error) {
    console.error('❌ Error in create-link-admin:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, 500);
  }
});

// Admin endpoint to create a normal user invite (inviteType: 'user')
authHandler.post('/create-link-user-admin', async (c) => {
  try {
    const env = c.env;
    const { email, adminKey } = await c.req.json();

    console.log(`🔐 Admin create user-invite called for email: ${email}`);

    if (!adminKey || adminKey !== env.ADMIN_SECRET_KEY) {
      console.log('❌ Unauthorized: Invalid admin key');
      return c.json<APIResponse>({ success: false, error: 'Unauthorized' }, 401);
    }

    if (!email) {
      return c.json<APIResponse>({ success: false, error: 'Email is required' }, 400);
    }

    const linkId = generateId();
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

    const oneTimeLink: OneTimeLink = {
      id: linkId,
      token,
      createdBy: 'admin',
      inviteType: 'user',
      email,
      expiresAt,
      used: false,
    };

    await storeActivationLink(env, oneTimeLink);

    const activationUrl = `${c.req.url.split('/api')[0]}/activate?token=${token}`;

    console.log(`✅ User invite link created successfully`);
    return c.json<APIResponse>({
      success: true,
      data: { activationUrl, expiresAt, token },
      message: 'User invitation link created successfully',
    });
  } catch (error) {
    console.error('❌ Error in create-link-user-admin:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Internal server error' 
    }, 500);
  }
});

// Send invitation to create account (user endpoint)
authHandler.post('/send-invite', async (c) => {
  try {
    const env = c.env;
    const { email } = await c.req.json();

    if (!email) {
      return c.json<APIResponse>({ success: false, error: 'Email is required' }, 400);
    }

    // Authenticate the user
    const sender = await authenticateUser(c);
    if (!sender) {
      return c.json<APIResponse>({ success: false, error: 'Authentication required' }, 401);
    }

    // Check if user already exists
    const existingUserId = await env.VERITAS_KV.get(`user:email:${email}`);
    if (existingUserId) {
      return c.json<APIResponse>({ success: false, error: 'User with this email already exists' }, 400);
    }

  // TODO: Optionally scan existing invites for this email

    const linkId = generateId();
    const token = crypto.randomUUID();
  const expiresAt = Date.now() + (6 * 24 * 60 * 60 * 1000); // 6 days

    const oneTimeLink: OneTimeLink = {
      id: linkId,
      token,
      createdBy: sender.id,
      inviteType: 'user',
      email,
      expiresAt,
      used: false,
    };

  await storeActivationLink(env, oneTimeLink);

    const activationUrl = `${c.req.url.split('/api')[0]}/activate?token=${token}`;

    return c.json<APIResponse>({
      success: true,
      data: { activationUrl, expiresAt },
      message: 'Invitation sent successfully',
    });
  } catch (error) {
    console.error('Error sending invitation:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Admin (session-auth) endpoint to create invite of type 'admin' or 'user'
authHandler.post('/admin/create-invite', async (c) => {
  try {
    const env = c.env;
    const { email, inviteType } = await c.req.json();

    if (!email) {
      return c.json<APIResponse>({ success: false, error: 'Email is required' }, 400);
    }

    const sender = await authenticateUser(c);
    if (!sender) {
      return c.json<APIResponse>({ success: false, error: 'Authentication required' }, 401);
    }
    if (sender.accountType !== 'admin') {
      return c.json<APIResponse>({ success: false, error: 'Forbidden: Admins only' }, 403);
    }

    const linkId = generateId();
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + (6 * 24 * 60 * 60 * 1000); // 6 days
    const type: 'admin' | 'user' = inviteType === 'admin' ? 'admin' : 'user';

    const oneTimeLink: OneTimeLink = {
      id: linkId,
      token,
      createdBy: sender.id,
      inviteType: type,
      email,
      expiresAt,
      used: false,
    };

    await storeActivationLink(env, oneTimeLink);

    const activationUrl = `${c.req.url.split('/api')[0]}/activate?token=${token}`;

    return c.json<APIResponse>({
      success: true,
      data: { activationUrl, expiresAt, token, inviteType: type },
      message: 'Invitation created successfully',
    });
  } catch (error) {
    console.error('Error creating admin invite:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Activate account using one-time link
authHandler.post('/activate', async (c) => {
  try {
    const env = c.env;
    const { 
      token,
      kyberPublicKey,
      dilithiumPublicKey,
      encryptedUserData, // Already encrypted client-side
      signature
    } = await c.req.json();

    if (!token) {
      return c.json<APIResponse>({ success: false, error: 'Token is required' }, 400);
    }
    
    if (!kyberPublicKey || !dilithiumPublicKey) {
      return c.json<APIResponse>({ success: false, error: 'Both Kyber and Dilithium public keys are required' }, 400);
    }

    if (!encryptedUserData || !signature) {
      return c.json<APIResponse>({ success: false, error: 'Encrypted user data and signature are required' }, 400);
    }

    // Get one-time link
    const oneTimeLink = await loadActivationLink(env, token);
    if (!oneTimeLink) {
      return c.json<APIResponse>({ success: false, error: 'Invalid or expired token' }, 400);
    }

    if (oneTimeLink.used) {
      return c.json<APIResponse>({ success: false, error: 'Token has already been used' }, 400);
    }

    if (oneTimeLink.expiresAt < Date.now()) {
      return c.json<APIResponse>({ success: false, error: 'Token has expired' }, 400);
    }

    // Generate recovery phrase (BIP39 mnemonic)
    const recoveryPhrase = generateMnemonic();

    // Create user ID
    const userId = generateId();

    // Determine account type from invite (NOT user-definable!)
    const accountType = oneTimeLink.inviteType === 'admin' ? 'admin' : 
                       oneTimeLink.inviteType === 'user' ? 'invited' : 'paid';

    // Create Veritas blockchain transaction for user registration
    const blockchainTx = {
      // PLAINTEXT (public, searchable)
      type: 'user_registration',
      userId,
      email: oneTimeLink.email, // Email in plaintext for lookups
      kyberPublicKey,
      dilithiumPublicKey,
      accountType, // CRITICAL: Set from invite, NOT from user input
      timestamp: Date.now(),
      
      // ENCRYPTED (Kyber-wrapped, only user can decrypt with their private key)
      encryptedUserData, // Contains: email, personalDetails, preferences
      
      // SIGNATURE (Dilithium, proves authenticity)
      signature
    };

    // Initialize VDC blockchain
    const vdc = await initializeVDC(env);
    
    // Add user to VDC blockchain with dual signatures
    // This will verify the user signature AND add the system signature
    try {
      const txId = await addUserToVDC(
        vdc,
        userId,
        oneTimeLink.email,
        kyberPublicKey,
        dilithiumPublicKey,
        encryptedUserData,
        accountType,
        signature // User's signature will be verified inside addUserToVDC
      );
      
      console.log(`✅ User ${userId} added to VDC blockchain (tx: ${txId})`);
      
      // Store transaction reference in blockchain transaction object
      (blockchainTx as any).vdcTxId = txId;
      
      // CRITICAL: Store VDC transaction ID mapping for login lookup
      await env.VERITAS_KV.put(`vdc:user:${userId}`, txId);
      console.log(`✅ Stored VDC transaction mapping: vdc:user:${userId} -> ${txId}`);
    } catch (error: any) {
      console.error('VDC transaction error:', error);
      return c.json<APIResponse>({ 
        success: false, 
        error: `Blockchain transaction rejected: ${error?.message || 'Unknown error'}` 
      }, 401);
    }

    // Store the blockchain transaction in KV (will migrate to IPFS later)
    const kvTxId = `tx_${userId}_${Date.now()}`;
    await env.VERITAS_KV.put(`blockchain:tx:${kvTxId}`, JSON.stringify(blockchainTx));
    await env.VERITAS_KV.put(`blockchain:user:${userId}`, kvTxId); // Map user to their registration tx

    // Create minimal user record (most data is in encrypted blockchain tx)
    const user: User = {
      id: userId,
      email: oneTimeLink.email,
      publicKey: kyberPublicKey, // Kyber public key for encryption
      dilithiumPublicKey,
      encryptedPrivateData: JSON.stringify({
        recoveryPhrase, // Only recovery phrase stored here
        blockchainTxId: kvTxId, // Reference to blockchain transaction
        dilithiumPublicKey // For signature verification
      }),
      blockchainTxId: kvTxId,
      createdAt: Date.now(),
      invitedBy: oneTimeLink.inviteType === 'user' ? oneTimeLink.createdBy : undefined,
      hasActivated: true,
      accountType // From invite, NOT user input
    };

    // Save user to KV
    await env.VERITAS_KV.put(`user:${userId}`, JSON.stringify(user));
    await env.VERITAS_KV.put(`user:email:${oneTimeLink.email}`, userId);

    // Mark link as used
    oneTimeLink.used = true;
    oneTimeLink.usedAt = Date.now();
  await storeActivationLink(env, oneTimeLink);

    return c.json<APIResponse>({
      success: true,
      data: {
        userId,
        kyberPublicKey,
        dilithiumPublicKey,
        blockchainTxId: kvTxId,
        accountType, // Return account type so UI knows user permissions
        recoveryPhrase,
        message: 'Save both private keys securely! You cannot recover them later.'
      },
      message: 'Account activated successfully on Veritas blockchain',
    });
  } catch (error) {
    console.error('Error activating account:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Login (verify user exists and return user data)
authHandler.post('/login', async (c) => {
  try {
    const env = c.env;
    const { email, signature, timestamp } = await c.req.json();

    if (!email || !signature || !timestamp) {
      return c.json<APIResponse>({ success: false, error: 'Email, signature, and timestamp are required' }, 400);
    }

    if (Math.abs(Date.now() - Number(timestamp)) > 5 * 60 * 1000) {
      return c.json<APIResponse>({ success: false, error: 'Login request timestamp is invalid or expired' }, 400);
    }

    console.log(`🔍 Login attempt for email: ${email}`);

    const userId = await env.VERITAS_KV.get(`user:email:${email}`);
    if (!userId) {
      console.log(`❌ User not found for email: ${email}`);
      return c.json<APIResponse>({ success: false, error: 'User not found' }, 404);
    }

    console.log(`✅ Found userId: ${userId} for email: ${email}`);

    const userData = await env.VERITAS_KV.get(`user:${userId}`);
    if (!userData) {
      console.log(`❌ User data not found for userId: ${userId}`);
      return c.json<APIResponse>({ success: false, error: 'User data not found' }, 404);
    }

    const user: User = JSON.parse(userData);
    console.log(`✅ Loaded user data for: ${userId}`);

    const vdcTxId = await env.VERITAS_KV.get(`vdc:user:${userId}`);
    if (!vdcTxId) {
      console.error(`❌ VDC transaction not found for user ${userId}`);
      return c.json<APIResponse>({ success: false, error: 'User blockchain registration not found' }, 500);
    }

    console.log(`✅ Found VDC transaction ID: ${vdcTxId} for user: ${userId}`);

    const vdc = await initializeVDC(env);
    const vdcTx = await vdc.getTransaction(vdcTxId);
    
    if (!vdcTx) {
      console.error(`❌ VDC transaction not found: ${vdcTxId}`);
      return c.json<APIResponse>({ success: false, error: 'Blockchain transaction not found' }, 500);
    }

    console.log(`✅ Loaded VDC transaction: ${vdcTxId}, type: ${vdcTx.type}`);

    const encryptedUserData = vdcTx.data?.encryptedUserData;
    if (!encryptedUserData) {
      console.error(`❌ Encrypted user data not found in VDC transaction ${vdcTxId}`);
      return c.json<APIResponse>({ success: false, error: 'Encrypted user data not found in blockchain' }, 500);
    }

    console.log(`✅ Found encrypted user data in VDC transaction`);

    const dilithiumPublicKey = vdcTx.data?.dilithiumPublicKey || user.dilithiumPublicKey;
    if (!dilithiumPublicKey) {
      console.error(`❌ Dilithium public key missing for user ${userId}`);
      console.error(`   VDC data:`, vdcTx.data);
      console.error(`   User data:`, user);
      return c.json<APIResponse>({ success: false, error: 'Public key not available for signature verification' }, 500);
    }

    console.log(`✅ Found Dilithium public key for signature verification`);

    const maataraClient = new MaataraClient(env);
    const challenge = `login:${email}:${timestamp}`;
    console.log(`🔐 Verifying signature for challenge: ${challenge}`);

    const isValid = await maataraClient.verifySignature(challenge, signature, dilithiumPublicKey);

    if (!isValid) {
      console.error(`❌ Invalid signature for user ${userId}`);
      return c.json<APIResponse>({ success: false, error: 'Signature verification failed' }, 401);
    }

    console.log(`✅ Signature verification successful for user: ${userId}`);

    const sessionToken = await createSession(env, userId);

    console.log(`✅ Login successful for user ${userId} (${email})`);

    return c.json<APIResponse>({
      success: true,
      data: {
        user,
        vdcTransactionId: vdcTxId,
        accountType: user.accountType,
        encryptedUserData,
        sessionToken,
        dilithiumPublicKey,
        kyberPublicKey: user.publicKey
      },
      message: 'Login successful - zero-knowledge proof verified',
    });
  } catch (error) {
    console.error('❌ Error during login:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

export { authHandler };