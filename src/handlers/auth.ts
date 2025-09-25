import { Hono } from 'hono';
import { Environment, OneTimeLink, User, APIResponse } from '../types';
import { MaataraClient, generateId, generateMnemonic } from '../utils/crypto';

const authHandler = new Hono<{ Bindings: Environment }>();

// Generate one-time account creation link (admin only)
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
      email,
      expiresAt,
      used: false,
    };

    await env.VERITAS_KV.put(`link:${token}`, JSON.stringify(oneTimeLink));

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

// Activate account using one-time link
authHandler.post('/activate', async (c) => {
  try {
    const env = c.env;
    const { token, personalDetails } = await c.req.json();

    if (!token || !personalDetails) {
      return c.json<APIResponse>({ success: false, error: 'Token and personal details are required' }, 400);
    }

    // Get one-time link
    const linkData = await env.VERITAS_KV.get(`link:${token}`);
    if (!linkData) {
      return c.json<APIResponse>({ success: false, error: 'Invalid or expired token' }, 400);
    }

    const oneTimeLink: OneTimeLink = JSON.parse(linkData);

    if (oneTimeLink.used) {
      return c.json<APIResponse>({ success: false, error: 'Token has already been used' }, 400);
    }

    if (oneTimeLink.expiresAt < Date.now()) {
      return c.json<APIResponse>({ success: false, error: 'Token has expired' }, 400);
    }

    // Generate crypto keys
    const maataraClient = new MaataraClient(env);
    const keyPair = await maataraClient.generateKeyPair();
    const recoveryPhrase = generateMnemonic();

    // Encrypt user data with app's public key (for admin access)
    const userData = {
      email: oneTimeLink.email,
      personalDetails,
      recoveryPhrase,
    };

    const encryptedUserData = await maataraClient.encryptData(
      JSON.stringify(userData),
      keyPair.publicKey
    );

    // Create user
    const userId = generateId();
    const user: User = {
      id: userId,
      email: oneTimeLink.email,
      publicKey: keyPair.publicKey,
      encryptedPrivateData: encryptedUserData,
      createdAt: Date.now(),
      hasActivated: true,
      accountType: 'paid', // First account is always paid
    };

    // Save user to KV
    await env.VERITAS_KV.put(`user:${userId}`, JSON.stringify(user));
    await env.VERITAS_KV.put(`user:email:${oneTimeLink.email}`, userId);

    // Mark link as used
    oneTimeLink.used = true;
    oneTimeLink.usedAt = Date.now();
    await env.VERITAS_KV.put(`link:${token}`, JSON.stringify(oneTimeLink));

    // Add user registration to blockchain
    const chainTransaction = {
      type: 'user_registration',
      userId,
      publicKey: keyPair.publicKey,
      timestamp: Date.now(),
    };

    await maataraClient.addToChain(chainTransaction);

    return c.json<APIResponse>({
      success: true,
      data: {
        userId,
        publicKey: keyPair.publicKey,
        privateKey: keyPair.privateKey,
        recoveryPhrase,
      },
      message: 'Account activated successfully',
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
    const { email, privateKey } = await c.req.json();

    if (!email || !privateKey) {
      return c.json<APIResponse>({ success: false, error: 'Email and private key are required' }, 400);
    }

    // Get user ID from email
    const userId = await env.VERITAS_KV.get(`user:email:${email}`);
    if (!userId) {
      return c.json<APIResponse>({ success: false, error: 'User not found' }, 404);
    }

    // Get user data
    const userData = await env.VERITAS_KV.get(`user:${userId}`);
    if (!userData) {
      return c.json<APIResponse>({ success: false, error: 'User data not found' }, 404);
    }

    const user: User = JSON.parse(userData);

    // Verify the private key can decrypt the user's data
    try {
      const maataraClient = new MaataraClient(env);
      await maataraClient.decryptData(user.encryptedPrivateData, privateKey);
    } catch (error) {
      return c.json<APIResponse>({ success: false, error: 'Invalid private key' }, 401);
    }

    return c.json<APIResponse>({
      success: true,
      data: { user },
      message: 'Login successful',
    });
  } catch (error) {
    console.error('Error during login:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

export { authHandler };