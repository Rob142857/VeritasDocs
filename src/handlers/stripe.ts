import { Hono } from 'hono';
import Stripe from 'stripe';
import { Environment, Transaction, APIResponse } from '../types';
import { generateId } from '../utils/crypto';

const stripeHandler = new Hono<{ Bindings: Environment }>();

// Create payment intent for account creation or asset creation
stripeHandler.post('/create-payment-intent', async (c) => {
  try {
    const env = c.env;
    const { userId, type, email } = await c.req.json();

    if (!type || !email) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Payment type and email are required' 
      }, 400);
    }

    if (!['account_creation', 'asset_creation'].includes(type)) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Invalid payment type' 
      }, 400);
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    // Create payment intent for $25
    const paymentIntent = await stripe.paymentIntents.create({
      amount: 2500, // $25.00 in cents
      currency: 'usd',
      metadata: {
        type,
        userId: userId || '',
        email,
      },
      description: type === 'account_creation' 
        ? 'Veritas Documents - Account Creation' 
        : 'Veritas Documents - Asset Creation',
    });

    // Create transaction record
    const transactionId = generateId();
    const transaction: Transaction = {
      id: transactionId,
      userId: userId || '',
      type: type as 'account_creation' | 'asset_creation',
      amount: 25.00,
      stripePaymentIntentId: paymentIntent.id,
      status: 'pending',
      createdAt: Date.now(),
    };

    await env.VERITAS_KV.put(`transaction:${transactionId}`, JSON.stringify(transaction));
    await env.VERITAS_KV.put(`stripe:${paymentIntent.id}`, transactionId);

    return c.json<APIResponse>({
      success: true,
      data: {
        clientSecret: paymentIntent.client_secret,
        transactionId,
      },
      message: 'Payment intent created successfully',
    });
  } catch (error) {
    console.error('Error creating payment intent:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Handle Stripe webhooks
stripeHandler.post('/webhook', async (c) => {
  try {
    const env = c.env;
    const signature = c.req.header('stripe-signature');
    
    if (!signature) {
      console.error('Missing Stripe signature header');
      return c.json<APIResponse>({ success: false, error: 'Missing signature' }, 400);
    }

    // CRITICAL: Get the raw request body as ArrayBuffer first, then convert to string
    // This ensures we have the exact bytes that Stripe signed
    const arrayBuffer = await c.req.arrayBuffer();
    const rawBody = new TextDecoder().decode(arrayBuffer);

    console.log('Webhook received - signature present, body length:', rawBody.length);

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
      console.log('Webhook signature verified successfully, event type:', event.type);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err.message);
      return c.json<APIResponse>({ success: false, error: 'Invalid signature' }, 400);
    }

    // Handle payment intent succeeded
    if (event.type === 'payment_intent.succeeded') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      // Get transaction ID
      const transactionId = await env.VERITAS_KV.get(`stripe:${paymentIntent.id}`);
      if (!transactionId) {
        console.error('Transaction not found for payment intent:', paymentIntent.id);
        return c.json<APIResponse>({ success: false, error: 'Transaction not found' }, 404);
      }

      // Update transaction status
      const transactionData = await env.VERITAS_KV.get(`transaction:${transactionId}`);
      if (transactionData) {
        const transaction: Transaction = JSON.parse(transactionData);
        transaction.status = 'completed';
        await env.VERITAS_KV.put(`transaction:${transactionId}`, JSON.stringify(transaction));

        // If this was for account creation, you might want to trigger additional logic here
        if (transaction.type === 'account_creation') {
          // Could trigger email notification or other account setup logic
          console.log('Account creation payment completed for:', paymentIntent.metadata?.email);
        }
      }
    }

    // Handle Stripe checkout session completed (for asset creation flow)
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      
      console.log('Checkout session completed:', session.id);
      
      // Get asset ID from session metadata
      const assetId = session.metadata?.assetId;
      const userId = session.metadata?.userId;
      
      if (!assetId || !userId) {
        console.error('Missing assetId or userId in session metadata');
        return c.json<APIResponse>({ success: false, error: 'Invalid session metadata' }, 400);
      }

      // Get asset from KV
      const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
      if (!assetData) {
        console.error('Asset not found:', assetId);
        return c.json<APIResponse>({ success: false, error: 'Asset not found' }, 404);
      }

      const asset = JSON.parse(assetData);
      
      // Update asset payment status
      asset.paymentStatus = 'completed';
      asset.paidAt = Date.now();
      await env.VERITAS_KV.put(`asset:${assetId}`, JSON.stringify(asset));

      // Move asset from pending to owned
      const userPendingAssetsKey = `user_pending_assets:${userId}`;
      const userAssetsKey = `user_assets:${userId}`;
      
      const pendingAssets = await env.VERITAS_KV.get(userPendingAssetsKey);
      if (pendingAssets) {
        const pendingList = JSON.parse(pendingAssets);
        const updatedPending = pendingList.filter((id: string) => id !== assetId);
        await env.VERITAS_KV.put(userPendingAssetsKey, JSON.stringify(updatedPending));
      }
      
      const ownedAssets = await env.VERITAS_KV.get(userAssetsKey);
      const ownedList = ownedAssets ? JSON.parse(ownedAssets) : [];
      ownedList.push(assetId);
      await env.VERITAS_KV.put(userAssetsKey, JSON.stringify(ownedList));

      // Create VDC transaction for asset registration
      console.log('Creating VDC transaction for asset:', assetId);
      
      // Get user data for signature verification
      const userData = await env.VERITAS_KV.get(`user:${userId}`);
      if (!userData) {
        console.error('User not found:', userId);
        return c.json<APIResponse>({ success: false, error: 'User not found' }, 404);
      }
      
      const user = JSON.parse(userData);
      
      // Create VDC transaction
      const vdcTransactionId = `vdc_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const vdcTransaction = {
        id: vdcTransactionId,
        type: 'asset_creation',
        timestamp: Date.now(),
        data: {
          assetId: asset.id,
          tokenId: asset.tokenId,
          ownerId: asset.ownerId,
          creatorId: asset.creatorId,
          title: asset.title,
          description: asset.description,
          documentType: asset.documentType,
          ipfsHash: asset.ipfsHash,
          ipfsMetadataHash: asset.ipfsMetadataHash,
          merkleRoot: asset.merkleRoot,
          ethereumTxHash: asset.ethereumTxHash,
          stripeSessionId: session.id,
          paidAmount: session.amount_total ? session.amount_total / 100 : 25, // Convert from cents
          createdAt: asset.createdAt,
        },
        signatures: {
          user: {
            publicKey: user.dilithiumPublicKey,
            signature: asset.signature, // Original asset creation signature
          },
          system: {
            publicKey: env.SYSTEM_DILITHIUM_PUBLIC_KEY,
            signature: '', // Will be filled by system when mining
          },
        },
      };

      // Store with VDC standard prefix: vdc:pending:{id} (same as user registration)
      await env.VERITAS_KV.put(`vdc:pending:${vdcTransactionId}`, JSON.stringify(vdcTransaction));
      
      // Update pending count (VDC standard)
      const currentCountStr = await env.VERITAS_KV.get('vdc:pending:count');
      const currentCount = parseInt(currentCountStr || '0', 10);
      const pendingCount = Number.isNaN(currentCount) ? 1 : currentCount + 1;
      await env.VERITAS_KV.put('vdc:pending:count', pendingCount.toString());

      // Update asset with VDC transaction ID
      asset.vdcTransactionId = vdcTransactionId;
      await env.VERITAS_KV.put(`asset:${assetId}`, JSON.stringify(asset));

      console.log('VDC transaction created and pending mining:', vdcTransactionId);
      console.log('Pending count:', pendingCount);
      
      // TODO: Send email notification to user
      console.log('Asset payment completed - pending VDC mining for:', user.email);
    }

    // Handle payment intent failed
    if (event.type === 'payment_intent.payment_failed') {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      
      const transactionId = await env.VERITAS_KV.get(`stripe:${paymentIntent.id}`);
      if (transactionId) {
        const transactionData = await env.VERITAS_KV.get(`transaction:${transactionId}`);
        if (transactionData) {
          const transaction: Transaction = JSON.parse(transactionData);
          transaction.status = 'failed';
          await env.VERITAS_KV.put(`transaction:${transactionId}`, JSON.stringify(transaction));
        }
      }
    }

    return c.json<APIResponse>({ success: true, message: 'Webhook processed' });
  } catch (error) {
    console.error('Error processing webhook:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get transaction status
stripeHandler.get('/transaction/:transactionId', async (c) => {
  try {
    const env = c.env;
    const transactionId = c.req.param('transactionId');

    const transactionData = await env.VERITAS_KV.get(`transaction:${transactionId}`);
    if (!transactionData) {
      return c.json<APIResponse>({ success: false, error: 'Transaction not found' }, 404);
    }

    const transaction: Transaction = JSON.parse(transactionData);

    return c.json<APIResponse>({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error('Error getting transaction:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

export { stripeHandler };