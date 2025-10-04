import { Hono } from 'hono';
import { Environment, User, APIResponse, OneTimeLink } from '../types';
import { storeActivationLink } from '../utils/activation';

const userHandler = new Hono<{ Bindings: Environment }>();

// Get user profile (alias for convenience)
userHandler.get('/:userId', async (c) => {
  try {
    const env = c.env;
    const userId = c.req.param('userId');

    const userData = await env.VERITAS_KV.get(`user:${userId}`);
    if (!userData) {
      return c.json<APIResponse>({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userData);

    // Return full user info (for admin panel)
    const publicUser = {
      id: user.id,
      email: user.email,
      publicKey: user.publicKey,
      createdAt: user.createdAt,
      accountType: user.accountType,
    };

    return c.json<APIResponse>({
      success: true,
      data: publicUser,
    });
  } catch (error) {
    console.error('Error getting user:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get user profile
userHandler.get('/profile/:userId', async (c) => {
  try {
    const env = c.env;
    const userId = c.req.param('userId');

    const userData = await env.VERITAS_KV.get(`user:${userId}`);
    if (!userData) {
      return c.json<APIResponse>({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userData);

    // Remove sensitive data
    const publicUser = {
      id: user.id,
      email: user.email,
      publicKey: user.publicKey,
      createdAt: user.createdAt,
      accountType: user.accountType,
    };

    return c.json<APIResponse>({
      success: true,
      data: publicUser,
    });
  } catch (error) {
    console.error('Error getting user profile:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Create invitation link (paid users only)
userHandler.post('/invite', async (c) => {
  try {
    const env = c.env;
    const { userId, email } = await c.req.json();

    if (!userId || !email) {
      return c.json<APIResponse>({ success: false, error: 'User ID and email are required' }, 400);
    }

    // Verify user exists and has paid account
    const userData = await env.VERITAS_KV.get(`user:${userId}`);
    if (!userData) {
      return c.json<APIResponse>({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userData);
    if (user.accountType !== 'paid') {
      return c.json<APIResponse>({ success: false, error: 'Only paid users can send invites' }, 403);
    }

    // Check if email is already registered
    const existingUserId = await env.VERITAS_KV.get(`user:email:${email}`);
    if (existingUserId) {
      return c.json<APIResponse>({ success: false, error: 'User with this email already exists' }, 400);
    }

    // Create invitation link
    const linkId = crypto.randomUUID();
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days

    const inviteLink: OneTimeLink = {
      id: linkId,
      token,
      createdBy: userId,
      inviteType: 'user',
      email,
      expiresAt,
      used: false,
    };

    await storeActivationLink(env, inviteLink);

    const activationUrl = `${c.req.url.split('/api')[0]}/activate?token=${token}`;

    return c.json<APIResponse>({
      success: true,
      data: { activationUrl, expiresAt },
      message: 'Invitation link created successfully',
    });
  } catch (error) {
    console.error('Error creating invitation:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

export { userHandler };