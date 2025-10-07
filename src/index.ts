import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { Environment } from './types';
import { authHandler } from './handlers/auth';
import { assetHandler } from './handlers/assets';
import { enhancedAssetHandler } from './handlers/web3-assets';
import { userHandler } from './handlers/users';
import { stripeHandler } from './handlers/stripe';
import { searchHandler } from './handlers/search';
import vdcHandler from './handlers/vdc';
import storageVerifyHandler from './handlers/storage-verify';
import { MaataraClient } from './utils/crypto';

type Bindings = Environment;

const app = new Hono<{ Bindings: Bindings }>();

// CORS middleware
app.use('*', cors({
  origin: ['https://veritas-documents.workers.dev', 'http://localhost:8787'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'stripe-signature'],
}));

// Special handling for Stripe webhook - MUST come before any body parsing middleware
// This intercepts the request and handles it directly to preserve the raw body
app.post('/api/stripe/webhook', async (c) => {
  try {
    const env = c.env;
    const req = c.req.raw;
    const signature = req.headers.get('stripe-signature');
    
    if (!signature) {
      console.error('Missing Stripe signature header');
      return c.json({ success: false, error: 'Missing signature' }, 400);
    }

    // Clone the request to read the body without consuming it
    const clonedReq = req.clone();
    const body = await clonedReq.text();

    console.log('Webhook received - signature:', signature.substring(0, 20) + '...');
    console.log('Body length:', body.length);
    console.log('Secret exists:', !!env.STRIPE_WEBHOOK_SECRET);
    console.log('Secret prefix:', env.STRIPE_WEBHOOK_SECRET?.substring(0, 10));

    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    let event;
    try {
      // Use async version for Cloudflare Workers
      event = await stripe.webhooks.constructEventAsync(body, signature, env.STRIPE_WEBHOOK_SECRET);
      console.log('✅ Webhook signature verified successfully, event type:', event.type);
    } catch (err: any) {
      console.error('❌ Webhook signature verification failed:', err.message);
      console.error('Error details:', JSON.stringify(err, null, 2));
      return c.json({ success: false, error: 'Invalid signature' }, 400);
    }

    // Handle checkout.session.completed event
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as any;
      
      console.log('Checkout session completed:', session.id);
      
      const assetId = session.metadata?.assetId;
      const userId = session.metadata?.userId;
      
      if (!assetId || !userId) {
        console.error('Missing assetId or userId in session metadata');
        return c.json({ success: false, error: 'Invalid session metadata' }, 400);
      }

      // Idempotency: ensure we haven't processed this session yet
      const processedKey = `stripe_processed:${session.id}`;
      const alreadyProcessed = await env.VERITAS_KV.get(processedKey);
      if (alreadyProcessed) {
        console.log(`Stripe session ${session.id} already processed`);
        return c.json({ success: true, message: 'Already processed' });
      }

      // Get asset from KV
      const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
      if (!assetData) {
        console.error('Asset not found:', assetId);
        return c.json({ success: false, error: 'Asset not found' }, 404);
      }

      const asset = JSON.parse(assetData);

      // Verify asset belongs to user and session matches asset's stored session
      if (asset.ownerId !== userId || (asset.stripeSessionId && asset.stripeSessionId !== session.id)) {
        console.error('Session-user-asset mismatch; rejecting');
        return c.json({ success: false, error: 'Session verification failed' }, 400);
      }

      // Verify Stripe session status and payment
      if (session.payment_status !== 'paid' && session.status !== 'complete') {
        console.error('Stripe session not fully paid/complete');
        return c.json({ success: false, error: 'Payment not completed' }, 400);
      }
      
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

      // Verify PaymentIntent amount/currency before creating VDC transaction
      try {
        const Stripe = (await import('stripe')).default;
        const stripe = new Stripe(env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
        if (session.payment_intent) {
          const pi = await stripe.paymentIntents.retrieve(typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent.id);
          const expectedAmount = parseInt(env.PRICE_CENTS || '2500', 10);
          const expectedCurrency = (env.PRICE_CURRENCY || 'usd').toLowerCase();
          const piCurrency = (pi.currency || '').toLowerCase();
          if (pi.amount_received !== expectedAmount || piCurrency !== expectedCurrency) {
            console.error('PaymentIntent amount/currency mismatch', {
              received: { amount: pi.amount_received, currency: piCurrency },
              expected: { amount: expectedAmount, currency: expectedCurrency }
            });
            return c.json({ success: false, error: 'Payment verification failed' }, 400);
          }
        }
      } catch (verifyErr: any) {
        console.error('Failed to verify PaymentIntent:', verifyErr?.message || verifyErr);
        return c.json({ success: false, error: 'Payment verification error' }, 400);
      }

      // Create VDC transaction for asset registration
      console.log('Creating VDC transaction for asset:', assetId);
      try {
        const { initializeVDC } = await import('./utils/blockchain');
        const vdc = await initializeVDC(env);

        // Build payload for admin action to register the asset on-chain
        const payload: any = {
          assetId,
          userId,
          tokenId: asset.tokenId,
          ipfsHash: asset.ipfsHash,
          ipfsMetadataHash: asset.ipfsMetadataHash,
          createdAt: asset.createdAt
        };

  const { transaction } = await vdc.addAdminAction('register_asset', payload);

        // Update asset with VDC transaction reference and mark pending mining
        asset.vdcTransactionId = transaction.id;
        asset.status = 'pending_mining';
        await env.VERITAS_KV.put(`asset:${assetId}`, JSON.stringify(asset));
        console.log(`✓ Queued VDC registration tx ${transaction.id} for asset ${assetId}`);

        // Optional: auto-mine ONLY this tx to guarantee one block per Stripe transaction
        if ((env as any)?.AUTO_MINE_ON_PAYMENT === 'true') {
          try {
            const mined = await vdc.mineSpecificTransactions([transaction.id]);
            console.log(`⛏️  Auto-mined block #${mined.blockNumber} containing tx ${transaction.id}`);
          } catch (mineErr: any) {
            console.warn('Auto-mine after payment failed:', mineErr?.message || mineErr);
          }
        }
      } catch (vdcErr: any) {
        console.error('Failed to queue VDC transaction after payment:', vdcErr?.message || vdcErr);
      }
      // Mark session as processed to prevent replay
      await env.VERITAS_KV.put(processedKey, JSON.stringify({
        sessionId: session.id,
        assetId,
        userId,
        processedAt: Date.now()
      }));
      
      console.log('Payment completed for asset:', assetId);
    }

    return c.json({ success: true });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return c.json({ success: false, error: error.message }, 500);
  }
});

// Serve static files from /public for fallback HTML pages
app.get('/public/*', async (c) => {
  try {
    const path = c.req.path.replace('/public/', '');
    // Only allow specific html files to avoid directory traversal
    if (path === 'activate-keypack.html') {
      // Inline small proxy to the checked-in file content
      const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/activate-keypack.html${c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : ''}"><title>Redirecting…</title></head><body>Redirecting…</body></html>`;
      return c.html(html);
    }
    return c.text('Not found', 404);
  } catch (e) {
    console.error('Error serving public file:', e);
    return c.text('Error serving file', 500);
  }
});

// CSS endpoint - keeping this minimal to avoid bundle bloat
app.get('/styles.css', async (c) => {
  const css = `:root {
  --primary-color: #2563eb;
  --primary-hover: #1d4ed8;
  --success-color: #10b981;
  --error-color: #dc2626;
  --warning-color: #d97706;
  --background: #ffffff;
  --surface: #f8fafc;
  --border: #e2e8f0;
  --text-primary: #0f172a;
  --text-secondary: #64748b;
  --text-muted: #94a3b8;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
  background-color: var(--background);
  color: var(--text-primary);
  line-height: 1.6;
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

/* Header */
.header {
  background-color: var(--background);
  border-bottom: 1px solid var(--border);
  padding: 1rem 0;
}

.header .container {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.logo {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--primary-color);
}

.nav {
  display: flex;
  gap: 2rem;
}

.nav a {
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 500;
  transition: color 0.2s;
}

.nav a:hover,
.nav a.active {
  color: var(--primary-color);
}

/* Main content */
.main {
  min-height: calc(100vh - 80px);
  padding: 2rem 0;
}

/* Cards */
.card {
  background-color: var(--background);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1.5rem;
  margin-bottom: 1.5rem;
}

.card-header {
  margin-bottom: 1rem;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.card-subtitle {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

/* Forms */
.form-group {
  margin-bottom: 1rem;
}

.label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--text-primary);
}

.input,
.textarea,
.select {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  font-size: 1rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input:focus,
.textarea:focus,
.select:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
}

.textarea {
  resize: vertical;
  min-height: 100px;
}

/* Buttons */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.75rem 1.5rem;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  font-weight: 500;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
  gap: 0.5rem;
}

.btn-primary {
  background-color: var(--primary-color);
  color: white;
}

.btn-primary:hover {
  background-color: var(--primary-hover);
}

.btn-secondary {
  background-color: var(--surface);
  color: var(--text-primary);
  border: 1px solid var(--border);
}

.btn-secondary:hover {
  background-color: var(--border);
}

.btn-success {
  background-color: var(--success-color);
  color: white;
}

.btn-danger {
  background-color: var(--error-color);
  color: white;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-sm {
  padding: 0.5rem 1rem;
  font-size: 0.875rem;
}

/* Badges */
.badge {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.badge-success {
  background-color: #d1fae5;
  color: var(--success-color);
}

.badge-warning {
  background-color: #fef3c7;
  color: var(--warning-color);
}

.badge-user {
  background-color: #dbeafe;
  color: #1e40af;
}

.badge-dev {
  background-color: #fde68a;
  color: #92400e;
}

/* Alerts */
.alert {
  padding: 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
}

.alert-success {
  background-color: #f0fdf4;
  color: var(--success-color);
  border: 1px solid #bbf7d0;
}

.alert-error {
  background-color: #fef2f2;
  color: var(--error-color);
  border: 1px solid #fecaca;
}

.alert-warning {
  background-color: #fffbeb;
  color: var(--warning-color);
  border: 1px solid #fed7aa;
}

/* Grid */
.grid {
  display: grid;
  gap: 1.5rem;
}

.grid-2 {
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.grid-3 {
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
}

/* Dashboard */
.dashboard-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 2rem;
}

.stat-card {
  background-color: var(--surface);
  padding: 1.5rem;
  border-radius: 8px;
  text-align: center;
}

.stat-number {
  font-size: 2rem;
  font-weight: 600;
  color: var(--primary-color);
  margin-bottom: 0.5rem;
}

.stat-label {
  color: var(--text-secondary);
  font-size: 0.875rem;
}

/* Asset cards */
.asset-card {
  background-color: var(--background);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.875rem;
  margin-bottom: 0.75rem;
  transition: all 0.2s ease;
}

.asset-card:hover {
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.15);
  transform: translateY(-2px);
  border-color: var(--primary-color);
}

.asset-type {
  display: inline-block;
  padding: 0.2rem 0.5rem;
  background-color: var(--surface);
  border-radius: 3px;
  font-size: 0.7rem;
  font-weight: 500;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
}

.asset-title {
  font-size: 0.95rem;
  font-weight: 600;
  margin-bottom: 0.3rem;
}

.asset-description {
  color: var(--text-secondary);
  margin-bottom: 0.6rem;
  font-size: 0.85rem;
}

.asset-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  color: var(--text-muted);
  flex-wrap: wrap;
  gap: 0.5rem;
}

/* Loading states */
.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top: 3px solid var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

/* Responsive */
@media (max-width: 768px) {
  .header .container {
    flex-direction: column;
    gap: 1rem;
  }
  
  .nav {
    flex-wrap: wrap;
    justify-content: center;
  }
  
  .container {
    padding: 0 0.5rem;
  }
  
  .card {
    padding: 1rem;
  }
}

/* Modal */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-content {
  background-color: var(--background);
  border-radius: 12px;
  max-width: 600px;
  width: 100%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 600;
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  padding: 1.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  gap: 1rem;
  justify-content: flex-end;
}

.checkbox-group {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem;
  background-color: var(--surface);
  border-radius: 6px;
  margin-bottom: 0.75rem;
}

.checkbox-group input[type="checkbox"] {
  margin-top: 0.25rem;
  cursor: pointer;
}

.checkbox-group label {
  cursor: pointer;
  font-size: 0.875rem;
  line-height: 1.5;
}

/* Progress modal */
.progress-modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
}

.progress-modal-content {
  background-color: var(--background);
  border-radius: 12px;
  padding: 2rem;
  text-align: center;
  min-width: 300px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
}

.progress-spinner {
  width: 50px;
  height: 50px;
  border: 4px solid var(--border);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.progress-modal-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
  color: var(--text-primary);
}

.progress-modal-message {
  font-size: 0.875rem;
  color: var(--text-secondary);
}

/* Modal styles */
.modal {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: fadeIn 0.2s ease-in-out;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.modal-content {
  background-color: var(--background);
  border-radius: 12px;
  max-width: 90%;
  max-height: 90vh;
  overflow: hidden;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    transform: translateY(-50px);
    opacity: 0;
  }
  to {
    transform: translateY(0);
    opacity: 1;
  }
}

.modal-header {
  padding: 1.5rem;
  border-bottom: 1px solid var(--border);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.modal-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text-primary);
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  transition: all 0.2s;
}

.modal-close:hover {
  background-color: var(--surface);
  color: var(--text-primary);
}

.modal-body {
  padding: 1.5rem;
  max-height: calc(90vh - 160px);
  overflow-y: auto;
}

.modal-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid var(--border);
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
}

/* Utility classes */
.hidden { display: none !important; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.text-muted { color: var(--text-muted) !important; }
.mb-0 { margin-bottom: 0 !important; }
.mb-1 { margin-bottom: 0.5rem !important; }
.mb-2 { margin-bottom: 1rem !important; }
.mt-2 { margin-top: 1rem !important; }
.p-4 { padding: 2rem !important; }`;

  return c.text(css, 200, {
    'Content-Type': 'text/css; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
  });
});

// Also serve at /static/styles.css for compatibility
app.get('/static/styles.css', async (c) => {
  return c.redirect('/styles.css');
});

// Serve static files from /public for fallback HTML pages
app.get('/public/*', async (c) => {
  try {
    const path = c.req.path.replace('/public/', '');
    // Only allow specific html files to avoid directory traversal
    if (path === 'activate-keypack.html') {
      // Inline small proxy to the checked-in file content
      const html = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/activate-keypack.html${c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : ''}"><title>Redirecting…</title></head><body>Redirecting…</body></html>`;
      return c.html(html);
    }
    if (path === 'login-keypack.html') {
      const html = '<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/login-keypack.html"><title>Redirecting…</title></head><body>Redirecting…</body></html>';
      return c.html(html);
    }
  } catch {}
  return c.text('Not found', 404);
});

// Serve bundled frontend application from KV or inline
app.get('/static/app.bundle.js', async (c) => {
  try {
    // Try to load from KV first (production-ready Maatara PQC bundle)
    const env = c.env as Environment;
    let bundle = await env.VERITAS_KV.get('app-bundle');
    
    if (bundle) {
      console.log('✅ Serving real Maatara PQC bundle from KV (size:', bundle.length, 'bytes)');
      return c.text(bundle, 200, { 
        'Content-Type': 'application/javascript',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'ETag': `"app-bundle-v10-${Date.now()}"`,
      });
    } else {
      console.warn('⚠️ app-bundle not found in KV, falling back to error bundle');
    }
  } catch (error) {
    console.error('❌ Failed to load bundle from KV:', error);
  }

  // Fallback: serve simple bundle with hashData function
  const simpleBundle = `// Veritas Crypto Bundle with hashData function
(async () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function hashData(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  // Merge hashData into existing VeritasCrypto object instead of replacing it
  if (window.VeritasCrypto) {
    window.VeritasCrypto.hashData = hashData;
    console.log("✅ Added hashData function to existing VeritasCrypto module");
  } else {
    // ERROR: Real crypto bundle didn't load!
    console.error("❌ CRITICAL: Post-quantum crypto bundle failed to load!");
    console.error("The app.bundle.js file must load before this script.");
    window.VeritasCrypto = {
      encryptDocumentData: async function() {
        throw new Error("PQC bundle not loaded - cannot encrypt data");
      },
      decryptDocumentData: async function() {
        throw new Error("PQC bundle not loaded - cannot decrypt data");
      },
      generateClientKeypair: async function() {
        throw new Error("PQC bundle not loaded - cannot generate keypair. Check browser console for errors.");
      },
      signData: async function() {
        throw new Error("PQC bundle not loaded - cannot sign data");
      },
      verifySignature: async function() {
        throw new Error("PQC bundle not loaded - cannot verify signature");
      },
      ensureCryptoReady: async function() {
        throw new Error("PQC bundle failed to load - cannot initialize cryptography");
      },
      hashData: hashData
    };
    // Show user-friendly error in UI
    const alertDiv = document.createElement('div');
    alertDiv.style.cssText = 'position:fixed;top:20px;left:50%;transform:translateX(-50%);background:#dc2626;color:white;padding:20px;border-radius:8px;z-index:9999;max-width:600px;';
    alertDiv.innerHTML = '<strong>⚠️ Cryptography Module Failed to Load</strong><br>Please refresh the page. If this persists, clear your browser cache.';
    document.body.appendChild(alertDiv);
  }
})();
`;

  return c.text(simpleBundle, 200, { 'Content-Type': 'application/javascript' });
});

// Serve WASM file
app.get('/static/core_pqc_wasm_bg.wasm', async (c) => {
  try {
    const env = c.env as Environment;
    const wasm = await env.VERITAS_KV.get('pqc-wasm', 'arrayBuffer');
    if (wasm) {
      return c.body(wasm, 200, { 'Content-Type': 'application/wasm' });
    }
  } catch (error) {
    console.error('Failed to load WASM from KV:', error);
  }
  
  return c.text('WASM file not found', 404);
});

app.get('/static/app.js', async (c) => {
  const js = `
// Veritas Documents - Frontend Application

// Load the bundled Post-Quantum Cryptography module
const script = document.createElement('script');
script.src = '/static/app.bundle.js';
script.onerror = () => console.error('Failed to load PQC bundle');
document.head.appendChild(script);

class ClientCrypto {
  static async encryptData(data, publicKey) {
    // Generate a random AES key
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Encrypt the data with AES-GCM
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(data);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    const encryptedData = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      dataBytes
    );
    
    // Convert to base64
    const encryptedArray = new Uint8Array(encryptedData);
    const encryptedB64 = btoa(String.fromCharCode(...encryptedArray));
    const ivB64 = btoa(String.fromCharCode(...iv));
    
    return JSON.stringify({
      version: '1.0',
      algorithm: 'aes256gcm',
      iv: ivB64,
      ciphertext: encryptedB64,
      encrypted: true
    });
  }
}

class VeritasApp {
  constructor() {
    this.currentUser = null;
    this.currentPage = 'login';
    this.sessionToken = null;
    this.privateKeys = { kyber: null, dilithium: null };
    this.decryptedProfile = null;
    this.init();
  }

  // Basic HTML escaping helper for safe innerHTML usage
  escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  copyToClipboard(text) {
    if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        this.showAlert('success', 'Link copied to clipboard');
      }).catch(() => {
        try {
          const ta = document.createElement('textarea');
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand('copy');
          ta.remove();
          this.showAlert('success', 'Link copied to clipboard');
        } catch {
          this.showAlert('error', 'Failed to copy link');
        }
      });
    }
  }

  init() {
    // Check if user is logged in
    const storedUser = localStorage.getItem('veritas-user');
    if (storedUser) {
      this.currentUser = JSON.parse(storedUser);
      this.currentPage = 'dashboard';
    }

    // Primary session (SPA legacy flow)
    const storedSession = sessionStorage.getItem('veritas-session');
    if (storedSession) {
      try {
        const parsed = JSON.parse(storedSession);
        this.sessionToken = parsed.token || null;
        if (parsed.keys) {
          this.privateKeys = parsed.keys;
        }
      } catch (err) {
        console.warn('Failed to parse stored session:', err);
        sessionStorage.removeItem('veritas-session');
      }
    } else {
      // Compatibility: Keypack login flow stores data differently
      // localStorage: veritas-session { email, userId, accountType, sessionToken, loginTime }
      // sessionStorage: veritas-keys { kyber: {public, private}, dilithium: {public, private} }
      const kpSessionRaw = localStorage.getItem('veritas-session');
      const kpKeysRaw = sessionStorage.getItem('veritas-keys');
      if (!this.currentUser && kpSessionRaw) {
        try {
          const kpSession = JSON.parse(kpSessionRaw);
          if (kpSession?.sessionToken && kpSession?.userId) {
            this.sessionToken = kpSession.sessionToken;
            // Load keys if present
            if (kpKeysRaw) {
              try {
                const kpKeys = JSON.parse(kpKeysRaw);
                this.privateKeys = {
                  kyber: kpKeys?.kyber?.private || null,
                  dilithium: kpKeys?.dilithium?.private || null,
                };
              } catch (e) {
                console.warn('Failed to parse keypack keys:', e);
              }
            }
            // Fetch minimal user profile to hydrate SPA
            fetch('/api/users/profile/' + kpSession.userId)
              .then(r => r.json())
              .then(res => {
                if (res?.success && res?.data) {
                  this.currentUser = res.data;
                  localStorage.setItem('veritas-user', JSON.stringify(this.currentUser));
                  this.currentPage = 'dashboard';
                  this.updateNavigation();
                  this.router();
                }
              })
              .catch(err => console.warn('Profile fetch failed:', err));
          }
        } catch (e) {
          console.warn('Failed to parse keypack session:', e);
        }
      }
    }

    const storedProfile = sessionStorage.getItem('veritas-profile');
    if (storedProfile) {
      try {
        this.decryptedProfile = JSON.parse(storedProfile);
      } catch (err) {
        console.warn('Failed to parse stored profile:', err);
        sessionStorage.removeItem('veritas-profile');
      }
    }

    this.router();
    this.setupNavigation();
  }

  persistSession() {
    if (this.sessionToken) {
      sessionStorage.setItem('veritas-session', JSON.stringify({
        token: this.sessionToken,
        keys: this.privateKeys
      }));
    } else {
      sessionStorage.removeItem('veritas-session');
    }
  }

  router() {
    const path = window.location.pathname;
    const urlParams = new URLSearchParams(window.location.search);

    if (path === '/activate' && urlParams.has('token')) {
      this.currentPage = 'activate';
      this.renderActivationPage(urlParams.get('token'));
    } else if (this.currentUser) {
      switch (path) {
        case '/dashboard':
          this.currentPage = 'dashboard';
          this.renderDashboard();
          break;
        case '/create-asset':
          this.currentPage = 'create-asset';
          this.renderCreateAsset();
          break;
        case '/search':
          this.currentPage = 'search';
          this.renderSearch();
          break;
        case '/docs':
          this.currentPage = 'docs';
          this.renderDocs();
          break;
        case '/admin':
          if (this.currentUser.accountType === 'admin') {
            this.currentPage = 'admin';
            this.renderAdmin();
          } else {
            this.currentPage = 'dashboard';
            this.renderDashboard();
          }
          break;
        default:
          this.currentPage = 'dashboard';
          this.renderDashboard();
      }
    } else {
      // Public routes for non-logged-in users
      if (path === '/search') {
        this.currentPage = 'search';
        this.renderSearch();
      } else if (path === '/docs') {
        this.currentPage = 'docs';
        this.renderDocs();
      } else {
        this.currentPage = 'login';
        this.renderLogin();
      }
    }

    this.updateNavigation();
  }

  setupNavigation() {
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-nav]')) {
        e.preventDefault();
        const page = e.target.getAttribute('data-nav');
        this.navigateTo(page);
      }
    });

    // Handle browser back/forward
    window.addEventListener('popstate', () => {
      this.router();
    });
  }

  navigateTo(page) {
    let path = '/';
    switch (page) {
      case 'dashboard':
        path = '/dashboard';
        break;
      case 'create-asset':
        path = '/create-asset';
        break;
      case 'search':
        path = '/search';
        break;
      case 'docs':
        path = '/docs';
        break;
      case 'admin':
        path = '/admin';
        break;
      case 'logout':
        this.logout();
        return;
    }

    window.history.pushState({}, '', path);
    this.router();
  }

  updateNavigation() {
    const nav = document.getElementById('nav');
    if (!nav) return;

    if (this.currentUser) {
      const isAdmin = this.currentUser.accountType === 'admin';
      const adminLink = isAdmin ? \`<a href="#" data-nav="admin" class="\${this.currentPage === 'admin' ? 'active' : ''}" style="color: #f59e0b;">⚙️ Admin</a>\` : '';
      nav.innerHTML = \`<a href="#" data-nav="dashboard" class="\${this.currentPage === 'dashboard' ? 'active' : ''}">Dashboard</a><a href="#" data-nav="create-asset" class="\${this.currentPage === 'create-asset' ? 'active' : ''}">Register Document</a><a href="#" data-nav="search" class="\${this.currentPage === 'search' ? 'active' : ''}">Search</a><a href="#" data-nav="docs" class="\${this.currentPage === 'docs' ? 'active' : ''}">Docs</a>\${adminLink}<a href="#" data-nav="logout">Logout</a>\`;
    } else {
      nav.innerHTML = \`<a href="#" data-nav="search" class="\${this.currentPage === 'search' ? 'active' : ''}">Search</a><a href="#" data-nav="docs" class="\${this.currentPage === 'docs' ? 'active' : ''}">Docs</a>\`;
    }
  }

  renderLogin() {
    const content = document.getElementById('content');
    content.innerHTML = [
      '<div class="card" style="max-width: 560px; margin: 2rem auto;">',
      '  <div class="card-header">',
      '    <h2 class="card-title">Login to Veritas Documents</h2>',
      '    <p class="card-subtitle">Zero-knowledge authentication with post-quantum cryptography</p>',
      '  </div>',
      '  <form id="keypack-login-form" style="margin-bottom:1rem;">',
      '    <div class="form-group">',
      '      <label class="label" for="kp-email">Email Address</label>',
      '      <input type="email" id="kp-email" class="input" required placeholder="you@email.com">',
      '    </div>',
      '    <div class="form-group">',
      '      <label class="label" for="kp-passphrase">Recovery Passphrase (12 words)</label>',
      '      <textarea id="kp-passphrase" class="textarea" rows="2" placeholder="word1 word2 ... word12" required></textarea>',
      '      <small class="text-muted">Enter the 12-word passphrase you saved during activation</small>',
      '    </div>',
      '    <div class="form-group">',
      '      <label class="label">Keypack File (.keypack)</label>',
      '      <div class="file-upload-area" id="kp-file-drop" style="border:2px dashed #cbd5e1;border-radius:8px;padding:1.25rem;text-align:center;background:#f8fafc;cursor:pointer;">',
      '        <div id="kp-file-text">',
      '          <p style="margin:0;font-size:2rem;">📁</p>',
      '          <p style="margin:0.35rem 0;"><strong>Click to browse</strong> or drag & drop</p>',
      '          <p style="margin:0;font-size:0.9rem;color:#666;">Your encrypted keypack file</p>',
      '        </div>',
      '        <input type="file" id="kp-file" accept=".keypack" required style="display:none;">',
      '      </div>',
      '      <div id="kp-file-info" class="file-info" style="display:none;margin-top:0.5rem;padding:0.75rem;background:#e0f2fe;border-radius:6px;font-size:0.9rem;"></div>',
      '    </div>',
      '    <button type="submit" class="btn btn-primary" style="width:100%;">🔓 Decrypt & Login</button>',
      '  </form>',
      '  <div id="kp-message" class="mb-2"></div>',
      '  <details id="legacy-login-toggle" style="background: var(--surface); padding: 1rem; border-radius: 8px;">',
      '    <summary style="cursor: pointer; font-weight: 600; color: var(--text-secondary);">Use legacy login (paste keys)</summary>',
      '    <form id="login-legacy-form" style="margin-top: 1rem;">',
      '      <div class="form-group">',
      '        <label class="label" for="email">Email</label>',
      '        <input type="email" id="email" class="input" required>',
      '      </div>',
      '      <div class="form-group">',
      '        <label class="label" for="kyber-private-key">Kyber Private Key (decryption)</label>',
      '        <textarea id="kyber-private-key" class="textarea" placeholder="Paste your Kyber private key" required></textarea>',
      '      </div>',
      '      <div class="form-group">',
      '        <label class="label" for="dilithium-private-key">Dilithium Private Key (signature)</label>',
      '        <textarea id="dilithium-private-key" class="textarea" placeholder="Paste your Dilithium private key" required></textarea>',
      '      </div>',
      '      <button type="submit" class="btn btn-secondary" style="width: 100%;">Login (legacy)</button>',
      '    </form>',
      '  </details>',
      '  <div class="mt-2 text-center">',
      '    <p class="text-muted">Don&#39;t have an account? <a href="#" id="request-account-link" class="text-primary" style="text-decoration: underline;">Request new account</a></p>',
      '  </div>',
      '</div>'
    ].join('');

    const showKpMessage = (type, text) => {
      const box = document.getElementById('kp-message');
      const cls = type === 'error' ? 'alert alert-error' : type === 'success' ? 'alert alert-success' : 'alert alert-info';
      box.innerHTML = '<div class="' + cls + '">' + text + '</div>';
    };

    // Legacy login submit
    const legacyForm = document.getElementById('login-legacy-form');
    legacyForm.addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    document.getElementById('request-account-link').addEventListener('click', (e) => {
      e.preventDefault();
      this.openAccountRequestEmail();
    });

    // Keypack form behavior
    let selectedFile = null;
    const drop = document.getElementById('kp-file-drop');
    const input = document.getElementById('kp-file');
    const info = document.getElementById('kp-file-info');
    drop.addEventListener('click', () => input.click());
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('dragover'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault(); drop.classList.remove('dragover');
      const files = e.dataTransfer.files; if (files && files.length) handleFile(files[0]);
    });
    input.addEventListener('change', (e) => { if (e.target.files.length) handleFile(e.target.files[0]); });
    const handleFile = (file) => {
      if (!file.name.endsWith('.keypack')) { showKpMessage('error', 'Please select a .keypack file'); return; }
      selectedFile = file; info.style.display = 'block';
      info.innerHTML = '<strong>[OK] File selected:</strong> ' + file.name + '<br><small>Size: ' + (file.size/1024).toFixed(2) + ' KB</small>';
    };

    document.getElementById('keypack-login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const kpEmailEl = document.getElementById('kp-email');
      const kpPassEl = document.getElementById('kp-passphrase');
      const email = kpEmailEl ? kpEmailEl.value.trim() : '';
      const passphrase = kpPassEl ? kpPassEl.value.trim() : '';
      if (!selectedFile) { showKpMessage('error', 'Please select your keypack file'); return; }
      try {
        showKpMessage('info', 'Loading keypack...');
        const keypackText = await selectedFile.text();
        const keypackData = JSON.parse(keypackText);
        if (keypackData.format !== 'veritas-keypack-v1') { showKpMessage('error', 'Invalid keypack file format'); return; }
        showKpMessage('info', 'Initializing cryptography...');
        await window.VeritasCrypto.ensureCryptoReady();
        showKpMessage('info', 'Decrypting keypack...');
        let keypack;
        try {
          keypack = await window.VeritasCrypto.decryptKeypack(keypackData.encrypted, passphrase);
        } catch (err) {
          showKpMessage('error', 'Incorrect passphrase or corrupted keypack file');
          return;
        }
        if (keypack.email !== email) { showKpMessage('error', 'Email mismatch. This keypack is for: ' + keypack.email); return; }
        showKpMessage('info', 'Signing login challenge...');
        const timestamp = Date.now();
        const challenge = 'login:' + email + ':' + timestamp;
        const signature = await window.VeritasCrypto.signData(challenge, keypack.keys.dilithium.private);
        showKpMessage('info', 'Authenticating...');
        const resp = await fetch('/api/auth/login', { method:'POST', headers:{ 'Content-Type':'application/json' }, body: JSON.stringify({ email, signature, timestamp }) });
        const result = await resp.json();
        if (!result.success) { showKpMessage('error', result.error || 'Login failed. Please check your credentials.'); return; }
        showKpMessage('success', '[OK] Login successful! Redirecting...');
        // Hydrate SPA session
        this.currentUser = result.data.user;
        localStorage.setItem('veritas-user', JSON.stringify(this.currentUser));
        this.sessionToken = result.data.sessionToken;
        this.privateKeys = { kyber: keypack.keys.kyber.private, dilithium: keypack.keys.dilithium.private };
        this.persistSession();
        // Also store keypack-style data for compatibility
        sessionStorage.setItem('veritas-keys', JSON.stringify(keypack.keys));
        localStorage.setItem('veritas-session', JSON.stringify({ email, userId: result.data.user.id, accountType: result.data.user.accountType, sessionToken: result.data.sessionToken, loginTime: Date.now() }));
        this.navigateTo('dashboard');
      } catch (err) {
        console.error('Keypack login error:', err);
        showKpMessage('error', 'Login error: ' + (err && err.message ? err.message : String(err)));
      }
    });
  }

  renderDashboard() {
    const content = document.getElementById('content');
    content.innerHTML = [
      '<div class="dashboard-stats">',
      '  <div class="stat-card">',
      '    <div class="stat-number" id="owned-count">-</div>',
      '    <div class="stat-label">Owned Assets</div>',
      '  </div>',
      '  <div class="stat-card">',
      '    <div class="stat-number" id="created-count">-</div>',
      '    <div class="stat-label">Created Assets</div>',
      '  </div>',
      '  <div class="stat-card">',
      '    <div class="stat-number">$25</div>',
      '    <div class="stat-label">Per Asset</div>',
      '  </div>',
      '</div>',
      '<div class="grid grid-2">',
      '  <div class="card">',
      '    <div class="card-header">',
      '      <h3 class="card-title">Quick Actions</h3>',
      '    </div>',
      '    <div style="display: flex; gap: 1rem; flex-wrap: wrap;">',
      '      <a href="#" data-nav="create-asset" class="btn btn-primary">Create New Asset</a>',
      '      <button id="btn-invite-user" class="btn btn-secondary">Invite a Friend</button>',
      '    </div>',
      '  </div>',
      '  <div class="card">',
      '    <div class="card-header">',
      '      <h3 class="card-title">Account Information</h3>',
      '    </div>',
      '    <p><strong>Email:</strong> ' + this.currentUser.email + '</p>',
      '    <p><strong>Account Type:</strong> ' + this.currentUser.accountType + '</p>',
      '    <p><strong>Member Since:</strong> ' + new Date(this.currentUser.createdAt).toLocaleDateString() + '</p>',
      '  </div>',
      '</div>',
      '<div class="card">',
      '  <div class="card-header">',
      '    <h3 class="card-title">Your Assets</h3>',
      '  </div>',
      '  <div id="user-assets" class="loading"><div class="spinner"></div></div>',
      '</div>'
    ].join('');

    // Standard users can invite friends (standard user invites only)
    const inviteBtn = document.getElementById('btn-invite-user');
    if (inviteBtn) inviteBtn.addEventListener('click', () => this.showInviteModal());

    this.loadUserAssets();
  }

  renderCreateAsset() {
    const content = document.getElementById('content');
    content.innerHTML = [
      '<div class="card" style="max-width: 600px; margin: 0 auto;">',
      '  <div class="card-header">',
      '    <h2 class="card-title">Register New Document</h2>',
      '    <p class="card-subtitle">Store your legal document as an NFT on the blockchain ($25 fee)</p>',
      '  </div>',
      '  <form id="create-asset-form">',
      '    <div class="form-group">',
      '      <label class="label" for="asset-title">Document Title</label>',
      '      <input type="text" id="asset-title" class="input" required>',
      '    </div>',
      '    <div class="form-group">',
      '      <label class="label" for="asset-description">Description</label>',
      '      <textarea id="asset-description" class="textarea"></textarea>',
      '    </div>',
      '    <div class="form-group">',
      '      <label class="label" for="document-type">Document Type</label>',
      '      <select id="document-type" class="select" required>',
      '        <option value="">Select type...</option>',
      '        <option value="will">Will</option>',
      '        <option value="deed">Property Deed</option>',
      '        <option value="certificate">Certificate</option>',
      '        <option value="contract">Contract</option>',
      '        <option value="other">Other</option>',
      '      </select>',
      '    </div>',
      '    <div class="form-group">',
      '      <label class="label" for="document-file">Document File</label>',
      '      <input type="file" id="document-file" class="input" required>',
      '    </div>',
      '    <div class="form-group">',
      '      <label><input type="checkbox" id="public-searchable"> Make this document publicly searchable</label>',
      '    </div>',
      '    <p style="font-size: 0.85rem; color: #64748b; margin-bottom: 1rem;">Your document is encrypted locally and signed with your Dilithium key before upload.</p>',
      '    <button type="submit" class="btn btn-primary" style="width: 100%;">Register Document ($25)</button>',
      '  </form>',
      '</div>'
    ].join('');

    document.getElementById('create-asset-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleCreateAsset();
    });
  }

  renderSearch() {
    const content = document.getElementById('content');
    content.innerHTML = [
      '<div class="card">',
      '  <div class="card-header">',
      '    <h2 class="card-title">Search Assets</h2>',
      '    <p class="card-subtitle">Explore publicly available legal documents</p>',
      '  </div>',
      '  <form id="search-form" style="display: flex; gap: 1rem; margin-bottom: 2rem;">',
      '    <input type="text" id="search-query" class="input" placeholder="Search assets..." style="flex: 1;">',
      '    <select id="search-type" class="select" style="width: 200px;">',
      '      <option value="">All Types</option>',
      '      <option value="will">Will</option>',
      '      <option value="deed">Property Deed</option>',
      '      <option value="certificate">Certificate</option>',
      '      <option value="contract">Contract</option>',
      '      <option value="other">Other</option>',
      '    </select>',
      '    <button type="submit" class="btn btn-primary">Search</button>',
      '  </form>',
      '  <div id="search-results" class="grid grid-3">',
      '    <!-- Search results will be populated here -->',
      '  </div>',
      '</div>'
    ].join('');

    document.getElementById('search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSearch();
    });

    // Load initial results
    this.handleSearch();
  }

  renderDocs() {
    const content = document.getElementById('content');
    content.innerHTML = [
      '<div class="docs-container">',
      '  <div class="docs-header">',
      '    <h1 class="docs-title">📚 Documentation</h1>',
      '    <p class="docs-subtitle">Secure legal document storage powered by post-quantum cryptography</p>',
      '  </div>',
      '  <div id="docs-content" class="docs-content">',
      '    <div class="loading"><div class="spinner"></div><p>Loading documentation...</p></div>',
      '  </div>',
      '</div>'
    ].join('');

    // Add styles for docs page
    if (!document.getElementById('docs-styles')) {
      const style = document.createElement('style');
      style.id = 'docs-styles';
      style.textContent = [
        '.docs-container {',
        '  max-width: 1200px;',
        '  margin: 0 auto;',
        '  padding: 2rem 1rem;',
        '}',
        '',
        '.docs-header {',
        '  text-align: center;',
        '  margin-bottom: 3rem;',
        '}',
        '',
        '.docs-title {',
        '  font-size: clamp(2rem, 5vw, 3rem);',
        '  font-weight: 800;',
        '  color: #0f172a;',
        '  margin-bottom: 1rem;',
        '  letter-spacing: -0.025em;',
        '}',
        '',
        '.docs-subtitle {',
        '  font-size: clamp(1rem, 2.5vw, 1.25rem);',
        '  color: #64748b;',
        '  max-width: 600px;',
        '  margin: 0 auto;',
        '}',
        '',
        '.docs-content {',
        '  min-height: 400px;',
        '}',
        '',
        '.docs-sections {',
        '  display: grid;',
        '  gap: 2rem;',
        '}',
        '',
        '.docs-section {',
        '  background: #fff;',
        '  border-radius: 16px;',
        '  padding: 2rem;',
        '  box-shadow: 0 4px 6px rgba(0,0,0,0.05);',
        '  border: 1px solid #e5e7eb;',
        '}',
        '',
        '.docs-section-title {',
        '  font-size: 1.5rem;',
        '  font-weight: 700;',
        '  color: #1f2937;',
        '  margin-bottom: 0.5rem;',
        '  display: flex;',
        '  align-items: center;',
        '  gap: 0.5rem;',
        '}',
        '',
        '.docs-section-subtitle {',
        '  color: #6b7280;',
        '  margin-bottom: 1.5rem;',
        '  font-size: 1rem;',
        '  line-height: 1.5;',
        '}',
        '',
        '.docs-grid {',
        '  display: grid;',
        '  gap: 1rem;',
        '  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));',
        '}',
        '',
        '.doc-card {',
        '  border: 1px solid #e5e7eb;',
        '  border-radius: 12px;',
        '  padding: 1.5rem;',
        '  text-decoration: none;',
        '  color: inherit;',
        '  display: block;',
        '  transition: all 0.2s ease;',
        '  background: #fff;',
        '  position: relative;',
        '  overflow: hidden;',
        '}',
        '',
        '.doc-card::before {',
        '  content: "";',
        '  position: absolute;',
        '  top: 0;',
        '  left: 0;',
        '  right: 0;',
        '  height: 3px;',
        '  background: linear-gradient(90deg, #667eea, #764ba2);',
        '  opacity: 0;',
        '  transition: opacity 0.2s ease;',
        '}',
        '',
        '.doc-card:hover {',
        '  transform: translateY(-2px);',
        '  box-shadow: 0 8px 25px rgba(0,0,0,0.1);',
        '  border-color: #667eea;',
        '}',
        '',
        '.doc-card:hover::before {',
        '  opacity: 1;',
        '}',
        '',
        '.doc-card-title {',
        '  font-size: 1.125rem;',
        '  font-weight: 600;',
        '  margin-bottom: 0.5rem;',
        '  color: #1f2937;',
        '  display: flex;',
        '  align-items: center;',
        '  gap: 0.5rem;',
        '}',
        '',
        '.doc-card-desc {',
        '  color: #6b7280;',
        '  font-size: 0.875rem;',
        '  line-height: 1.4;',
        '  margin-bottom: 1rem;',
        '}',
        '',
        '.doc-card-meta {',
        '  display: flex;',
        '  justify-content: space-between;',
        '  align-items: center;',
        '  font-size: 0.75rem;',
        '  color: #9ca3af;',
        '}',
        '',
        '.badge {',
        '  display: inline-flex;',
        '  align-items: center;',
        '  padding: 0.25rem 0.5rem;',
        '  border-radius: 9999px;',
        '  font-size: 0.625rem;',
        '  font-weight: 600;',
        '  text-transform: uppercase;',
        '  letter-spacing: 0.025em;',
        '}',
        '',
        '.badge-user {',
        '  background: #dbeafe;',
        '  color: #1e40af;',
        '}',
        '',
        '.badge-dev {',
        '  background: #fef3c7;',
        '  color: #92400e;',
        '}',
        '',
        '.doc-viewer {',
        '  background: #fff;',
        '  border-radius: 12px;',
        '  padding: 2rem;',
        '  box-shadow: 0 4px 6px rgba(0,0,0,0.05);',
        '  border: 1px solid #e5e7eb;',
        '  line-height: 1.7;',
        '}',
        '',
        '.doc-viewer .loading {',
        '  text-align: center;',
        '  padding: 3rem;',
        '  color: #6b7280;',
        '}',
        '',
        '.doc-nav {',
        '  margin-bottom: 1rem;',
        '  padding-bottom: 1rem;',
        '  border-bottom: 1px solid #e5e7eb;',
        '}',
        '',
        '.doc-nav-link {',
        '  color: #667eea;',
        '  text-decoration: none;',
        '  font-weight: 500;',
        '  padding: 0.5rem 1rem;',
        '  border-radius: 6px;',
        '  transition: background-color 0.2s ease;',
        '}',
        '',
        '.doc-nav-link:hover {',
        '  background: #f3f4f6;',
        '}',
        '',
        '@media (max-width: 768px) {',
        '  .docs-container {',
        '    padding: 1rem 0.5rem;',
        '  }',
        '  .docs-grid {',
        '    grid-template-columns: 1fr;',
        '  }',
        '  .docs-section {',
        '    padding: 1.5rem;',
        '  }',
        '  .doc-viewer {',
        '    padding: 1.5rem;',
        '  }',
        '}'
      ].join('\\n');
      document.head.appendChild(style);
    }

    // Load docs catalog
    this.loadDocsCatalog();
  }

  async loadDocsCatalog() {
    const content = document.getElementById('docs-content');
    content.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading documentation...</p></div>';

    try {
      const response = await fetch('/api/docs/');
      if (!response.ok) throw new Error('Failed to load docs catalog');
      
      const html = await response.text();
      content.innerHTML = html;

      // Add click handlers for doc cards
      document.querySelectorAll('.doc-card').forEach(card => {
        card.addEventListener('click', (e) => {
          e.preventDefault();
          const href = card.getAttribute('href');
          if (href) {
            const slug = href.replace('/docs/', '');
            this.showDocViewer(slug);
          }
        });
      });
    } catch (error) {
      console.error('Error loading docs catalog:', error);
      content.innerHTML = '<div class="alert alert-error">Failed to load documentation catalog. Please try again later.</div>';
    }
  }

  async showDocViewer(slug) {
    const content = document.getElementById('docs-content');
    
    // Show loading state
    content.innerHTML = [
      '<div class="doc-viewer">',
      '  <div class="doc-nav">',
      '    <a href="#" class="doc-nav-link" onclick="window.app.loadDocsCatalog(); return false;">← Back to Documentation</a>',
      '  </div>',
      '  <div class="loading"><div class="spinner"></div><p>Loading document...</p></div>',
      '</div>'
    ].join('');

    try {
      const response = await fetch('/api/docs/' + slug);
      if (!response.ok) throw new Error('Failed to load document');
      
      const data = await response.json();
      if (data.success) {
        const html = this.markdownToHtml(data.data.content);
        const title = data.data.title || slug.replace(/_/g, ' ');
        
        content.innerHTML = [
          '<div class="doc-viewer">',
          '  <div class="doc-nav">',
          '    <a href="#" class="doc-nav-link" onclick="window.app.loadDocsCatalog(); return false;">← Back to Documentation</a>',
          '  </div>',
          '  <h1 style="font-size: 2rem; font-weight: 700; color: #0f172a; margin-bottom: 0.5rem; border-bottom: 2px solid #e5e7eb; padding-bottom: 0.5rem;">' + title + '</h1>',
          html,
          '</div>'
        ].join('');
      } else {
        content.innerHTML = [
          '<div class="doc-viewer">',
          '  <div class="doc-nav">',
          '    <a href="#" class="doc-nav-link" onclick="window.app.loadDocsCatalog(); return false;">← Back to Documentation</a>',
          '  </div>',
          '  <div class="alert alert-error">Failed to load document: ' + (data.error || 'Unknown error') + '</div>',
          '</div>'
        ].join('');
      }
    } catch (error) {
      console.error('Error loading document:', error);
      content.innerHTML = [
        '<div class="doc-viewer">',
        '  <div class="doc-nav">',
        '    <a href="#" class="doc-nav-link" onclick="window.app.loadDocsCatalog(); return false;">← Back to Documentation</a>',
        '  </div>',
        '  <div class="alert alert-error">Failed to load document. Please try again later.</div>',
        '</div>'
      ].join('');
    }
  }

  async loadDoc(docName) {
    // Legacy method - redirect to new slug-based system
    const slugMap = {
      'README': 'veritas-documents-chain',
      'ZERO_KNOWLEDGE_ARCHITECTURE': 'technical-information',
      'VDC_INTEGRATION_GUIDE': 'technical-information',
      'DEVELOPMENT_PLAN': 'technical-information',
      'TECHNICAL_STATUS': 'technical-information',
      'SECURITY_GUARDRAILS': 'technical-information'
    };
    
    const slug = slugMap[docName] || docName.toLowerCase().replace(/_/g, '-');
    this.showDocViewer(slug);
  }

  // Enhanced markdown to HTML converter with mobile-first design
  markdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown;
    
    // Code blocks first (to avoid conflicts) - enhanced styling
    const codeBlockRegex = /\`\`\`[\\s\\S]*?\`\`\`/g;
    html = html.replace(codeBlockRegex, function(match) {
      const code = match.slice(3, -3).trim();
      return '<div style="margin:1.5rem 0;"><pre style="background:#0f172a;color:#f1f5f9;border:1px solid #334155;border-radius:12px;padding:1.25rem;overflow-x:auto;margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:0.875rem;line-height:1.5;max-width:100%;box-sizing:border-box;"><code style="font-family:inherit;font-size:inherit;">' + code + '</code></pre></div>';
    });
    
    // Inline code - enhanced styling
    const inlineCodeRegex = /\`([^\`]+)\`/g;
    html = html.replace(inlineCodeRegex, '<code style="background:#f1f5f9;color:#1e293b;padding:0.25rem 0.5rem;border-radius:6px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:0.875rem;border:1px solid #e2e8f0;">$1</code>');
    
    // Headers - improved typography and spacing
    html = html.replace(/^### (.*$)/gim, '<h3 style="font-size:1.5rem;font-weight:600;margin:2rem 0 1rem 0;color:#1e293b;line-height:1.3;letter-spacing:-0.025em;">$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2 style="font-size:1.875rem;font-weight:700;margin:2.5rem 0 1.25rem 0;color:#0f172a;line-height:1.2;letter-spacing:-0.025em;">$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1 style="font-size:2.25rem;font-weight:800;margin:3rem 0 1.5rem 0;color:#0f172a;line-height:1.1;letter-spacing:-0.025em;">$1</h1>');
    
    // Bold and italic - improved contrast
    const boldRegex = /\\*\\*(.*?)\\*\\*/g;
    const italicRegex = /\\*(.*?)\\*/g;
    html = html.replace(boldRegex, '<strong style="font-weight:600;color:#0f172a;">$1</strong>');
    html = html.replace(italicRegex, '<em style="font-style:italic;color:#475569;">$1</em>');
    
    // Links - enhanced styling with better accessibility
    const linkRegex = new RegExp('\\\\[([^\\\\]]+)\\\\]\\\\(([^)]+)\\\\)', 'g');
    html = html.replace(linkRegex, function(match, text, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener noreferrer" style="color:#2563eb;text-decoration:none;border-bottom:1px solid #93c5fd;padding-bottom:2px;transition:color 0.2s ease;">' + text + '</a>';
    });
    
    // Lists - improved spacing and mobile-friendly
    const bulletRegex = /^\\* (.*$)/gim;
    const numberRegex = /^\\d+\\. (.*$)/gim;
    const listWrapRegex = /(<li>.*<\\/li>\\n?)+/g;
    html = html.replace(bulletRegex, '<li style="margin:0.5rem 0;padding-left:0.5rem;position:relative;">$1</li>');
    html = html.replace(numberRegex, '<li style="margin:0.5rem 0;padding-left:0.5rem;position:relative;">$1</li>');
    html = html.replace(listWrapRegex, '<ul style="margin:1.5rem 0;padding-left:1.5rem;list-style:none;">$&</ul>');
    
    // Add bullet points for unordered lists
    html = html.replace(/<ul([^>]*)>/g, '<ul$1>');
    html = html.replace(/(<li[^>]*>)/g, '$1<span style="position:absolute;left:0;top:0.5rem;width:6px;height:6px;background:#64748b;border-radius:50%;display:inline-block;margin-right:0.5rem;"></span>');
    
    // Line breaks and paragraphs - improved readability
    html = html.replace(/\\n\\n/g, '</p><p style="margin:1.25rem 0;line-height:1.7;color:#374151;max-width:100%;word-wrap:break-word;hyphens:auto;">');
    html = html.replace(/\\n/g, '<br>');
    
    // Blockquotes - enhanced styling
    html = html.replace(/^> (.*$)/gim, '<blockquote style="border-left:4px solid #3b82f6;background:#eff6ff;padding:1rem 1.5rem;margin:1.5rem 0;border-radius:8px;font-style:italic;color:#1e40af;">$1</blockquote>');
    
    // Tables - responsive design
    const tableRegex = /\\|(.+)\\|\\n\\|([\\-:]+)\\|\\n((?:\\|.+\\|\\n)+)/g;
    html = html.replace(tableRegex, function(match, headers, separators, rows) {
      const headerCells = headers.split('|').map(h => h.trim()).filter(h => h);
      const rowLines = rows.trim().split('\\n');
      let tableHtml = '<div style="overflow-x:auto;margin:1.5rem 0;"><table style="width:100%;border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;min-width:600px;"><thead><tr>';
      
      headerCells.forEach(header => {
        tableHtml += '<th style="background:#f8fafc;padding:0.75rem 1rem;text-align:left;font-weight:600;color:#374151;border-bottom:2px solid #e2e8f0;">' + header + '</th>';
      });
      
      tableHtml += '</tr></thead><tbody>';
      
      rowLines.forEach(row => {
        const cells = row.split('|').map(c => c.trim()).filter(c => c);
        tableHtml += '<tr>';
        cells.forEach(cell => {
          tableHtml += '<td style="padding:0.75rem 1rem;border-bottom:1px solid #f1f5f9;color:#475569;">' + cell + '</td>';
        });
        tableHtml += '</tr>';
      });
      
      tableHtml += '</tbody></table></div>';
      return tableHtml;
    });
    
    // Wrap in responsive container with improved typography
    html = '<div style="max-width:100%;overflow-wrap:break-word;word-wrap:break-word;hyphens:auto;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;"><div style="max-width:65ch;margin:0 auto;padding:0 1rem;"><p style="margin:1.25rem 0;line-height:1.7;color:#374151;max-width:100%;word-wrap:break-word;hyphens:auto;">' + html + '</p></div></div>';
    
    // Clean up
    html = html.replace(/<p><\\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\\/h[1-6]>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\\/pre>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<div>)/g, '$1');
    html = html.replace(/(<\\/div>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\\/ul>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<table>)/g, '$1');
    html = html.replace(/(<\\/table>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<blockquote>)/g, '$1');
    html = html.replace(/(<\\/blockquote>)<\\/p>/g, '$1');
    
    return html;
  }

  renderActivationPage(token) {
    const content = document.getElementById('content');
    content.innerHTML = [
      '<div class="card" style="max-width: 640px; margin: 2rem auto;">',
      '  <div class="card-header">',
      '    <h2 class="card-title">Activate Your Account</h2>',
      '    <p class="card-subtitle">Complete your account setup with post-quantum security</p>',
      '  </div>',
      '  <form id="activation-form">',
      '    <div class="form-group"><label class="label" for="full-name">Full Name</label><input type="text" id="full-name" class="input" required></div>',
      '    <div class="form-group"><label class="label" for="date-of-birth">Date of Birth</label><input type="date" id="date-of-birth" class="input"></div>',
      '    <div class="form-group"><label class="label" for="address">Address</label><textarea id="address" class="textarea" rows="2"></textarea></div>',
      '    <div class="form-group"><label class="label" for="phone">Phone Number</label><input type="tel" id="phone" class="input"></div>',
      '    <button type="submit" class="btn btn-primary" style="width: 100%;">Generate Keys & Activate</button>',
      '  </form>',
      '  <div id="activation-msg" class="mt-2"></div>',
      '  <div id="passphrase-section" style="display:none;" class="mt-2">',
      '    <div class="alert alert-success">Account Activated!</div>',
      '    <div class="alert alert-warning">',
      '      <strong>WARNING: Save Your Recovery Passphrase</strong><br/>Write down these 12 words in order. You will need them to access your account.',
      '    </div>',
      '    <div id="passphrase-words" style="font-family:monospace;font-size:1.1rem;padding:1rem;background:#f5f5f5;border:2px solid #fbbf24;border-radius:6px;text-align:center;"></div>',
      '    <div class="form-group" style="margin-top:1rem;">',
      '      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">',
      '        <input type="checkbox" id="confirm-saved-passphrase" style="width:auto;">',
      '        <span><strong>I have written down my passphrase in a safe place</strong></span>',
      '      </label>',
      '    </div>',
      '    <button id="download-keypack-btn" class="btn btn-primary" disabled style="width:100%;">[LOCK] Download Keypack File</button>',
      '  </div>',
      '</div>'
    ].join('');

    const showActMsg = (type, text) => {
      const box = document.getElementById('activation-msg');
      const cls = type === 'error' ? 'alert alert-error' : type === 'success' ? 'alert alert-success' : 'alert alert-info';
      box.innerHTML = '<div class="' + cls + '">' + text + '</div>';
    };

    document.getElementById('activation-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fullNameEl = document.getElementById('full-name');
      const dobEl = document.getElementById('date-of-birth');
      const addrEl = document.getElementById('address');
      const phoneEl = document.getElementById('phone');
      const personalDetails = {
        fullName: fullNameEl ? fullNameEl.value : '',
        dateOfBirth: dobEl ? dobEl.value : '',
        address: addrEl ? addrEl.value : '',
        phoneNumber: phoneEl ? phoneEl.value : '',
      };
      try {
        showActMsg('info', 'Initializing post-quantum cryptography...');
        await window.VeritasCrypto.ensureCryptoReady();
        showActMsg('info', 'Generating quantum-resistant keypairs...');
        const keypairs = await window.VeritasCrypto.generateClientKeypair();
        const passphrase = await window.VeritasCrypto.generatePassphrase();
        // Resolve email from token
        const tokenResp = await fetch('/api/auth/token-info?token=' + encodeURIComponent(token));
        const tokenData = await tokenResp.json();
        if (!tokenData.success) { showActMsg('error', tokenData.error || 'Invalid activation token'); return; }
        const userEmail = tokenData.data.email;
        // Encrypt user data
        const userData = { email: userEmail, personalDetails, preferences: {}, createdAt: Date.now() };
        showActMsg('info', 'Encrypting your personal data...');
        const encryptedUserData = await window.VeritasCrypto.encryptDocumentData(JSON.stringify(userData), keypairs.kyberPublicKey);
        // Sign transaction
        const payload = JSON.stringify({ kyberPublicKey: keypairs.kyberPublicKey, dilithiumPublicKey: keypairs.dilithiumPublicKey, encryptedUserData, timestamp: Date.now() });
        const signature = await window.VeritasCrypto.signData(payload, keypairs.dilithiumPrivateKey);
        // Submit activation
        showActMsg('info', 'Activating account on blockchain...');
        const resp = await fetch('/api/auth/activate', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ token, kyberPublicKey: keypairs.kyberPublicKey, dilithiumPublicKey: keypairs.dilithiumPublicKey, encryptedUserData, signature }) });
        const result = await resp.json();
        if (!result.success) { showActMsg('error', result.error || 'Activation failed'); return; }
        // Show passphrase section and download button
        const passSection = document.getElementById('passphrase-section');
        if (passSection) passSection.style.display = 'block';
        const words = document.getElementById('passphrase-words');
        if (words) words.textContent = passphrase;
        const confirmEl = document.getElementById('confirm-saved-passphrase');
        const dlBtn = document.getElementById('download-keypack-btn');
        if (confirmEl && dlBtn) {
          confirmEl.addEventListener('change', function() {
            dlBtn.disabled = !confirmEl.checked;
          });
        }
        if (dlBtn) dlBtn.addEventListener('click', async () => {
          try {
            showActMsg('info', 'Creating encrypted keypack...');
            const keypack = {
              version: '1.0', email: userEmail, timestamp: Date.now(), keyType: 'pqc-kyber768-dilithium2',
              keys: { kyber: { public: keypairs.kyberPublicKey, private: keypairs.kyberPrivateKey }, dilithium: { public: keypairs.dilithiumPublicKey, private: keypairs.dilithiumPrivateKey } }
            };
            const encrypted = await window.VeritasCrypto.encryptKeypack(keypack, passphrase);
            window.VeritasCrypto.downloadKeypack(userEmail, encrypted);
            showActMsg('success', '[SUCCESS] Keypack downloaded! You can now login below.');
          } catch (err) {
            console.error('Keypack download error:', err);
            showActMsg('error', 'Failed to create keypack: ' + (err && err.message ? err.message : String(err)));
          }
        });
      } catch (err) {
        console.error('Activation error:', err);
        showActMsg('error', 'Activation error: ' + (err && err.message ? err.message : String(err)));
      }
    });
  }

  async handleLogin() {
  const email = document.getElementById('email').value.trim();
  const kyberPrivateKey = document.getElementById('kyber-private-key').value.trim();
  const dilithiumPrivateKey = document.getElementById('dilithium-private-key').value.trim();

    if (!email || !kyberPrivateKey || !dilithiumPrivateKey) {
      this.showAlert('error', 'Email, Kyber private key, and Dilithium private key are required.');
      return;
    }

    try {
      await window.VeritasCrypto.ensureCryptoReady();
  const timestamp = Date.now();
  const challenge = 'login:' + email + ':' + timestamp;
      const signature = await window.VeritasCrypto.signData(challenge, dilithiumPrivateKey);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, signature, timestamp }),
      });

      const result = await response.json();
      if (result.success) {
        this.currentUser = result.data.user;
        localStorage.setItem('veritas-user', JSON.stringify(this.currentUser));

        this.sessionToken = result.data.sessionToken;
        this.privateKeys = {
          kyber: kyberPrivateKey,
          dilithium: dilithiumPrivateKey
        };
        this.persistSession();

        if (result.data.encryptedUserData) {
          try {
            const decrypted = await window.VeritasCrypto.decryptDocumentData(
              result.data.encryptedUserData,
              kyberPrivateKey
            );
            this.decryptedProfile = JSON.parse(decrypted);
            sessionStorage.setItem('veritas-profile', JSON.stringify(this.decryptedProfile));
          } catch (decryptError) {
            console.warn('Failed to decrypt user profile:', decryptError);
            this.decryptedProfile = null;
            sessionStorage.removeItem('veritas-profile');
          }
        }

        this.navigateTo('dashboard');
      } else {
        this.showAlert('error', result.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login error:', error);
      this.showAlert('error', 'Network error. Please try again.');
    }
  }

  async handleCreateAsset() {
    try {
      if (!this.currentUser) {
        this.showAlert('error', 'You must be logged in to create an asset.');
        return;
      }

      const titleEl = document.getElementById('asset-title');
      const descEl = document.getElementById('asset-description');
      const typeEl = document.getElementById('document-type');
      const fileEl = document.getElementById('document-file');
      const pubEl = document.getElementById('public-searchable');

      const title = titleEl ? titleEl.value.trim() : '';
      const description = descEl ? descEl.value : '';
      const documentType = typeEl ? typeEl.value : '';
      const isPubliclySearchable = !!(pubEl && pubEl.checked);

      const file = fileEl && fileEl.files && fileEl.files[0] ? fileEl.files[0] : null;

      if (!title || !documentType || !file) {
        this.showAlert('error', 'Please fill in the title, type, and choose a file.');
        return;
      }

      // Ensure cryptography is ready
      await window.VeritasCrypto.ensureCryptoReady();

      // Read file as bytes to preserve binary; wrap into base64 JSON for encryption
      const fileBuffer = await new Promise((resolve, reject) => {
        const reader = new FileReader();
  reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read file'));
        reader.readAsArrayBuffer(file);
      });
      const bytes = new Uint8Array(fileBuffer);
      const base64 = (() => {
        let binary = '';
        const len = bytes.length;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      })();
      const contentType = file.type || 'application/octet-stream';
      const filename = file.name || 'document';
      const documentData = JSON.stringify({ version:'1.0', contentType, filename, encoding:'base64', data: base64 });

      // Encrypt document client-side with user's Kyber public key
      const kyberPublicKey = this.currentUser.publicKey || this.currentUser.kyberPublicKey;
      if (!kyberPublicKey) {
        this.showAlert('error', 'Missing Kyber public key for encryption.');
        return;
      }

      this.showAlert('info', 'Encrypting document...');
      const encryptedData = await window.VeritasCrypto.encryptDocumentData(
        documentData,
        kyberPublicKey
      );

  // Hash the ENCRYPTED payload; server verifies against the sent documentData
  const documentHash = await window.VeritasCrypto.hashData(encryptedData);

      // Prepare signature payload and sign with Dilithium private key from session
      const dilithiumPriv = this.privateKeys && this.privateKeys.dilithium;
      if (!dilithiumPriv) {
        this.showAlert('error', 'Your Dilithium private key is required to sign the request. Please re-login.');
        return;
      }

      const signaturePayload = JSON.stringify({
        userId: this.currentUser.id,
        title,
        description,
        documentType,
        documentHash,
        timestamp: Date.now()
      });

      const signature = await window.VeritasCrypto.signData(signaturePayload, dilithiumPriv);

      // Send to backend for storage (R2 + IPFS) and Stripe session creation
      this.showAlert('info', 'Submitting asset for storage and payment...');
      const resp = await fetch('/api/web3-assets/create-web3', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: this.currentUser.id,
          title,
          description,
          documentType,
          documentData: encryptedData,
          contentType,
          filename,
          isPubliclySearchable,
          signature,
          signaturePayload,
          signatureVersion: '1.0'
        })
      });

      const result = await resp.json();
      if (result && result.success) {
        this.showAlert('success', 'Asset created! Redirecting to payment...');
        if (result.data && result.data.stripeUrl) {
          setTimeout(() => {
            window.location.href = result.data.stripeUrl;
          }, 1200);
        }
      } else {
        const msg = (result && (result.error || result.message)) || 'Asset creation failed';
        this.showAlert('error', msg);
      }
    } catch (err) {
      console.error('handleCreateAsset error:', err);
      this.showAlert('error', (err && err.message) ? err.message : 'Asset creation failed');
    }
  }

  async handleSearch() {
    const queryEl = document.getElementById('search-query');
    const typeEl = document.getElementById('search-type');
    const container = document.getElementById('search-results');

    const q = queryEl ? queryEl.value.trim() : '';
    const t = typeEl ? typeEl.value : '';

    if (container) container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const params = new URLSearchParams();
      if (q) params.append('q', q);
      if (t) params.append('type', t);

      const resp = await fetch('/api/search?' + params.toString());
      const result = await resp.json();

      if (!container) return;

      if (result.success && result.data && Array.isArray(result.data.assets) && result.data.assets.length > 0) {
        container.innerHTML = result.data.assets.map((asset) => (
          '<div class="asset-card">' +
            '<div class="asset-type">' + (asset.documentType || '') + '</div>' +
            '<div class="asset-title">' + (asset.title || '') + '</div>' +
            '<div class="asset-description">' + (asset.description || '') + '</div>' +
            '<div class="asset-meta">' +
              '<span>Token: ' + (asset.tokenId || '') + '</span>' +
              '<span>' + (asset.createdAt ? new Date(asset.createdAt).toLocaleDateString() : '') + '</span>' +
            '</div>' +
          '</div>'
        )).join('');
      } else {
        container.innerHTML = '<p class="text-center text-muted">No assets found matching your search criteria.</p>';
      }
    } catch (err) {
      if (container) container.innerHTML = '<div class="alert alert-error">Failed to search assets</div>';
    }
  }

  renderAdmin() {
    const content = document.getElementById('content');
    content.innerHTML = [
      '<div class="card">',
      '  <div class="card-header">',
      '    <h2 class="card-title" style="color: #f59e0b;">[ADMIN] Admin Panel</h2>',
      '    <p class="card-subtitle">Manage blockchain transactions and system operations</p>',
      '  </div>',
      '  <section class="card" style="margin: 1rem 0;">',
      '    <h3 class="card-title">Generate Activation Link</h3>',
      '    <div class="grid" style="grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 0.75rem; align-items: end;">',
      '      <div class="form-group">',
      '        <label class="label" for="admin-invite-email">User Email</label>',
      '        <input type="email" id="admin-invite-email" class="input" placeholder="user@example.com" />',
      '      </div>',
      '      <div class="form-group">',
      '        <label class="label" for="admin-invite-type">Invite Type</label>',
      '        <select id="admin-invite-type" class="select">',
      '          <option value="user" selected>Standard User</option>',
      '          <option value="admin">Admin User</option>',
      '        </select>',
      '      </div>',
      '      <div>',
      '        <button id="admin-invite-create" class="btn btn-primary">Create Link</button>',
      '      </div>',
      '    </div>',
      '    <div id="admin-invite-result" class="mt-2" style="display:none;"></div>',
      '    <div id="admin-invite-actions" style="display:none; gap: 0.5rem; margin-top: 0.5rem;">',
      '      <button id="admin-invite-copy" class="btn btn-secondary">Copy Link</button>',
      '      <button id="admin-invite-email-btn" class="btn">Compose Email</button>',
      '    </div>',
      '  </section>',
  '  <section class="card" style="margin: 1rem 0;">',
      '    <h3 class="card-title">Blockchain Maintenance</h3>',
      '    <div style="display: flex; gap: 0.75rem; flex-wrap: wrap;">',
  '      <button id="run-maintenance-btn" class="btn btn-primary">',
  '        <span style="margin-right: 0.5rem;">[VERIFY]</span>',
  '        Run Full Maintenance',
  '      </button>',
  '      <label style="display:flex; align-items:center; gap:0.35rem;">',
  '        <input type="checkbox" id="maintenance-relaxed"/>',
  '        <span>Relaxed verify</span>',
  '      </label>',
      '      <button id="rebuild-index-btn" class="btn btn-secondary">',
      '        <span style="margin-right: 0.5rem;">[SYNC]</span>',
      '        Rebuild Transaction Indexes',
      '      </button>',
      '      <button id="view-maintenance-logs-btn" class="btn">',
      '        <span style="margin-right: 0.5rem;">[LOGS]</span>',
      '        View Past Logs',
      '      </button>',
      '    </div>',
      '    <div id="maintenance-status" style="margin-top: 0.75rem; display: none;"></div>',
      '    <div id="rebuild-index-result" style="margin-top: 0.75rem; display: none;"></div>',
      '    <div id="maintenance-logs" style="margin-top: 0.75rem; display: none;"></div>',
      '  </section>',
  '  <section class="card" style="margin: 1rem 0;">',
  '    <h3 class="card-title">IPFS Gateway Tools</h3>',
  '    <div class="grid" style="grid-template-columns: 1fr auto; gap: 0.75rem; align-items: end;">',
  '      <div class="form-group">',
  '        <label class="label" for="ipfs-warm-cid">IPFS CID</label>',
  '        <input type="text" id="ipfs-warm-cid" class="input" placeholder="bafy... or Qm..." />',
  '      </div>',
  '      <div>',
  '        <button id="ipfs-warm-cloudflare" class="btn">Warm Cloudflare</button>',
  '        <button id="ipfs-test-storage" class="btn btn-secondary" style="margin-left:0.5rem;">Test storage.ma-atara.io</button>',
  '      </div>',
  '    </div>',
  '    <div id="ipfs-warm-status" style="margin-top: 0.5rem; display: none;"></div>',
  '    <div id="ipfs-test-status" style="margin-top: 0.5rem; display: none;"></div>',
  '  </section>',
  '  <section class="card" style="margin: 1rem 0;">',
  '    <h3 class="card-title">Ethereum Anchoring</h3>',
  '    <div id="eth-wallet-info" class="alert" style="display:none; margin-bottom:0.75rem;"></div>',
  '    <div class="grid" style="grid-template-columns: 1fr auto; gap: 0.75rem; align-items: end;">',
  '      <div class="form-group">',
  '        <label class="label" for="eth-super-root">Super-Root (0x…)</label>',
  '        <input type="text" id="eth-super-root" class="input" placeholder="0x followed by 64 hex chars" />',
  '      </div>',
  '      <div>',
  '        <button id="eth-compute-btn" class="btn btn-secondary" style="margin-right:0.5rem;">Compute Super-Root</button>',
  '        <button id="eth-commit-btn" class="btn">Submit Commit</button>',
  '        <button id="eth-ping-btn" class="btn btn-secondary" style="margin-left:0.5rem;">Ping RPC</button>',
  '      </div>',
  '    </div>',
  '    <div id="eth-compute-status" style="margin-top: 0.5rem; display: none;"></div>',
  '    <div id="eth-commit-status" style="margin-top: 0.5rem; display: none;"></div>',
  '    <div id="eth-ping-status" style="margin-top: 0.5rem; display: none;"></div>',
  '  </section>',
      '  <div id="admin-content">',
      '    <div class="loading"><div class="spinner"></div><p>Loading pending transactions...</p></div>',
      '  </div>',
      '</div>'
    ].join('');

    // Wire admin invite form
    const emailEl = document.getElementById('admin-invite-email');
    const typeEl = document.getElementById('admin-invite-type');
    const createBtn = document.getElementById('admin-invite-create');
    const resultEl = document.getElementById('admin-invite-result');
    const actionsEl = document.getElementById('admin-invite-actions');
    const copyBtn = document.getElementById('admin-invite-copy');
    const emailBtn = document.getElementById('admin-invite-email-btn');

    if (createBtn) {
      createBtn.onclick = async () => {
        const email = emailEl && emailEl.value ? emailEl.value.trim() : '';
        const inviteType = typeEl && typeEl.value === 'admin' ? 'admin' : 'user';
        if (!email) { if (resultEl) { resultEl.style.display = 'block'; resultEl.className = 'alert alert-error'; resultEl.textContent = 'Please enter a valid email.'; } return; }
        try {
          if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
          const resp = await fetch('/api/auth/admin/create-invite', {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.sessionToken },
            body: JSON.stringify({ email, inviteType })
          });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error || 'Failed to create invite');

          const { activationUrl, expiresAt } = data.data || {};
          if (resultEl) {
            resultEl.style.display = 'block';
            resultEl.className = 'alert alert-success';
            resultEl.innerHTML = 'Link: <a href="' + activationUrl + '" target="_blank">' + activationUrl + '</a>';
          }
          if (actionsEl) actionsEl.style.display = 'flex';
          if (copyBtn) copyBtn.onclick = () => this.copyToClipboard(activationUrl);
          if (emailBtn) emailBtn.onclick = () => this.sendInviteEmail(email, activationUrl, '');
        } catch (err) {
          if (resultEl) { resultEl.style.display = 'block'; resultEl.className = 'alert alert-error'; resultEl.textContent = (err && err.message) ? err.message : String(err); }
        }
      };
    }

    // Wire maintenance buttons
    const runMaintBtn = document.getElementById('run-maintenance-btn');
    const maintStatus = document.getElementById('maintenance-status');
    if (runMaintBtn) {
      runMaintBtn.onclick = async () => {
        try {
          if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
          runMaintBtn.setAttribute('disabled', 'true');
          runMaintBtn.textContent = 'Running maintenance…';
          if (maintStatus) {
            maintStatus.style.display = 'block';
            maintStatus.className = '';
            maintStatus.innerHTML = '<div class="loading"><div class="spinner"></div><p>Verifying chain, syncing storage tiers, and rebuilding indexes…</p></div>';
          }
          const relaxedInputEl = document.getElementById('maintenance-relaxed');
          let relaxed = false;
          if (relaxedInputEl instanceof HTMLInputElement) {
            relaxed = !!relaxedInputEl.checked;
          }
          const resp = await fetch('/api/vdc/maintenance/run', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + this.sessionToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ relaxed })
          });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error || 'Maintenance failed');
          const summary = data.data && data.data.summary ? data.data.summary : {};
          const logId = data.data && data.data.logId;
          if (maintStatus) {
            maintStatus.style.display = 'block';
            maintStatus.className = 'alert alert-success';
            maintStatus.innerHTML = [
              '<strong>[OK] Maintenance completed</strong><br>',
              '<div class="text-muted" style="margin-top: 0.25rem;">Mode: ' + (data.data && data.data.mode ? data.data.mode : (relaxed ? 'relaxed' : 'strict')) + '</div>',
              'Verified: ' + (summary.verified || 0) + ', ',
              'Repaired: ' + (summary.repaired || 0) + ', ',
              'Errors: ' + (summary.errors || 0) + '<br>',
              'Indexed: ' + (summary.indexed || 0) + ', ',
              'Index errors: ' + (summary.indexErrors || 0),
              logId ? '<div style="margin-top: 0.5rem;"><button class="btn btn-secondary btn-sm" id="open-maint-log">Open Log</button></div>' : ''
            ].join('');
            const openBtn = document.getElementById('open-maint-log');
            if (openBtn && logId) {
              openBtn.addEventListener('click', () => this.viewMaintenanceLog(logId));
            }
          }
        } catch (err) {
          if (maintStatus) {
            maintStatus.style.display = 'block';
            maintStatus.className = 'alert alert-error';
            maintStatus.textContent = (err && err.message) ? err.message : String(err);
          }
        } finally {
          runMaintBtn.removeAttribute('disabled');
          runMaintBtn.innerHTML = '<span style="margin-right: 0.5rem;">[VERIFY]</span>Run Full Maintenance';
        }
      };
    }

    // Wire rebuild index button
    // Wire IPFS warm Cloudflare tool
    const warmBtn = document.getElementById('ipfs-warm-cloudflare');
    const warmCid = document.getElementById('ipfs-warm-cid');
    const warmStatus = document.getElementById('ipfs-warm-status');
    if (warmBtn) {
      warmBtn.addEventListener('click', async () => {
        try {
          const cid = (warmCid && warmCid.value) ? warmCid.value.trim() : '';
          if (!cid) {
            if (warmStatus) { warmStatus.style.display = 'block'; warmStatus.className = 'alert alert-error'; warmStatus.textContent = 'Enter a valid IPFS CID.'; }
            return;
          }
          if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
          warmBtn.setAttribute('disabled','true');
          if (warmStatus) { warmStatus.style.display = 'block'; warmStatus.className = ''; warmStatus.innerHTML = '<div class="loading"><div class="spinner"></div><p>Warming Cloudflare gateway…</p></div>'; }
          const resp = await fetch('/api/vdc/ipfs/warm', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + this.sessionToken, 'Content-Type': 'application/json', 'x-admin-secret': '' },
            body: JSON.stringify({ hash: cid, timeoutMs: 8000, retries: 4, backoffMs: 1200, primeWithPinata: true })
          });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error || 'Warm failed');
          const ok = data.data && data.data.cloudflareWarmed;
          const attempts = (data.data && Array.isArray(data.data.attempts)) ? data.data.attempts : [];
          const primed = !!(data.data && data.data.primedPinata);
          if (warmStatus) {
            warmStatus.style.display = 'block';
            warmStatus.className = ok ? 'alert alert-success' : 'alert alert-warning';
            // Use String.fromCharCode(10) to avoid accidental literal newlines breaking the JS string
            const details = attempts
              .map(function(a){
                const method = a.method ? (a.method + ' ') : '';
                return '• ' + (a.ok ? '[OK]' : '[MISS]') + ' ' + (a.status ? '(' + a.status + ')' : '') + ' ' + method + a.url;
              })
              .join(String.fromCharCode(10));
            warmStatus.innerHTML = [
              ok ? 'Cloudflare gateway responded OK for this CID.' : 'Requested; Cloudflare did not respond OK yet. Try again shortly.',
              primed ? '<div style="margin-top:0.5rem;color:#1d4ed8;">Primed via Pinata.</div>' : '',
              attempts.length ? '<pre style="margin-top:0.5rem;white-space:pre-wrap;">' + this.escapeHtml(details) + '</pre>' : ''
            ].join('');
          }
        } catch (err) {
          if (warmStatus) { warmStatus.style.display = 'block'; warmStatus.className = 'alert alert-error'; warmStatus.textContent = (err && err.message) ? err.message : String(err); }
        } finally {
          warmBtn.removeAttribute('disabled');
        }
      });
    }
    // Storage gateway CID test
    const testBtn = document.getElementById('ipfs-test-storage');
    const testStatus = document.getElementById('ipfs-test-status');
    if (testBtn) {
      testBtn.addEventListener('click', async () => {
        try {
          const cid = (warmCid && warmCid.value) ? warmCid.value.trim() : '';
          if (!cid) {
            if (testStatus) { testStatus.style.display = 'block'; testStatus.className = 'alert alert-error'; testStatus.textContent = 'Enter a valid IPFS CID.'; }
            return;
          }
          if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
          testBtn.setAttribute('disabled','true');
          if (testStatus) { testStatus.style.display = 'block'; testStatus.className = ''; testStatus.innerHTML = '<div class="loading"><div class="spinner"></div><p>Testing storage gateway…</p></div>'; }
          const resp = await fetch('/api/vdc/ipfs/test/' + encodeURIComponent(cid), {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + this.sessionToken, 'x-admin-secret': '' }
          });
          const data = await resp.json();
          if (testStatus) {
            const ok = !!data.success;
            testStatus.style.display = 'block';
            testStatus.className = ok ? 'alert alert-success' : 'alert alert-warning';
            testStatus.innerHTML = ok
              ? ('[OK] ' + this.escapeHtml(data.data.method) + ' ' + this.escapeHtml(data.data.url) + ' • ' + this.escapeHtml(String(data.data.status)) + ' in ' + this.escapeHtml(String(data.data.elapsedMs)) + 'ms')
              : ('[WARN] Gateway test failed: ' + this.escapeHtml(data.error || 'unknown error'));
          }
        } catch (err) {
          if (testStatus) {
            testStatus.style.display = 'block';
            testStatus.className = 'alert alert-error';
            const msg = (err && typeof err === 'object' && err !== null && 'message' in err) ? String((err).message) : String(err);
            testStatus.textContent = msg;
          }
        } finally {
          testBtn.removeAttribute('disabled');
        }
      });
    }
    const rebuildBtn = document.getElementById('rebuild-index-btn');
    const rebuildResult = document.getElementById('rebuild-index-result');
    
    if (rebuildBtn) {
      rebuildBtn.onclick = async () => {
        try {
          if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
          rebuildBtn.disabled = true;
          rebuildBtn.textContent = 'Rebuilding indexes...';
          
          const resp = await fetch('/api/vdc/rebuild-indexes', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + this.sessionToken }
          });
          const data = await resp.json();
          
          if (!data.success) throw new Error(data.error || 'Failed to rebuild indexes');
          
          if (rebuildResult) {
            rebuildResult.style.display = 'block';
            rebuildResult.className = 'alert alert-success';
            rebuildResult.innerHTML = [
              '<strong>[OK] Indexes rebuilt successfully!</strong><br>',
              'Blocks scanned: ' + data.data.blocksScanned + '<br>',
              'Transactions indexed: ' + data.data.transactionsIndexed,
              data.data.errors > 0 ? '<br>Errors: ' + data.data.errors : ''
            ].join('');
          }
        } catch (err) {
          if (rebuildResult) {
            rebuildResult.style.display = 'block';
            rebuildResult.className = 'alert alert-error';
            rebuildResult.textContent = (err && err.message) ? err.message : String(err);
          }
        } finally {
          rebuildBtn.disabled = false;
          rebuildBtn.innerHTML = '<span style="margin-right: 0.5rem;">[SYNC]</span>Rebuild Transaction Indexes';
        }
      };
    }

    // Wire Ethereum commit button
  const ethBtn = document.getElementById('eth-commit-btn');
  const ethComputeBtn = document.getElementById('eth-compute-btn');
  const ethSuperEl = document.getElementById('eth-super-root');
    const ethStatus = document.getElementById('eth-commit-status');
    const ethComputeStatus = document.getElementById('eth-compute-status');
    const ethWalletInfo = document.getElementById('eth-wallet-info');
    // Load system wallet address for convenience (no top-level await)
    try {
      if (this.sessionToken && ethWalletInfo) {
        fetch('/api/vdc/ethereum/wallet', { headers: { 'Authorization': 'Bearer ' + this.sessionToken, 'x-admin-secret': '' } })
          .then((resp) => resp.json())
          .then((data) => {
            if (data && data.success && data.data) {
              const addr = data.data.address;
              const configured = !!data.data.configured;
              if (addr) {
                const esc = this.escapeHtml(String(addr));
                const etherscan = 'https://etherscan.io/address/' + esc;
                ethWalletInfo.style.display = 'block';
                ethWalletInfo.className = configured ? 'alert alert-success' : 'alert alert-warning';
                ethWalletInfo.innerHTML = 'System wallet: <code>' + esc + '</code> ' +
                  '<button class="btn btn-secondary btn-sm" id="copy-eth-address" style="margin-left:0.5rem;">Copy</button> ' +
                  '<a href="' + etherscan + '" target="_blank" class="btn btn-sm" style="margin-left:0.5rem;">View on Etherscan</a>' +
                  (configured ? '' : ' <span style="margin-left:0.5rem;">(private key not yet configured)</span>');
                const copyBtn = document.getElementById('copy-eth-address');
                if (copyBtn) copyBtn.addEventListener('click', () => this.copyToClipboard(addr));
              }
            }
          })
          .catch(() => {});
      }
    } catch {}
    // Compute super-root using server endpoint (Maatara Core under the hood)
    if (ethComputeBtn) {
      ethComputeBtn.addEventListener('click', async () => {
        try {
          if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
          ethComputeBtn.setAttribute('disabled','true');
          if (ethComputeStatus) {
            ethComputeStatus.style.display = 'block';
            ethComputeStatus.className = '';
            ethComputeStatus.innerHTML = '<div class="loading"><div class="spinner"></div><p>Computing super-root across all blocks…</p></div>';
          }
          const resp = await fetch('/api/vdc/ethereum/super-root', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + this.sessionToken, 'x-admin-secret': '' }
          });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error || 'Super-root calculation failed');
          const d = data.data || {};
          const root = d.superRoot || '';
          const latest = d.latestBlockNumber;
          const count = d.count;
          if (ethSuperEl && typeof (ethSuperEl).value !== 'undefined') {
            try { (ethSuperEl).value = root; } catch {}
          }
          if (ethComputeStatus) {
            ethComputeStatus.style.display = 'block';
            ethComputeStatus.className = 'alert alert-success';
            ethComputeStatus.innerHTML = '[OK] Super-root computed for ' + this.escapeHtml(String(count)) + ' blocks (latest #' + this.escapeHtml(String(latest)) + '): ' + this.escapeHtml(root);
          }
        } catch (err) {
          if (ethComputeStatus) {
            ethComputeStatus.style.display = 'block';
            ethComputeStatus.className = 'alert alert-error';
            const msg = (err && typeof err === 'object' && err !== null && 'message' in err) ? String(err.message) : String(err);
            ethComputeStatus.textContent = msg;
          }
        } finally {
          ethComputeBtn.removeAttribute('disabled');
        }
      });
    }

    if (ethBtn) {
      ethBtn.addEventListener('click', async () => {
        try {
          let superRoot = '';
          if (ethSuperEl && typeof (ethSuperEl).value !== 'undefined') {
            try { superRoot = String((ethSuperEl).value || '').trim(); } catch {}
          }
          if (!superRoot || !/^0x[0-9a-fA-F]{64}$/.test(superRoot)) {
            if (ethStatus) { ethStatus.style.display = 'block'; ethStatus.className = 'alert alert-error'; ethStatus.textContent = 'Enter a 0x-prefixed 64-hex super-root.'; }
            return;
          }
          // Guardrail: gas cost confirmation
          if (!window.confirm('This will submit an Ethereum transaction and pay gas from the system wallet. Continue?')) {
            return;
          }
          if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
          ethBtn.setAttribute('disabled','true');
          if (ethStatus) { ethStatus.style.display = 'block'; ethStatus.className = ''; ethStatus.innerHTML = '<div class="loading"><div class="spinner"></div><p>Submitting Ethereum commit…</p></div>'; }
          const resp = await fetch('/api/vdc/ethereum/commit', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + this.sessionToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ superRoot })
          });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error || 'Commit failed');
          const tx = data.data && data.data.txHash;
          if (ethStatus) {
            ethStatus.style.display = 'block';
            ethStatus.className = 'alert alert-success';
            const etherscan = 'https://etherscan.io/tx/';
            const link = tx ? (' <a href="' + etherscan + this.escapeHtml(tx) + '" target="_blank">View on Etherscan</a>') : '';
            ethStatus.innerHTML = 'Commit submitted: ' + (tx ? this.escapeHtml(tx) : '[mock]') + link;
          }
        } catch (err) {
          if (ethStatus) {
            ethStatus.style.display = 'block';
            ethStatus.className = 'alert alert-error';
            const msg = (err && typeof err === 'object' && err !== null && 'message' in err) ? String(err.message) : String(err);
            ethStatus.textContent = msg;
          }
        } finally {
          ethBtn.removeAttribute('disabled');
        }
      });
    }
    // Wire Ethereum RPC ping
    const ethPingBtn = document.getElementById('eth-ping-btn');
    const ethPingStatus = document.getElementById('eth-ping-status');
    if (ethPingBtn) {
      ethPingBtn.addEventListener('click', async () => {
        try {
          if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
          ethPingBtn.setAttribute('disabled', 'true');
          if (ethPingStatus) {
            ethPingStatus.style.display = 'block';
            ethPingStatus.className = '';
            ethPingStatus.innerHTML = '<div class="loading"><div class="spinner"></div><p>Pinging Ethereum RPC…</p></div>';
          }
          const resp = await fetch('/api/vdc/ethereum/ping', { headers: { 'Authorization': 'Bearer ' + this.sessionToken, 'x-admin-secret': '' } });
          const data = await resp.json();
          if (ethPingStatus) {
            if (data.success) {
              const cid = data.data && data.data.chainId;
              const elapsed = data.data && data.data.elapsedMs;
              const status = data.data && data.data.status;
              ethPingStatus.className = 'alert alert-success';
              ethPingStatus.innerHTML = '[OK] eth_chainId=' + this.escapeHtml(String(cid)) + ' • ' + this.escapeHtml(String(status)) + ' in ' + this.escapeHtml(String(elapsed)) + 'ms';
            } else {
              ethPingStatus.className = 'alert alert-error';
              ethPingStatus.textContent = (data && data.error) ? String(data.error) : 'RPC ping failed';
            }
          }
        } catch (err) {
          if (ethPingStatus) {
            ethPingStatus.style.display = 'block';
            ethPingStatus.className = 'alert alert-error';
            const msg = (err && typeof err === 'object' && err !== null && 'message' in err) ? String(err.message) : String(err);
            ethPingStatus.textContent = msg;
          }
        } finally {
          ethPingBtn.removeAttribute('disabled');
        }
      });
    }

    // Wire view logs button
    const viewLogsBtn = document.getElementById('view-maintenance-logs-btn');
    const logsContainer = document.getElementById('maintenance-logs');
    if (viewLogsBtn) {
      viewLogsBtn.onclick = async () => {
        try {
          if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
          viewLogsBtn.setAttribute('disabled', 'true');
          if (logsContainer) {
            logsContainer.style.display = 'block';
            logsContainer.innerHTML = '<div class="loading"><div class="spinner"></div><p>Loading logs…</p></div>';
          }
          const resp = await fetch('/api/vdc/maintenance/logs', { headers: { 'Authorization': 'Bearer ' + this.sessionToken } });
          const data = await resp.json();
          if (!data.success) throw new Error(data.error || 'Failed to load logs');
          const list = Array.isArray(data.data) ? data.data : [];
          if (logsContainer) {
            if (list.length === 0) {
              logsContainer.innerHTML = '<p class="text-center text-muted">No maintenance logs found.</p>';
            } else {
              logsContainer.innerHTML = [
                '<div class="card">',
                '  <h4 class="card-title" style="margin-bottom: 0.5rem;">Past Maintenance Logs</h4>',
                '  <div style="display: grid; gap: 0.5rem;">',
                list.map((item) => (
                  '<div class="list-item" style="display:flex; justify-content: space-between; align-items:center; gap: 0.5rem;">' +
                    '<div>' +
                      '<div style="font-weight:600;">' + item.id + '</div>' +
                      '<div style="font-size: 0.8rem; color:#6b7280;">' + (item.createdAt ? new Date(item.createdAt).toLocaleString() : '') + ' • ' + (item.size || 0) + ' bytes</div>' +
                    '</div>' +
                    '<div style="display:flex; gap:0.5rem;">' +
                      '<button class="btn btn-secondary btn-sm" data-log-id="' + item.id + '">Open</button>' +
                    '</div>' +
                  '</div>'
                )).join('') +
                '  </div>',
                '</div>'
              ].join('');
              // Bind open buttons
              const buttons = logsContainer.querySelectorAll('button[data-log-id]');
              buttons.forEach((btn) => {
                btn.addEventListener('click', () => {
                  const id = btn.getAttribute('data-log-id');
                  if (id) this.viewMaintenanceLog(id);
                });
              });
            }
          }
        } catch (err) {
          if (logsContainer) {
            logsContainer.style.display = 'block';
            logsContainer.innerHTML = '<div class="alert alert-error">' + ((err && err.message) ? err.message : String(err)) + '</div>';
          }
        } finally {
          viewLogsBtn.removeAttribute('disabled');
        }
      };
    }

    // Load pending transactions section
    this.loadPendingTransactions();
  }

  async loadPendingTransactions() {
    try {
      const response = await fetch('/api/vdc/pending');
      const result = await response.json();
      
      const container = document.getElementById('admin-content');
      
      if (result.success && result.data.transactions.length > 0) {
        const transactions = result.data.transactions;
        
        const parts = [
          '<div style="margin-bottom: 1.5rem;">',
          '  <h3 style="color: #f59e0b; margin-bottom: 0.5rem;">Pending Transactions (' + transactions.length + ')</h3>',
          '  <p style="font-size: 0.875rem; color: #6b7280;">Click on a transaction to view details and actions</p>',
          '</div>',
          '<div style="display: flex; flex-direction: column; gap: 0.75rem;">'
        ];
        
        transactions.forEach((tx, index) => {
          const txData = tx.data || {};
          const txId = tx.id.replace(/'/g, "\\'");
          
          parts.push(
            '<div class="card" style="border-left: 4px solid #f59e0b; cursor: pointer; transition: all 0.2s;" onclick="window.app.toggleTxDetails(\\'' + txId + '\\')" id="tx-card-' + txId + '">',
            '  <div style="display: flex; justify-content: space-between; align-items: center;">',
            '    <div style="flex: 1; min-width: 0;">',
            '      <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">',
            '        <span style="font-weight: 600; color: #f59e0b;">#' + (index + 1) + '</span>',
            '        <span style="background: #fef3c7; color: #92400e; padding: 0.125rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600; white-space: nowrap;">' + tx.type + '</span>',
            '      </div>',
            '      <div style="font-size: 0.75rem; color: #6b7280; font-family: monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' + tx.id + '</div>',
            '    </div>',
            '    <div style="display: flex; align-items: center; gap: 0.75rem; flex-shrink: 0;">',
            '      <div style="font-size: 0.75rem; color: #6b7280; display: none; sm:block;">' + new Date(tx.timestamp).toLocaleString() + '</div>',
            '      <span id="tx-toggle-' + txId + '" style="color: #f59e0b; font-size: 1.25rem;">▼</span>',
            '    </div>',
            '  </div>',
            '  <div id="tx-details-' + txId + '" style="display: none; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid #e5e7eb;">',
            '    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.75rem; margin-bottom: 1rem; font-size: 0.875rem;">',
            '      <div>',
            '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Asset ID</div>',
            '        <div style="font-family: monospace; font-size: 0.75rem; word-break: break-all;">' + (txData.assetId || 'N/A') + '</div>',
            '      </div>',
            '      <div>',
            '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Token ID</div>',
            '        <div style="font-family: monospace; font-size: 0.75rem; word-break: break-all;">' + (txData.tokenId || 'N/A') + '</div>',
            '      </div>',
            '      <div>',
            '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Creator</div>',
            '        <div style="font-family: monospace; font-size: 0.75rem; word-break: break-all;">' + (txData.creatorId || txData.userId || 'N/A') + '</div>',
            '      </div>',
            '      <div>',
            '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Created</div>',
            '        <div style="font-size: 0.75rem;">' + new Date(tx.timestamp).toLocaleString() + '</div>',
            '      </div>',
            '    </div>',
            '    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">',
            '      <button onclick="event.stopPropagation(); window.app.queryTransaction(\\'' + txId + '\\')" class="btn btn-secondary" style="flex: 1; min-width: 120px;">',
            '        [SEARCH] Query',
            '      </button>',
            '      <button onclick="event.stopPropagation(); window.app.mineTransaction(\\'' + txId + '\\')" class="btn btn-primary" style="flex: 1; min-width: 140px;">',
            '        [APPROVE] Mine Block',
            '      </button>',
            '      <button onclick="event.stopPropagation(); window.app.deleteTransaction(\\'' + txId + '\\')" class="btn" style="flex: 1; min-width: 120px; background: #dc2626; color: white;">',
            '        [DELETE] Delete',
            '      </button>',
            '    </div>',
            '  </div>',
            '</div>'
          );
        });
        
        parts.push('</div>');
        container.innerHTML = parts.join('');
      } else {
        container.innerHTML = [
          '<div style="text-align: center; padding: 3rem; color: #6b7280;">',
          '  <div style="font-size: 3rem; margin-bottom: 1rem;">[CHECK]</div>',
          '  <p style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">No Pending Transactions</p>',
          '  <p style="font-size: 0.875rem;">All transactions have been mined to the blockchain.</p>',
          '</div>'
        ].join('');
      }
    } catch (error) {
      console.error('Failed to load pending transactions:', error);
      document.getElementById('admin-content').innerHTML = '<div class="alert alert-error">Failed to load pending transactions</div>';
    }
  }

  toggleTxDetails(txId) {
    const details = document.getElementById('tx-details-' + txId);
    const toggle = document.getElementById('tx-toggle-' + txId);
    const card = document.getElementById('tx-card-' + txId);
    
    if (details && toggle && card) {
      const isOpen = details.style.display !== 'none';
      
      if (isOpen) {
        details.style.display = 'none';
        toggle.textContent = '▼';
        card.style.background = '';
      } else {
        details.style.display = 'block';
        toggle.textContent = '▲';
        card.style.background = '#fffbeb';
      }
    }
  }

  // Compose and open an invitation email with a preset message and a space for a personal note
  sendInviteEmail(email, activationUrl, personalMessage) {
    try {
      const subject = 'Invitation to Veritas Documents';
      const body = [
        personalMessage || '',
        '',
        'You have been invited to create an account at Veritas Documents.',
        'Please click the link below and activate your account within 6 days:',
        '',
        activationUrl,
        '',
        'If you have any questions, just reply to this email.'
      ].join(String.fromCharCode(10));
      // Use cc as a reliable fallback for Reply-To semantics across clients
      const cc = 'service.desk@rmesolutions.com.au';
      const mailto = 'mailto:' + encodeURIComponent(email) +
        '?subject=' + encodeURIComponent(subject) +
        '&cc=' + encodeURIComponent(cc) +
        '&body=' + encodeURIComponent(body);
      window.open(mailto, '_blank');
    } catch (e) {
      this.showAlert('error', 'Failed to compose email');
    }
  }

  // Show a simple modal for standard users to generate an invite link
  showInviteModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = [
      '<div class="modal-content">',
      '  <div class="modal-header">',
      '    <h3 class="modal-title">Invite a Friend</h3>',
      '    <button class="modal-close" aria-label="Close">×</button>',
      '  </div>',
  '    <div class="modal-body">',
  '      <div class="form-group">',
  '        <label class="form-label" for="invite-email">Friend&apos;s Email</label>',
  '        <input type="email" id="invite-email" class="input" placeholder="friend@example.com" />',
  '      </div>',
      '    <div id="invite-result" class="mt-2" style="display:none;"></div>',
      '  </div>',
      '  <div class="modal-footer">',
      '    <button id="invite-cancel" class="btn">Cancel</button>',
      '    <button id="invite-create" class="btn btn-primary">Create Link</button>',
      '  </div>',
      '</div>'
    ].join('');

    const close = () => { try { document.body.removeChild(modal); } catch {} };
    modal.querySelector('.modal-close').addEventListener('click', close);
    modal.querySelector('#invite-cancel').addEventListener('click', close);
    document.body.appendChild(modal);

    const resultEl = modal.querySelector('#invite-result');
    const createBtn = modal.querySelector('#invite-create');
    createBtn.addEventListener('click', async () => {
      const emailInput = modal.querySelector('#invite-email');
      const email = (emailInput && emailInput.value || '').trim();
      if (!email) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.className = 'alert alert-error'; resultEl.textContent = 'Please enter a valid email.'; }
        return;
      }
      try {
        if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
        const resp = await fetch('/api/auth/send-invite', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + this.sessionToken },
          body: JSON.stringify({ email })
        });
        const data = await resp.json();
        if (!data.success) throw new Error(data.error || 'Failed to create invite');
        const activationUrl = (data.data && data.data.activationUrl) || '';
        if (resultEl) {
          resultEl.style.display = 'block';
          resultEl.className = 'alert alert-success';
          resultEl.innerHTML = 'Link: <a href="' + activationUrl + '" target="_blank">' + activationUrl + '</a>';
        }
        // Replace footer with actions
        const footer = modal.querySelector('.modal-footer');
        if (footer) {
          footer.innerHTML = [
            '<button id="invite-copy" class="btn btn-secondary">Copy Link</button>',
            '<button id="invite-email-btn" class="btn">Compose Email</button>',
            '<button id="invite-close" class="btn">Close</button>'
          ].join('');
          const copyBtn = modal.querySelector('#invite-copy');
          const emailBtn = modal.querySelector('#invite-email-btn');
          const closeBtn = modal.querySelector('#invite-close');
          if (copyBtn) copyBtn.addEventListener('click', () => this.copyToClipboard(activationUrl));
          if (emailBtn) emailBtn.addEventListener('click', () => this.sendInviteEmail(email, activationUrl, ''));
          if (closeBtn) closeBtn.addEventListener('click', close);
        }
      } catch (err) {
        if (resultEl) { resultEl.style.display = 'block'; resultEl.className = 'alert alert-error'; resultEl.textContent = (err && err.message) ? err.message : String(err); }
      }
    });
  }

  async queryTransaction(txId) {
    try {
      // Get transaction details
      const txResponse = await fetch('/api/vdc/pending');
      const txResult = await txResponse.json();
      
      if (!txResult.success) {
        alert('Failed to load transaction details');
        return;
      }
      
      const transaction = txResult.data.transactions.find(tx => tx.id === txId);
      if (!transaction) {
        alert('Transaction not found');
        return;
      }
      
      const txData = transaction.data || {};
      
      // Get user details if available
      let userInfo = '';
      if (txData.creatorId) {
        try {
          const userResponse = await fetch('/api/users/' + txData.creatorId);
          const userResult = await userResponse.json();
          if (userResult.success) {
            const user = userResult.data;
            userInfo = [
              '<div style="background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem;">',
              '  <h4 style="margin: 0 0 0.75rem 0; color: #1f2937;">User Information</h4>',
              '  <div style="display: grid; gap: 0.5rem; font-size: 0.875rem;">',
              '    <div><strong>Email:</strong> ' + (user.email || 'N/A') + '</div>',
              '    <div><strong>Account Type:</strong> <span style="text-transform: capitalize;">' + (user.accountType || 'N/A') + '</span></div>',
              '    <div><strong>Created:</strong> ' + (user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A') + '</div>',
              '    <div><strong>User ID:</strong> <code style="font-size: 0.75rem;">' + user.id + '</code></div>',
              '  </div>',
              '</div>'
            ].join('');
          }
        } catch (err) {
          console.error('Failed to fetch user info:', err);
        }
      }
      
      // Build modal HTML using string concatenation
      const modalHtml = [
        '<div style="max-height: 70vh; overflow-y: auto;">',
        '  <div style="margin-bottom: 1.5rem;">',
        '    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">',
        '      <h3 style="margin: 0; color: #1f2937;">Transaction #' + txId + '</h3>',
        '      <span style="background: #fef3c7; color: #92400e; padding: 0.25rem 0.75rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 600;">' + transaction.type + '</span>',
        '    </div>',
        '    <div style="display: grid; gap: 0.75rem; font-size: 0.875rem;">',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Transaction ID</div>',
        '        <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">' + transaction.id + '</code>',
        '      </div>',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Asset ID</div>',
        '        <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">' + (txData.assetId || 'N/A') + '</code>',
        '      </div>',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Token ID</div>',
        '        <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">' + (txData.tokenId || 'N/A') + '</code>',
        '      </div>',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Document Title</div>',
        '        <div>' + (txData.title || 'N/A') + '</div>',
        '      </div>',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Document Type</div>',
        '        <div style="text-transform: capitalize;">' + (txData.documentType || 'N/A') + '</div>',
        '      </div>',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">IPFS Hash</div>',
        '        <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">' + (txData.ipfsHash || 'N/A') + '</code>',
        '      </div>',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Ethereum TX</div>',
        '        <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">' + (txData.ethereumTxHash || 'N/A') + '</code>',
        '      </div>',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Stripe Session</div>',
        '        <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">' + (txData.stripeSessionId || 'N/A') + '</code>',
        '      </div>',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Paid Amount</div>',
        '        <div>$' + (txData.paidAmount || '25') + '</div>',
        '      </div>',
        '      <div>',
        '        <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Created At</div>',
        '        <div>' + new Date(transaction.timestamp).toLocaleString() + '</div>',
        '      </div>',
        '    </div>',
        userInfo,
        '  </div>',
        '</div>'
      ].join('');
      
      this.showModal('Transaction Details', modalHtml);
    } catch (error) {
      console.error('View document error:', error);
      this.showAlert('error', 'Error loading document: ' + error.message);
    }
  }

  async mineTransaction(txId) {
    if (!confirm('Are you sure you want to approve and mine this transaction into a block?')) {
      return;
    }

    try {
      const response = await fetch('/api/vdc/mine', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.sessionToken
        }
      });

      const result = await response.json();

      if (result.success) {
        this.showAlert('success', 'Block mined successfully!');
        this.loadPendingTransactions();
      } else {
        this.showAlert('error', result.error || 'Failed to mine block');
      }
    } catch (error) {
      console.error('Mine transaction error:', error);
      this.showAlert('error', 'Error mining block: ' + error.message);
    }
  }

  async deleteTransaction(txId) {
    if (!confirm('Are you sure you want to delete this pending transaction? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch('/api/vdc/pending/' + txId, {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer ' + this.sessionToken
        }
      });

      const result = await response.json();

      if (result.success) {
        this.showAlert('success', 'Transaction deleted successfully');
        this.loadPendingTransactions();
      } else {
        this.showAlert('error', result.error || 'Failed to delete transaction');
      }
    } catch (error) {
      console.error('Delete transaction error:', error);
      this.showAlert('error', 'Error deleting transaction: ' + error.message);
    }
  }

  openAccountRequestEmail() {
    const subject = 'Request for Veritas Documents Account';
    const body = 'Hello,\\\\n\\\\nI would like to request an account for Veritas Documents.\\\\n\\\\nPlease provide me with an invitation link.\\\\n\\\\nThank you.';

  const mailtoLink = 'mailto:admin@veritas-documents.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    window.open(mailtoLink);
  }

  async loadUserAssets() {
    try {
      const response = await fetch('/api/web3-assets/user/' + this.currentUser.id);
      const result = await response.json();
      
      const container = document.getElementById('user-assets');
      if (result.success && (result.data.pending?.length > 0 || result.data.confirmed?.length > 0)) {
        const allAssets = [...(result.data.pending || []), ...(result.data.confirmed || [])];
        
        // Sort by creation date, newest first
        allAssets.sort((a, b) => b.createdAt - a.createdAt);
        
        // Render compact list: single row per asset with View action
        container.innerHTML = '<div class="asset-list">' + allAssets.map(asset => (
          '<div class="asset-row" style="display:flex;align-items:center;gap:1rem;padding:0.75rem 0;border-bottom:1px solid #e5e7eb;">' +
            '<div style="flex:2;min-width:200px;"><strong>' + this.escapeHtml(asset.title) + '</strong><div class="text-muted" style="font-size:12px;">' + this.escapeHtml(asset.documentType || 'unknown') + '</div></div>' +
            '<div style="flex:2;min-width:240px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;" title="' + this.escapeHtml(asset.description || '') + '">' + this.escapeHtml(asset.description || '') + '</div>' +
            '<div style="flex:1;min-width:120px;">' + new Date(asset.createdAt).toLocaleDateString() + '</div>' +
            '<div style="flex:1;min-width:120px;"><span class="badge ' + (asset.status === 'confirmed' ? 'badge-success' : 'badge-warning') + '">' + (asset.status || asset.paymentStatus) + '</span></div>' +
            '<div style="flex:0;white-space:nowrap;"><button class="btn btn-secondary btn-sm" onclick="app.viewAsset(\\'' + asset.id + '\\')">View</button></div>' +
          '</div>'
        )).join('') + '</div>';
        
        document.getElementById('owned-count').textContent = result.data.confirmed?.length || 0;
        document.getElementById('created-count').textContent = allAssets.length;
      } else {
        container.innerHTML = '<p class="text-center text-muted">No assets found. Create your first asset to get started!</p>';
        document.getElementById('owned-count').textContent = '0';
        document.getElementById('created-count').textContent = '0';
      }
    } catch (error) {
      console.error('Failed to load assets:', error);
      document.getElementById('user-assets').innerHTML = '<div class="alert alert-error">Failed to load assets</div>';
    }
  }

  async viewAsset(assetId) {
    try {
      // Fetch asset details (verification and IDs)
      const resp = await fetch('/api/web3-assets/web3/' + assetId);
      const result = await resp.json();
      if (!result.success) { this.showAlert('error', result.error || 'Failed to load asset'); return; }
      const asset = result.data.asset;
      const ver = result.data.verifications || {};

      const body = [
        '<div class="asset-detail">',
        '<div style="margin-bottom:0.75rem"><strong>Title:</strong> ' + this.escapeHtml(asset.title || '') + '</div>',
        '<div style="margin-bottom:0.75rem"><strong>Description:</strong> ' + this.escapeHtml(asset.description || '') + '</div>',
        '<div style="display:grid;grid-template-columns:160px 1fr;gap:0.5rem;align-items:start">',
        '<div><strong>Asset ID</strong></div><div>' + this.escapeHtml(asset.id) + '</div>',
        '<div><strong>Token ID</strong></div><div>' + this.escapeHtml(asset.tokenId || '') + '</div>',
        '<div><strong>Type</strong></div><div>' + this.escapeHtml(asset.documentType || 'unknown') + '</div>',
        '<div><strong>Created</strong></div><div>' + new Date(asset.createdAt).toLocaleString() + '</div>',
        asset.blockNumber ? ('<div><strong>VDC Block</strong></div><div>' + asset.blockNumber + '</div>') : '',
        asset.ethereumTxHash ? ('<div><strong>Ethereum tx</strong></div><div><a href="#" target="_blank">' + this.escapeHtml(asset.ethereumTxHash) + '</a></div>') : '',
        asset.ipfsHash ? (
          '<div><strong>IPFS</strong></div><div>' +
          (asset.ipfsGatewayUrlPinata ? ('<a class="btn btn-link btn-sm" href="' + this.escapeHtml(asset.ipfsGatewayUrlPinata) + '" target="_blank">Pinata</a>') : '') +
          '<a class="btn btn-link btn-sm" href="https://ipfs.io/ipfs/' + this.escapeHtml(asset.ipfsHash) + '" target="_blank" style="margin-left:0.5rem;">ipfs.io</a>' +
          '<a class="btn btn-link btn-sm" href="https://dweb.link/ipfs/' + this.escapeHtml(asset.ipfsHash) + '" target="_blank" style="margin-left:0.5rem;">dweb.link</a>' +
          '<a class="btn btn-link btn-sm" href="https://gateway.pinata.cloud/ipfs/' + this.escapeHtml(asset.ipfsHash) + '" target="_blank" style="margin-left:0.5rem;">pinata gw</a>' +
          '<div style="font-size:12px;color:#6b7280;word-break:break-all;">' + this.escapeHtml(asset.ipfsHash) + '</div>' +
          '</div>'
        ) : '',
        asset.ipfsMetadataHash ? (
          '<div><strong>Metadata</strong></div><div>' +
          (asset.metadataGatewayUrlPinata ? ('<a class="btn btn-link btn-sm" href="' + this.escapeHtml(asset.metadataGatewayUrlPinata) + '" target="_blank">Pinata</a>') : '') +
          '<a class="btn btn-link btn-sm" href="https://ipfs.io/ipfs/' + this.escapeHtml(asset.ipfsMetadataHash) + '" target="_blank" style="margin-left:0.5rem;">ipfs.io</a>' +
          '<a class="btn btn-link btn-sm" href="https://dweb.link/ipfs/' + this.escapeHtml(asset.ipfsMetadataHash) + '" target="_blank" style="margin-left:0.5rem;">dweb.link</a>' +
          '<a class="btn btn-link btn-sm" href="https://gateway.pinata.cloud/ipfs/' + this.escapeHtml(asset.ipfsMetadataHash) + '" target="_blank" style="margin-left:0.5rem;">pinata gw</a>' +
          '<div style="font-size:12px;color:#6b7280;word-break:break-all;">' + this.escapeHtml(asset.ipfsMetadataHash) + '</div>' +
          '</div>'
        ) : '',
        '</div>',
        '<div style="margin-top:1rem;display:flex;gap:0.5rem;align-items:center">',
        '<button class="btn btn-primary btn-sm" id="btn-decrypt-doc">Decrypt & View</button>',
        '<a class="btn btn-secondary btn-sm" id="btn-download-encrypted" href="#">Download (encrypted)</a>',
        '</div>',
        '<div id="asset-viewer" style="margin-top:1rem;max-height:60vh;overflow:auto;border:1px solid #e5e7eb;border-radius:6px;padding:0.75rem;display:none"></div>',
        '</div>'
      ].join('');

      this.showModal('Asset: ' + (asset.title || asset.id), body);

      // Wire up buttons
      const dlBtn = document.getElementById('btn-download-encrypted');
      if (dlBtn) {
        dlBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          const enc = await this.fetchEncryptedAsset(asset.id);
          if (!enc) return;
          const blob = new Blob([enc], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = asset.id + '.encrypted.json'; a.click();
          URL.revokeObjectURL(url);
        });
      }

      const decBtn = document.getElementById('btn-decrypt-doc');
      if (decBtn) {
        decBtn.addEventListener('click', async () => {
          try {
            await window.VeritasCrypto.ensureCryptoReady();
            const kyberPriv = this.privateKeys && this.privateKeys.kyber;
            if (!kyberPriv) { this.showAlert('error', 'Kyber private key missing. Please re-login.'); return; }
            const enc = await this.fetchEncryptedAsset(asset.id);
            if (!enc) return;
            const plaintext = await window.VeritasCrypto.decryptDocumentData(enc, kyberPriv);
            // Try to render nicely by detecting our base64-wrapped envelope
            let viewer = document.getElementById('asset-viewer');
            if (!viewer) return;
            viewer.style.display = 'block';
            // Helper to decode base64 to Uint8Array
            const base64ToBytes = (b64) => {
              const bin = atob(b64);
              const len = bin.length;
              const arr = new Uint8Array(len);
              for (let i = 0; i < len; i++) arr[i] = bin.charCodeAt(i);
              return arr;
            };
            let envelope = null;
            try { envelope = JSON.parse(plaintext); } catch {}

            if (envelope && typeof envelope === 'object' && envelope.encoding === 'base64' && typeof envelope.data === 'string') {
              const mime = envelope.contentType || 'application/octet-stream';
              const name = envelope.filename || (asset.title || asset.id);
              const bytes = base64ToBytes(envelope.data);
              const blob = new Blob([bytes], { type: mime });
              const url = URL.createObjectURL(blob);

              // Render by MIME type
              if (mime.startsWith('image/')) {
                viewer.innerHTML = '<img src="' + url + '" alt="' + this.escapeHtml(name) + '" style="max-width:100%;height:auto;display:block;margin:0 auto;" />';
              } else if (mime === 'application/pdf') {
                viewer.innerHTML = '<iframe src="' + url + '" style="width:100%;height:60vh;border:none;"></iframe>';
              } else if (mime.startsWith('text/') || mime === 'application/json') {
                try {
                  const text = new TextDecoder().decode(bytes);
                  let pretty = text;
                  if (mime === 'application/json') {
                    try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
                  }
                  viewer.innerHTML = '<pre style="white-space:pre-wrap;word-break:break-word;">' + this.escapeHtml(pretty) + '</pre>';
                } catch {
                  viewer.innerHTML = '<pre style="white-space:pre-wrap;word-break:break-word;">[Unable to display text]</pre>';
                }
              } else {
                viewer.innerHTML = '<div class="text-muted">Preview not available for this file type (' + this.escapeHtml(mime) + '). Use download instead.</div>';
              }

              // Add download (decrypted) using original filename
              const dl = document.createElement('a');
              dl.textContent = 'Download (decrypted)';
              dl.className = 'btn btn-secondary btn-sm';
              dl.style.marginLeft = '0.5rem';
              dl.href = url; dl.download = name;
              const actions = (document.getElementById('btn-download-encrypted') || decBtn).parentElement;
              if (actions && !actions.querySelector('.download-decrypted')) {
                dl.classList.add('download-decrypted');
                actions.appendChild(dl);
              }
            } else {
              // Fallback: show plaintext as JSON/text
              try {
                const obj = JSON.parse(plaintext);
                viewer.innerHTML = '<pre style="white-space:pre-wrap;word-break:break-word;">' + this.escapeHtml(JSON.stringify(obj, null, 2)) + '</pre>';
              } catch {
                viewer.innerHTML = '<pre style="white-space:pre-wrap;word-break:break-word;">' + this.escapeHtml(plaintext) + '</pre>';  
              }
              // Plaintext download fallback
              const dl = document.createElement('a');
              dl.textContent = 'Download (decrypted)';
              dl.className = 'btn btn-secondary btn-sm';
              dl.style.marginLeft = '0.5rem';
              const blob = new Blob([plaintext], { type: 'text/plain' });
              const url = URL.createObjectURL(blob);
              dl.href = url; dl.download = (asset.title || asset.id) + '.txt';
              const actions = (document.getElementById('btn-download-encrypted') || decBtn).parentElement;
              if (actions && !actions.querySelector('.download-decrypted')) {
                dl.classList.add('download-decrypted');
                actions.appendChild(dl);
              }
            }
          } catch (e) {
            this.showAlert('error', (e && e.message) ? e.message : 'Failed to decrypt document');
          }
        });
      }
    } catch (e) {
      this.showAlert('error', (e && e.message) ? e.message : 'Failed to load asset');
    }
  }

  async fetchEncryptedAsset(assetId) {
    try {
      const resp = await fetch('/api/web3-assets/web3/' + assetId + '/encrypted');
      const json = await resp.json();
      if (!json.success) { this.showAlert('error', json.error || 'Failed to retrieve encrypted document'); return null; }
      return json.data && json.data.encryptedData;
    } catch (e) {
      this.showAlert('error', (e && e.message) ? e.message : 'Failed to retrieve encrypted document');
      return null;
    }
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('veritas-user');
    localStorage.removeItem('veritas-session');
    localStorage.removeItem('veritas-keys');
    sessionStorage.clear();
    this.navigateTo('login');
  }

  showAlert(type, message) {
    const existing = document.querySelector('.alert');
    if (existing) existing.remove();

    const alert = document.createElement('div');
    alert.className = 'alert alert-' + type;
    alert.textContent = message;
    
    const content = document.getElementById('content');
    content.insertBefore(alert, content.firstChild);
    
    setTimeout(() => alert.remove(), 5000);
  }

  showModal(title, bodyHtml) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = '<div class="modal-content"><div class="modal-header"><h3 class="modal-title">' + title + '</h3><button class="modal-close" onclick="this.closest(\\'.modal\\').remove()">&times;</button></div><div class="modal-body">' + bodyHtml + '</div></div>';
    document.body.appendChild(modal);
  }

  async viewMaintenanceLog(logId) {
    try {
      if (!this.sessionToken) throw new Error('Session expired. Please log in again.');
      const resp = await fetch('/api/vdc/maintenance/logs/' + logId, { headers: { 'Authorization': 'Bearer ' + this.sessionToken } });
      if (resp.status === 404) throw new Error('Log not found');
      const text = await resp.text();
      let pretty = text;
      try { pretty = JSON.stringify(JSON.parse(text), null, 2); } catch {}
      const body = '<pre style="max-height:60vh; overflow:auto; background:#0f172a; color:#e5e7eb; padding:1rem; border-radius:0.5rem;">' + this.escapeHtml(pretty) + '</pre>' +
                   '<div style="margin-top:0.5rem;"><button class="btn btn-secondary btn-sm" id="download-log-btn">Download</button></div>';
      this.showModal('Maintenance Log ' + logId, body);
      const btn = document.getElementById('download-log-btn');
      if (btn) {
        btn.addEventListener('click', async () => {
          const blob = new Blob([text], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = logId + '.json'; a.click();
          URL.revokeObjectURL(url);
        });
      }
    } catch (err) {
      this.showAlert('error', (err && err.message) ? err.message : String(err));
    }
  }

  escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VeritasApp();
});`;

  return c.text(js, 200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'no-store'
  });
});

// API Routes
import docsHandler from './handlers/docs';

app.route('/api/auth', authHandler);
app.route('/api/assets', assetHandler);
app.route('/api/web3-assets', enhancedAssetHandler);
app.route('/api/users', userHandler);
app.route('/api/stripe', stripeHandler);
app.route('/api/search', searchHandler);
app.route('/api/docs', docsHandler);
app.route('/api/vdc', vdcHandler);
app.route('/api/storage-verify', storageVerifyHandler);

// HTML template for the SPA
const appHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Veritas Documents</title>
    <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
    <div id="app">
        <header class="header">
            <div class="container">
                <h1 class="logo"><a href="/" style="color: inherit; text-decoration: none;">Veritas Documents</a></h1>
                <nav class="nav" id="nav">
                    <!-- Navigation will be populated by JavaScript -->
                </nav>
            </div>
        </header>
        
        <main class="main">
            <div class="container">
                <div id="content">
                    <!-- Content will be populated by JavaScript -->
                </div>
            </div>
        </main>
    </div>
    
  <script src="/static/app.bundle.js?v=12"></script>
  <script src="/static/app.js?v=12"></script>
</body>
</html>
`;

// Serve the main application (SPA - handles client-side routing)
app.get('/', (c) => c.html(appHTML));
app.get('/activate', (c) => c.html(appHTML));
app.get('/dashboard', (c) => c.html(appHTML));
app.get('/create-asset', (c) => c.html(appHTML));
app.get('/search', (c) => c.html(appHTML));
app.get('/docs', (c) => c.html(appHTML));

// Keypack activation and login pages (new flow)
app.get('/activate-keypack.html', async (c) => {
  try {
    const env = c.env;
    const r2 = await env.VDC_STORAGE?.get('static/activate-keypack.html');
    if (r2) {
      return c.html(await r2.text());
    }
  } catch {}
  // Fallback to bundled public file
  const fallback = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/public/activate-keypack.html${c.req.url.includes('?') ? '?' + c.req.url.split('?')[1] : ''}"><title>Redirecting…</title></head><body>Redirecting…</body></html>`;
  return c.html(fallback);
});

app.get('/login-keypack.html', async (c) => {
  try {
    const env = c.env;
    const r2 = await env.VDC_STORAGE?.get('static/login-keypack.html');
    if (r2) {
      return c.html(await r2.text());
    }
  } catch {}
  // Fallback to bundled public file
  const fallback = `<!DOCTYPE html><html><head><meta http-equiv="refresh" content="0; url=/public/login-keypack.html"><title>Redirecting…</title></head><body>Redirecting…</body></html>`;
  return c.html(fallback);
});

// Web3 Demo page - serve static demo file
app.get('/demo', async (c) => {
  const demoContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Veritas Documents - Web3 Demo</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; background: #f8fafc; }
        .card { background: white; border-radius: 8px; padding: 24px; margin: 16px 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .form-group { margin: 16px 0; }
        label { display: block; margin-bottom: 8px; font-weight: 500; }
        input, textarea, select { width: 100%; padding: 12px; border: 1px solid #d1d5db; border-radius: 6px; font-size: 14px; }
        button { background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin: 0.5rem; transition: background 0.2s; }
        .btn-secondary { background: #6b7280; }
        .status { padding: 12px; border-radius: 6px; margin: 16px 0; }
        .success { background: #dcfce7; color: #166534; }
        .error { background: #fef2f2; color: #dc2626; }
        .info { background: #eff6ff; color: #1d4ed8; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        pre { background: #1f2937; color: #f9fafb; padding: 16px; border-radius: 6px; overflow-x: auto; margin: 1rem 0; }
    </style>
</head>
<body>
    <h1>[SECURE] Veritas Documents - Web3 Integration Demo</h1>
    <p>Demonstrating IPFS storage and Ethereum anchoring with post-quantum cryptography</p>
    <div class="card">
        <h3>Web3 Integration Status</h3>
        <p>[OK] IPFS Client implemented with Cloudflare Gateway</p>
        <p>[OK] Ethereum Anchoring using Maatara post-quantum signatures</p>
        <p>[OK] Enhanced asset handlers with Web3 capabilities</p>
        <p>[CONFIG] Ready for testing with real credentials</p>
        
        <h4>Available Endpoints:</h4>
        <ul>
            <li><code>POST /api/web3-assets/create-web3</code> - Create asset with IPFS + Ethereum</li>
            <li><code>GET /api/web3-assets/web3/:id</code> - Get asset with verification</li>
            <li><code>POST /api/web3-assets/web3/:id/decrypt</code> - Decrypt content from IPFS</li>
        </ul>
        
        <h4>Next Steps:</h4>
        <ol>
            <li>Configure Cloudflare Web3 Gateway credentials in wrangler.toml</li>
            <li>Set up Ethereum network configuration</li>
            <li>Test IPFS upload/retrieval functionality</li>
            <li>Verify Ethereum anchoring process</li>
        </ol>
    </div>
</body>
</html>`;
  
  return c.html(demoContent);
});

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// PQC health check: validate server-side WASM + system key signing
app.get('/health/pqc', async (c) => {
  try {
    const env = c.env as Environment;
    const client = new MaataraClient(env);

    // Resolve system Dilithium private key (supports split storage)
    const direct = (env as any).SYSTEM_DILITHIUM_PRIVATE_KEY as string | undefined;
    const part1 = (env as any).SYSTEM_DILITHIUM_PRIVATE_KEY_PART1 as string | undefined;
    const part2 = (env as any).SYSTEM_DILITHIUM_PRIVATE_KEY_PART2 as string | undefined;
    const secret = direct && direct.length > 0 ? direct : `${part1 || ''}${part2 || ''}`;
    if (!secret) {
      return c.json({ ok: false, error: 'System Dilithium private key not configured' }, 500);
    }

    // Attempt a small sign to force WASM initialization server-side
    const sig = await client.signData('pqc-health', secret);
    return c.json({ ok: true, signaturePreview: sig?.slice(0, 12) || '' });
  } catch (err: any) {
    return c.json({ ok: false, error: err?.message || String(err) }, 500);
  }
});

// Success page after Stripe payment
app.get('/success', async (c) => {
  const sessionId = c.req.query('session_id');
  const assetId = c.req.query('asset_id');
  
  const successHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Payment Successful - Veritas Documents</title>
  <link rel="stylesheet" href="/static/styles.css">
  <style>
    .success-container {
      max-width: 600px;
      margin: 4rem auto;
      padding: 2rem;
      text-align: center;
    }
    .success-icon {
      font-size: 4rem;
      margin-bottom: 1rem;
    }
    .success-title {
      font-size: 2rem;
      font-weight: 600;
      color: var(--success-color);
      margin-bottom: 1rem;
    }
    .success-message {
      font-size: 1.1rem;
      color: var(--text-secondary);
      margin-bottom: 2rem;
      line-height: 1.8;
    }
    .processing-info {
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      border-radius: 8px;
      padding: 1.5rem;
      margin: 2rem 0;
      text-align: left;
    }
    .processing-info h3 {
      color: #1d4ed8;
      margin-bottom: 1rem;
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }
    .processing-info p {
      color: #1e40af;
      margin-bottom: 0.5rem;
    }
    .processing-info strong {
      color: #1e3a8a;
    }
    .asset-details {
      background: var(--surface);
      border-radius: 8px;
      padding: 1.5rem;
      margin: 2rem 0;
      text-align: left;
    }
    .asset-details dt {
      font-weight: 600;
      color: var(--text-primary);
      margin-top: 1rem;
    }
    .asset-details dd {
      color: var(--text-secondary);
      margin-left: 0;
      font-family: monospace;
      font-size: 0.9rem;
      word-break: break-all;
    }
    .btn {
      display: inline-block;
      padding: 0.75rem 1.5rem;
      background: var(--primary-color);
      color: white;
      text-decoration: none;
      border-radius: 6px;
      margin: 0.5rem;
      transition: background 0.2s;
    }
    .btn:hover {
      background: var(--primary-hover);
    }
    .btn-secondary {
      background: var(--secondary-color);
    }
  </style>
</head>
<body>
  <div class="success-container">
    <div class="success-icon">[SUCCESS]</div>
    <h1 class="success-title">Payment Successful!</h1>
    <p class="success-message">
      Your asset has been created and payment has been received.
      Thank you for using Veritas Documents!
    </p>

    <div class="processing-info">
      <h3>[PROCESSING] Asset Registration in Progress</h3>
      <p>
        Your document is now securely stored on IPFS with post-quantum encryption.
        <strong>Blockchain registration is currently being processed.</strong>
      </p>
      <p style="margin-top: 1rem;">
        [TIME] <strong>Processing Time:</strong> Please allow up to 24 hours for your asset 
        to be permanently registered on the Veritas Documents Chain (VDC).
      </p>
      <p>
        [EMAIL] <strong>Notification:</strong> We will email you once your asset registration 
        is confirmed on the blockchain.
      </p>
      <p style="margin-top: 1rem; font-size: 0.9rem; color: #64748b;">
        Your asset is already securely encrypted and stored. The blockchain registration 
        adds an immutable record with dual post-quantum signatures for maximum security.
      </p>
    </div>

    ${assetId ? `
    <div class="asset-details">
      <h3>Asset Details</h3>
      <dl>
        <dt>Asset ID</dt>
        <dd>${assetId}</dd>
        ${sessionId ? `
        <dt>Payment Session</dt>
        <dd>${sessionId}</dd>
        ` : ''}
        <dt>Status</dt>
        <dd>[SUCCESS] Payment Completed | [PROCESSING] Blockchain Registration Pending</dd>
      </dl>
    </div>
    ` : ''}

    <div style="margin-top: 2rem;">
      <a href="/dashboard" class="btn">Go to Dashboard</a>
      <a href="/create-asset" class="btn btn-secondary">Create Another Asset</a>
    </div>

    <p style="margin-top: 2rem; color: var(--text-muted); font-size: 0.9rem;">
      Questions? Contact support or check your dashboard for asset status updates.
    </p>
  </div>
</body>
</html>`;

  return c.html(successHTML);
});

// Catch-all for SPA routing
app.get('*', (c) => {
  return c.redirect('/');
});

export default app;