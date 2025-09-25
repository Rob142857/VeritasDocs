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
    const body = await c.req.text();

    if (!signature) {
      return c.json<APIResponse>({ success: false, error: 'Missing signature' }, 400);
    }

    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    let event;
    try {
      event = stripe.webhooks.constructEvent(body, signature, env.STRIPE_WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err);
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