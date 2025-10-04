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

      // Get asset from KV
      const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
      if (!assetData) {
        console.error('Asset not found:', assetId);
        return c.json({ success: false, error: 'Asset not found' }, 404);
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
      
      const userData = await env.VERITAS_KV.get(`user:${userId}`);
      if (!userData) {
        console.error('User not found:', userId);
        return c.json({ success: false, error: 'User not found' }, 404);
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
          paidAmount: session.amount_total ? session.amount_total / 100 : 25,
          createdAt: asset.createdAt,
        },
        signatures: {
          user: {
            publicKey: user.dilithiumPublicKey,
            signature: asset.signature,
          },
          system: {
            publicKey: env.SYSTEM_DILITHIUM_PUBLIC_KEY,
            signature: '',
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

      asset.vdcTransactionId = vdcTransactionId;
      await env.VERITAS_KV.put(`asset:${assetId}`, JSON.stringify(asset));

      console.log('✅ VDC transaction created and pending mining:', vdcTransactionId);
      console.log('✅ Pending count:', pendingCount);
      console.log('✅ Asset payment completed - pending VDC mining for:', user.email);
    }

    return c.json({ success: true, message: 'Webhook processed' });
  } catch (error: any) {
    console.error('Error processing webhook:', error);
    return c.json({ success: false, error: error.message || 'Internal server error' }, 500);
  }
});

// Serve static files
app.get('/static/styles.css', async (c) => {
  const css = `/* Veritas Documents - Clean, minimalist styles */

:root {
  --primary-color: #2563eb;
  --primary-hover: #1d4ed8;
  --secondary-color: #64748b;
  --success-color: #059669;
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

  init() {
    // Check if user is logged in
    const storedUser = localStorage.getItem('veritas-user');
    if (storedUser) {
      this.currentUser = JSON.parse(storedUser);
      this.currentPage = 'dashboard';
    }

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
      '<div class="card" style="max-width: 420px; margin: 2rem auto;">',
      '  <div class="card-header">',
      '    <h2 class="card-title">Login to Veritas Documents</h2>',
      '    <p class="card-subtitle">Zero-knowledge authentication with post-quantum cryptography</p>',
      '  </div>',
      '  <form id="login-form">',
      '    <div class="form-group">',
      '      <label class="label" for="email">Email</label>',
      '      <input type="email" id="email" class="input" required>',
      '    </div>',
      '    <div class="form-group">',
      '      <label class="label" for="kyber-private-key">Kyber Private Key (decryption)</label>',
      '      <textarea id="kyber-private-key" class="textarea" placeholder="Paste your Kyber private key" required></textarea>',
      '    </div>',
      '    <div class="form-group">',
      '      <label class="label" for="dilithium-private-key">Dilithium Private Key (signature)</label>',
      '      <textarea id="dilithium-private-key" class="textarea" placeholder="Paste your Dilithium private key" required></textarea>',
      '    </div>',
      '    <button type="submit" class="btn btn-primary" style="width: 100%;">Login</button>',
      '  </form>',
  '  <div class="mt-2 text-center">',
  '    <p class="text-muted">Don&#39;t have an account? <a href="#" id="request-account-link" class="text-primary" style="text-decoration: underline;">Request new account</a></p>',
  '  </div>',
      '</div>'
    ].join('');

    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });

    document.getElementById('request-account-link').addEventListener('click', (e) => {
      e.preventDefault();
      this.openAccountRequestEmail();
    });
  }

  renderDashboard() {
    const content = document.getElementById('content');
    content.innerHTML = \`<div class="dashboard-stats"><div class="stat-card"><div class="stat-number" id="owned-count">-</div><div class="stat-label">Owned Assets</div></div><div class="stat-card"><div class="stat-number" id="created-count">-</div><div class="stat-label">Created Assets</div></div><div class="stat-card"><div class="stat-number">$25</div><div class="stat-label">Per Asset</div></div></div><div class="grid grid-2"><div class="card"><div class="card-header"><h3 class="card-title">Quick Actions</h3></div><div style="display: flex; gap: 1rem; flex-wrap: wrap;"><a href="#" data-nav="create-asset" class="btn btn-primary">Create New Asset</a><button id="invite-user" class="btn btn-secondary">Invite User</button></div></div><div class="card"><div class="card-header"><h3 class="card-title">Account Information</h3></div><p><strong>Email:</strong> \${this.currentUser.email}</p><p><strong>Account Type:</strong> \${this.currentUser.accountType}</p><p><strong>Member Since:</strong> \${new Date(this.currentUser.createdAt).toLocaleDateString()}</p></div></div><div class="card"><div class="card-header"><h3 class="card-title">Your Assets</h3></div><div id="user-assets" class="loading"><div class="spinner"></div></div></div>\`;

    this.loadUserAssets();
    document.getElementById('invite-user').addEventListener('click', () => this.showInviteModal());
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
    content.innerHTML = \`<div class="card"><div class="card-header"><h2 class="card-title">Search Assets</h2><p class="card-subtitle">Explore publicly available legal documents</p></div><form id="search-form" style="display: flex; gap: 1rem; margin-bottom: 2rem;"><input type="text" id="search-query" class="input" placeholder="Search assets..." style="flex: 1;"><select id="search-type" class="select" style="width: 200px;"><option value="">All Types</option><option value="will">Will</option><option value="deed">Property Deed</option><option value="certificate">Certificate</option><option value="contract">Contract</option><option value="other">Other</option></select><button type="submit" class="btn btn-primary">Search</button></form></div><div id="search-results" class="grid grid-3"><!-- Search results will be populated here --></div>\`;

    document.getElementById('search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSearch();
    });

    // Load initial results
    this.handleSearch();
  }

  renderDocs() {
    const content = document.getElementById('content');
    content.innerHTML = \`
      <div class="docs-container">
        <div class="docs-sidebar">
          <h3 class="docs-sidebar-title">📚 Documentation</h3>
          <nav class="docs-nav">
            <a href="#" class="docs-nav-link active" data-doc="README">README</a>
            <a href="#" class="docs-nav-link" data-doc="BLOCKCHAIN_ARCHITECTURE">Blockchain Architecture</a>
            <a href="#" class="docs-nav-link" data-doc="ZERO_KNOWLEDGE_ARCHITECTURE">Zero-Knowledge Architecture</a>
            <a href="#" class="docs-nav-link" data-doc="VDC_INTEGRATION_GUIDE">VDC Integration Guide</a>
            <a href="#" class="docs-nav-link" data-doc="DEVELOPMENT_PLAN">Development Plan</a>
            <a href="#" class="docs-nav-link" data-doc="TECHNICAL_STATUS">Technical Status</a>
            <a href="#" class="docs-nav-link" data-doc="SECURITY_GUARDRAILS">Security Guardrails</a>
          </nav>
        </div>
        <div class="docs-content">
          <div id="doc-viewer" class="doc-viewer">
            <div class="loading">Loading documentation...</div>
          </div>
        </div>
      </div>
    \`;

    // Add styles for docs page
    if (!document.getElementById('docs-styles')) {
      const style = document.createElement('style');
      style.id = 'docs-styles';
      style.textContent = \`
        .docs-container {
          display: grid;
          grid-template-columns: 280px 1fr;
          gap: 2rem;
          max-width: 1400px;
          margin: 0 auto;
        }
        
        .docs-sidebar {
          background: var(--surface);
          border-radius: 8px;
          padding: 1.5rem;
          height: fit-content;
          position: sticky;
          top: 2rem;
        }
        
        .docs-sidebar-title {
          margin: 0 0 1rem 0;
          font-size: 1.25rem;
          color: var(--text-primary);
        }
        
        .docs-nav {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        
        .docs-nav-link {
          padding: 0.75rem 1rem;
          color: var(--text-secondary);
          text-decoration: none;
          border-radius: 6px;
          transition: all 0.2s;
          font-size: 0.95rem;
        }
        
        .docs-nav-link:hover {
          background: var(--background);
          color: var(--primary-color);
        }
        
        .docs-nav-link.active {
          background: var(--primary-color);
          color: white;
          font-weight: 500;
        }
        
        .docs-content {
          background: white;
          border-radius: 8px;
          padding: 2.5rem;
          box-shadow: 0 1px 3px rgba(0,0,0,0.1);
          min-height: 600px;
        }
        
        .doc-viewer {
          line-height: 1.7;
        }
        
        .doc-viewer h1 { font-size: 2.5rem; margin: 0 0 1rem 0; color: var(--text-primary); }
        .doc-viewer h2 { font-size: 1.75rem; margin: 2rem 0 1rem 0; color: var(--text-primary); border-bottom: 2px solid var(--border); padding-bottom: 0.5rem; }
        .doc-viewer h3 { font-size: 1.35rem; margin: 1.5rem 0 0.75rem 0; color: var(--text-primary); }
        .doc-viewer h4 { font-size: 1.15rem; margin: 1.25rem 0 0.5rem 0; color: var(--text-secondary); }
        .doc-viewer p { margin: 0 0 1rem 0; color: var(--text-secondary); }
        .doc-viewer ul, .doc-viewer ol { margin: 0 0 1rem 0; padding-left: 2rem; }
        .doc-viewer li { margin: 0.5rem 0; color: var(--text-secondary); }
        .doc-viewer code { background: var(--surface); padding: 0.2rem 0.4rem; border-radius: 3px; font-family: 'Courier New', monospace; font-size: 0.9em; }
        .doc-viewer pre { background: #1e293b; color: #e2e8f0; padding: 1.5rem; border-radius: 6px; overflow-x: auto; margin: 1rem 0; }
        .doc-viewer pre code { background: none; padding: 0; color: inherit; }
        .doc-viewer blockquote { border-left: 4px solid var(--primary-color); padding-left: 1rem; margin: 1rem 0; color: var(--text-secondary); font-style: italic; }
        .doc-viewer table { width: 100%; border-collapse: collapse; margin: 1rem 0; }
        .doc-viewer th, .doc-viewer td { padding: 0.75rem; text-align: left; border-bottom: 1px solid var(--border); }
        .doc-viewer th { background: var(--surface); font-weight: 600; color: var(--text-primary); }
        .doc-viewer a { color: var(--primary-color); text-decoration: none; }
        .doc-viewer a:hover { text-decoration: underline; }
        .doc-viewer hr { border: none; border-top: 1px solid var(--border); margin: 2rem 0; }
        .doc-viewer .loading { text-align: center; padding: 3rem; color: var(--text-muted); }
        
        @media (max-width: 768px) {
          .docs-container {
            grid-template-columns: 1fr;
          }
          
          .docs-sidebar {
            position: static;
          }
        }
      \`;
      document.head.appendChild(style);
    }

    // Load documentation
    this.loadDoc('README');

    // Handle doc navigation
    document.querySelectorAll('.docs-nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const docName = link.getAttribute('data-doc');
        
        // Update active state
        document.querySelectorAll('.docs-nav-link').forEach(l => l.classList.remove('active'));
        link.classList.add('active');
        
        // Load doc
        this.loadDoc(docName);
      });
    });
  }

  async loadDoc(docName) {
    const viewer = document.getElementById('doc-viewer');
    viewer.innerHTML = '<div class="loading">Loading documentation...</div>';

    try {
      const response = await fetch(\`/api/docs/\${docName}\`);
      if (!response.ok) throw new Error('Failed to load documentation');
      
      const data = await response.json();
      if (data.success) {
        // Convert markdown to HTML
        const html = this.markdownToHtml(data.data.content);
        viewer.innerHTML = html;
      } else {
        viewer.innerHTML = '<div class="alert alert-error">Failed to load documentation</div>';
      }
    } catch (error) {
      console.error('Error loading doc:', error);
      viewer.innerHTML = '<div class="alert alert-error">Failed to load documentation. Please try again later.</div>';
    }
  }

  // Simple markdown to HTML converter
  markdownToHtml(markdown) {
    if (!markdown) return '';

    let html = markdown;
    
    // Code blocks first (to avoid conflicts)
    const codeBlockRegex = /\`\`\`[\\s\\S]*?\`\`\`/g;
    html = html.replace(codeBlockRegex, function(match) {
      const code = match.slice(3, -3).trim();
      return '<pre><code>' + code + '</code></pre>';
    });
    
    // Inline code
    const inlineCodeRegex = /\`([^\`]+)\`/g;
    html = html.replace(inlineCodeRegex, '<code>$1</code>');
    
    // Headers
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Bold and italic
    const boldRegex = /\\*\\*(.*?)\\*\\*/g;
    const italicRegex = /\\*(.*?)\\*/g;
    html = html.replace(boldRegex, '<strong>$1</strong>');
    html = html.replace(italicRegex, '<em>$1</em>');
    
    // Links - build regex from string to avoid escaping issues
    const linkRegex = new RegExp('\\\\[([^\\\\]]+)\\\\]\\\\(([^)]+)\\\\)', 'g');
    html = html.replace(linkRegex, function(match, text, url) {
      return '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>';
    });
    
    // Lists
    const bulletRegex = /^\\* (.*$)/gim;
    const numberRegex = /^\\d+\\. (.*$)/gim;
    const listWrapRegex = /(<li>.*<\\/li>\\n?)+/g;
    html = html.replace(bulletRegex, '<li>$1</li>');
    html = html.replace(numberRegex, '<li>$1</li>');
    html = html.replace(listWrapRegex, '<ul>$&</ul>');
    
    // Line breaks
    html = html.replace(/\\n\\n/g, '</p><p>');
    html = html.replace(/\\n/g, '<br>');
    
    // Wrap in paragraph
    html = '<p>' + html + '</p>';
    
    // Clean up
    html = html.replace(/<p><\\/p>/g, '');
    html = html.replace(/<p>(<h[1-6]>)/g, '$1');
    html = html.replace(/(<\\/h[1-6]>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<pre>)/g, '$1');
    html = html.replace(/(<\\/pre>)<\\/p>/g, '$1');
    html = html.replace(/<p>(<ul>)/g, '$1');
    html = html.replace(/(<\\/ul>)<\\/p>/g, '$1');
    
    return html;
  }

  renderActivationPage(token) {
    const content = document.getElementById('content');
    content.innerHTML = \`<div class="card" style="max-width: 500px; margin: 2rem auto;"><div class="card-header"><h2 class="card-title">Activate Your Account</h2><p class="card-subtitle">Complete your account setup</p></div><form id="activation-form"><div class="form-group"><label class="label" for="full-name">Full Name</label><input type="text" id="full-name" class="input" required></div><div class="form-group"><label class="label" for="date-of-birth">Date of Birth</label><input type="date" id="date-of-birth" class="input"></div><div class="form-group"><label class="label" for="address">Address</label><textarea id="address" class="textarea"></textarea></div><div class="form-group"><label class="label" for="phone">Phone Number</label><input type="tel" id="phone" class="input"></div><button type="submit" class="btn btn-primary" style="width: 100%;">Activate Account</button></form></div>\`;

    document.getElementById('activation-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleActivation(token);
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

  async handleActivation(token) {
    const personalDetails = {
      fullName: document.getElementById('full-name').value,
      dateOfBirth: document.getElementById('date-of-birth').value,
      address: document.getElementById('address').value,
      phoneNumber: document.getElementById('phone').value,
    };

    let progressModal;
    try {
      // Show progress modal
      progressModal = this.showProgressModal(
        'Activating Account',
        'Generating post-quantum cryptographic keys...'
      );

      // Initialize Post-Quantum Cryptography
      console.log('Initializing PQC for key generation...');
      await window.VeritasCrypto.ensureCryptoReady();
      
      // Generate both Kyber-768 (encryption) and Dilithium-2 (signing) keypairs client-side
      console.log('Generating post-quantum keypairs...');
      const keyPair = await window.VeritasCrypto.generateClientKeypair();
      console.log('Keypairs generated successfully');
      
      // Update progress message
      progressModal.querySelector('.progress-modal-message').textContent = 'Encrypting personal information...';
      
      // Get email from activation form (should be pre-filled or from token)
      const email = document.getElementById('email')?.value || '';
      
      // Prepare user data to encrypt (this stays client-side only)
      const userData = {
        email,
        personalDetails,
        timestamp: Date.now()
      };
      
      // Encrypt user data with their own Kyber public key (zero-knowledge)
      console.log('Encrypting user data...');
      const userDataStr = JSON.stringify(userData);
      const encryptedUserData = await window.VeritasCrypto.encryptDocumentData(
        userDataStr,
        keyPair.kyberPublicKey
      );
      console.log('User data encrypted');
      
      // Update progress message
      progressModal.querySelector('.progress-modal-message').textContent = 'Signing blockchain transaction...';
      
      // Sign the blockchain transaction with Dilithium private key
      console.log('Signing blockchain transaction...');
      const blockData = {
        kyberPublicKey: keyPair.kyberPublicKey,
        dilithiumPublicKey: keyPair.dilithiumPublicKey,
        encryptedUserData,
        timestamp: Date.now()
      };
      const signature = await window.VeritasCrypto.signData(
        JSON.stringify(blockData), 
        keyPair.dilithiumPrivateKey
      );
      console.log('Transaction signed');

      // Update progress message
      progressModal.querySelector('.progress-modal-message').textContent = 'Finalizing activation...';

      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          token,
          kyberPublicKey: keyPair.kyberPublicKey,
          dilithiumPublicKey: keyPair.dilithiumPublicKey,
          encryptedUserData, // Only encrypted data sent to server
          signature
        }),
      });

      const result = await response.json();
      
      // Hide progress modal
      this.hideProgressModal();
      
      if (result.success) {
        // Show success message with keys and important instructions
        const content = document.getElementById('content');
        content.innerHTML = \`<div class="card" style="max-width: 700px; margin: 2rem auto;">
          <div class="alert alert-success">
            <strong>✓ Account activated successfully!</strong>
          </div>
          
          <div class="card-header">
            <h2 class="card-title">🔐 Your Cryptographic Keys</h2>
            <p class="card-subtitle">Post-Quantum Cryptography (Kyber-768 + Dilithium-2)</p>
          </div>

          <div class="alert alert-warning" style="margin-bottom: 1.5rem;">
            <strong>⚠️ Critical: Save These Keys Now!</strong><br>
            <small>You will need the <strong>Kyber Private Key</strong> to login and access your documents. There is no password reset or recovery option.</small>
          </div>

          <div class="form-group">
            <label class="label">
              <strong>Kyber Private Key (Encryption)</strong> 
              <span style="color: var(--error-color); font-weight: 600;"> (REQUIRED FOR LOGIN - SAVE THIS!)</span>
            </label>
            <textarea class="textarea" rows="3" readonly style="font-family: monospace; font-size: 0.875rem; background-color: #fff3cd; border: 2px solid var(--warning-color);">\${keyPair.kyberPrivateKey}</textarea>
            <small class="text-muted">You must keep this safe to access your account. Copy it now!</small>
          </div>

          <div class="form-group">
            <label class="label">
              <strong>Dilithium Private Key (Signing)</strong> 
              <span style="color: var(--warning-color); font-weight: 600;"> (SAVE THIS TOO!)</span>
            </label>
            <textarea class="textarea" rows="3" readonly style="font-family: monospace; font-size: 0.875rem; background-color: #fff3cd; border: 2px solid var(--warning-color);">\${keyPair.dilithiumPrivateKey}</textarea>
            <small class="text-muted">Used to sign blockchain transactions and prove your identity.</small>
          </div>

          <div class="form-group">
            <label class="label">
              <strong>Kyber Public Key</strong>
              <span style="color: var(--text-muted);"> (Used for encryption - stored on server)</span>
            </label>
            <textarea class="textarea" rows="2" readonly style="font-family: monospace; font-size: 0.875rem;">\${keyPair.kyberPublicKey}</textarea>
            <small class="text-muted">This key is stored on our servers and used to encrypt your documents.</small>
          </div>

          <div class="form-group">
            <label class="label">
              <strong>Dilithium Public Key</strong>
              <span style="color: var(--text-muted);"> (Used for verification - stored on blockchain)</span>
            </label>
            <textarea class="textarea" rows="2" readonly style="font-family: monospace; font-size: 0.875rem;">\${keyPair.dilithiumPublicKey}</textarea>
            <small class="text-muted">Used to verify your signatures on the Veritas blockchain.</small>
          </div>

          <div class="form-group">
            <label class="label">
              <strong>Recovery Phrase</strong>
              <span style="color: var(--text-secondary);"> (Optional backup - recommended)</span>
            </label>
            <textarea class="textarea" rows="2" readonly style="font-family: monospace; font-size: 0.875rem;">\${result.data.recoveryPhrase}</textarea>
            <small class="text-muted">Additional recovery option. Store separately from your private keys.</small>
          </div>

          <div style="background-color: var(--surface); padding: 1rem; border-radius: 8px; margin: 1.5rem 0;">
            <h3 style="font-size: 1rem; margin-bottom: 0.75rem; color: var(--text-primary);">📝 Where to Store Your Keys:</h3>
            <ul style="margin-left: 1.5rem; color: var(--text-secondary); line-height: 1.8;">
              <li><strong>Password Manager</strong> (1Password, Bitwarden, LastPass)</li>
              <li><strong>Secret Management Tool</strong> (AWS Secrets Manager, Azure Key Vault)</li>
              <li><strong>Encrypted USB drive</strong> in a safe or lockbox</li>
              <li><strong>Printed copy</strong> in a fireproof safe</li>
              <li><strong>Written note</strong> stored securely (even under your pillow works... but a safe is better! 😊)</li>
            </ul>
            <p style="margin-top: 0.75rem; font-size: 0.875rem; color: var(--text-primary);">
              <strong>Pro tip:</strong> Store both private keys in <em>at least two separate secure locations</em>.
            </p>
          </div>

          <button id="continue-login" class="btn btn-primary" style="width: 100%;">Continue to Login</button>
        </div>\`;

        document.getElementById('continue-login').addEventListener('click', () => {
          this.showSecurityWarningModal();
        });
      } else {
        this.showAlert('error', result.error || 'Activation failed');
      }
    } catch (error) {
      this.hideProgressModal();
      console.error('Activation error:', error);
      this.showAlert('error', 'Error: ' + error.message);
    }
  }

  async handleCreateAsset() {
    const title = document.getElementById('asset-title').value;
    const description = document.getElementById('asset-description').value;
    const documentType = document.getElementById('document-type').value;
    const fileInput = document.getElementById('document-file');
    const isPublic = document.getElementById('public-searchable').checked;

    // Check if user is logged in
    if (!this.currentUser) {
      this.showAlert('error', 'You must be logged in to register documents. Please log in again.');
      this.navigateTo('login');
      return;
    }

    if (!this.sessionToken) {
      this.showAlert('error', 'Session expired. Please log in again.');
      this.navigateTo('login');
      return;
    }

    // Check if user has required keys
    if (!this.currentUser.kyberPublicKey) {
      if (!this.currentUser.publicKey) {
        this.showAlert('error', 'Your account is missing encryption keys. Please log in again.');
        this.navigateTo('login');
        return;
      }
    }

    if (!this.privateKeys || !this.privateKeys.dilithium) {
      const providedKey = prompt('Enter your Dilithium private key to sign this asset:');
      if (!providedKey) {
        this.showAlert('error', 'Dilithium private key is required to sign the document.');
        return;
      }
      this.privateKeys = this.privateKeys || {};
      this.privateKeys.dilithium = providedKey.trim();
      this.persistSession();
    }

    const dilithiumKey = this.privateKeys.dilithium;
    if (!dilithiumKey) {
      this.showAlert('error', 'Dilithium private key is required to sign the document.');
      return;
    }

    if (!fileInput.files[0]) {
      this.showAlert('error', 'Please select a document file');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      let progressModal;
      try {
        const documentContent = e.target.result;
        if (!documentContent) {
          this.showAlert('error', 'Failed to read the document file. Please try again.');
          return;
        }
        
        // Show progress modal
        progressModal = this.showProgressModal(
          'Creating Asset',
          'Initializing post-quantum cryptography...'
        );
        
        console.log('Document loaded, size:', documentContent.length);

        // Wait for Post-Quantum Cryptography to initialize
        console.log('Initializing PQC...');
        await window.VeritasCrypto.ensureCryptoReady();
        console.log('PQC ready');

        // Update progress
        progressModal.querySelector('.progress-modal-message').textContent = 'Encrypting document with post-quantum encryption...';

        // Encrypt the document client-side with Post-Quantum Cryptography
        console.log('Encrypting document...');
        const kyberKey = this.currentUser.publicKey || this.currentUser.kyberPublicKey;
        if (!kyberKey) {
          throw new Error('Kyber public key not found in user data');
        }
        const encryptedData = await window.VeritasCrypto.encryptDocumentData(
          documentContent,
          kyberKey
        );
        console.log('Document encrypted, creating signature...');

        // Update progress
        progressModal.querySelector('.progress-modal-message').textContent = 'Preparing cryptographic signature...';

        // Create signature payload with document hash instead of full content
        const documentHash = await window.VeritasCrypto.hashData(encryptedData);
        console.log('Document hash created:', documentHash.slice(0, 32) + '...');

        const signaturePayload = JSON.stringify({
          title,
          description,
          documentType,
          documentHash,  // Hash instead of full documentData
          isPubliclySearchable: isPublic,
          timestamp: Date.now()
        });

        console.log('Creating signature for payload length:', signaturePayload.length);
        const signature = await window.VeritasCrypto.signData(signaturePayload, dilithiumKey);

        // Update progress
        progressModal.querySelector('.progress-modal-message').textContent = 'Uploading encrypted package to secure storage...';

        const response = await fetch('/api/web3-assets/create-web3', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + this.sessionToken
          },
          body: JSON.stringify({
            userId: this.currentUser.id,
            title,
            description,
            documentType,
            documentData: encryptedData,
            isPubliclySearchable: isPublic,
            signature,
            signaturePayload,
            signatureVersion: '1.0'
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('HTTP Error:', response.status, response.statusText);
          console.error('Response body:', errorText);
          throw new Error(\`HTTP \${response.status}: \${response.statusText} - \${errorText}\`);
        }

        const result = await response.json();
        
        // Hide progress modal
        this.hideProgressModal();
        
        if (result.success) {
          this.showAlert('success', 'Document registered successfully! Redirecting to payment...');
          setTimeout(() => {
            window.location.href = result.data.stripeUrl;
          }, 2000);
        } else {
          this.showAlert('error', result.error || 'Failed to register document');
        }
      } catch (error) {
        this.hideProgressModal();
        console.error('Document registration error:', error);
        this.showAlert('error', 'Error: ' + error.message);
      }
    };

    reader.readAsText(file);
  }

  async loadUserAssets() {
    try {
      const response = await fetch(\`/api/web3-assets/user/\${this.currentUser.id}\`);
      const result = await response.json();
      
      const container = document.getElementById('user-assets');
      if (result.success) {
        const { pending, confirmed } = result.data;
        const allAssets = [...pending, ...confirmed];
        
        if (allAssets.length > 0) {
          let html = '<div style="display: flex; flex-direction: column; gap: 0.75rem;">';
          
          // Show pending documents first
          if (pending.length > 0) {
            html += '<h4 style="margin-bottom: 0.5rem; color: #d97706;">⏳ Pending Payment</h4>';
            pending.forEach(asset => {
              html += \`
                <div class="asset-card" style="border-left: 4px solid #d97706; cursor: pointer;" onclick="window.app.viewAsset('\${asset.id}')">
                  <div class="asset-type">\${asset.documentType}</div>
                  <div class="asset-title">\${asset.title}</div>
                  <div class="asset-description">\${asset.description || 'No description'}</div>
                  <div class="asset-meta">
                    <span>NFT: \${asset.tokenId}</span>
                    <span>\${new Date(asset.createdAt).toLocaleDateString()}</span>
                    <span style="color: #d97706; font-weight: 600;">⏳ Pending</span>
                  </div>
                </div>
              \`;
            });
          }
          
          // Show confirmed/registered documents
          if (confirmed.length > 0) {
            html += '<h4 style="margin-bottom: 0.5rem; margin-top: 1rem; color: #059669;">📜 Registered Documents</h4>';
            confirmed.forEach(asset => {
              const isRegistered = asset.vdcBlockNumber;
              const statusColor = isRegistered ? '#059669' : '#d97706';
              const statusIcon = isRegistered ? '✅' : '⏳';
              const statusText = isRegistered ? 'Registered' : 'Pending Approval';
              const blockInfo = isRegistered ? \`Block #\${asset.vdcBlockNumber}\` : '';
              
              html += \`
                <div class="asset-card" style="border-left: 4px solid \${statusColor}; cursor: pointer;" onclick="window.app.viewAsset('\${asset.id}')">
                  <div class="asset-type">\${asset.documentType}</div>
                  <div class="asset-title">\${asset.title}</div>
                  <div class="asset-description">\${asset.description || 'No description'}</div>
                  <div class="asset-meta">
                    <span>NFT: \${asset.tokenId}</span>
                    <span>\${new Date(asset.createdAt).toLocaleDateString()}</span>
                    <span style="color: \${statusColor}; font-weight: 600;">\${statusIcon} \${statusText}\${blockInfo ? ' • ' + blockInfo : ''}</span>
                  </div>
                </div>
              \`;
            });
          }
          
          html += '</div>';
          container.innerHTML = html;
          
          document.getElementById('owned-count').textContent = confirmed.filter(a => a.vdcBlockNumber).length;
          document.getElementById('created-count').textContent = allAssets.length;
        } else {
          container.innerHTML = '<p class="text-center text-muted">No documents found. Create your first registered document to get started!</p>';
          document.getElementById('owned-count').textContent = '0';
          document.getElementById('created-count').textContent = '0';
        }
      } else {
        container.innerHTML = '<div class="alert alert-error">Failed to load assets</div>';
      }
    } catch (error) {
      document.getElementById('user-assets').innerHTML = '<div class="alert alert-error">Failed to load assets</div>';
    }
  }

  renderAdmin() {
    const content = document.getElementById('content');
    content.innerHTML = \`
      <div class="card">
        <div class="card-header">
          <h2 class="card-title" style="color: #f59e0b;">⚙️ Admin Panel</h2>
          <p class="card-subtitle">Manage blockchain transactions and system operations</p>
        </div>
        <div id="admin-content">
          <div class="loading"><div class="spinner"></div><p>Loading pending transactions...</p></div>
        </div>
      </div>
    \`;
    
    this.loadPendingTransactions();
  }

  async loadPendingTransactions() {
    try {
      const response = await fetch('/api/vdc/pending');
      const result = await response.json();
      
      const container = document.getElementById('admin-content');
      
      if (result.success && result.data.transactions.length > 0) {
        const transactions = result.data.transactions;
        
        let html = \`
          <div style="margin-bottom: 1rem;">
            <strong style="color: #f59e0b;">\${transactions.length} Pending Transaction\${transactions.length !== 1 ? 's' : ''}</strong>
          </div>
          <div style="display: flex; flex-direction: column; gap: 1rem;">
        \`;
        
        transactions.forEach((tx, index) => {
          const txData = tx.data || {};
          html += \`
            <div class="card" style="border-left: 4px solid #f59e0b;">
              <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 1rem;">
                <div>
                  <div style="font-weight: 600; color: #f59e0b;">Transaction #\${index + 1}</div>
                  <div style="font-size: 0.75rem; color: #6b7280; margin-top: 0.25rem;">\${tx.id}</div>
                </div>
                <div style="background: #fef3c7; color: #92400e; padding: 0.25rem 0.75rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 600;">
                  \${tx.type}
                </div>
              </div>
              
              <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.75rem; margin-bottom: 1rem; font-size: 0.875rem;">
                <div>
                  <div style="color: #6b7280; font-size: 0.75rem;">Asset ID</div>
                  <div style="font-family: monospace; font-size: 0.75rem;">\${txData.assetId || 'N/A'}</div>
                </div>
                <div>
                  <div style="color: #6b7280; font-size: 0.75rem;">Token ID</div>
                  <div style="font-family: monospace; font-size: 0.75rem;">\${txData.tokenId || 'N/A'}</div>
                </div>
                <div>
                  <div style="color: #6b7280; font-size: 0.75rem;">Creator</div>
                  <div style="font-family: monospace; font-size: 0.75rem;">\${txData.creatorId || 'N/A'}</div>
                </div>
                <div>
                  <div style="color: #6b7280; font-size: 0.75rem;">Created</div>
                  <div>\${new Date(tx.timestamp).toLocaleString()}</div>
                </div>
              </div>
              
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <button onclick="window.app.queryTransaction('\${tx.id}')" class="btn btn-secondary" style="flex: 1; min-width: 120px;">
                  🔍 Query
                </button>
                <button onclick="window.app.mineTransaction('\${tx.id}')" class="btn btn-primary" style="flex: 1; min-width: 160px;">
                  ✅ Approve (Sign and Mine Block)
                </button>
                <button onclick="window.app.deleteTransaction('\${tx.id}')" class="btn" style="flex: 1; min-width: 120px; background: #dc2626; color: white;">
                  🗑️ Delete
                </button>
              </div>
            </div>
          \`;
        });
        
        html += '</div>';
        container.innerHTML = html;
      } else {
        container.innerHTML = \`
          <div style="text-align: center; padding: 3rem; color: #6b7280;">
            <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>
            <p style="font-size: 1.125rem; font-weight: 600; margin-bottom: 0.5rem;">No Pending Transactions</p>
            <p style="font-size: 0.875rem;">All transactions have been mined to the blockchain.</p>
          </div>
        \`;
      }
    } catch (error) {
      console.error('Failed to load pending transactions:', error);
      document.getElementById('admin-content').innerHTML = \`
        <div class="alert alert-error">Failed to load pending transactions</div>
      \`;
    }
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
          const userResponse = await fetch(\`/api/users/\${txData.creatorId}\`);
          const userResult = await userResponse.json();
          if (userResult.success) {
            const user = userResult.data;
            userInfo = \`
              <div style="background: #f3f4f6; padding: 1rem; border-radius: 0.5rem; margin-top: 1rem;">
                <h4 style="margin: 0 0 0.75rem 0; color: #1f2937;">User Information</h4>
                <div style="display: grid; gap: 0.5rem; font-size: 0.875rem;">
                  <div><strong>Email:</strong> \${user.email || 'N/A'}</div>
                  <div><strong>Account Type:</strong> <span style="text-transform: capitalize;">\${user.accountType || 'N/A'}</span></div>
                  <div><strong>Created:</strong> \${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'N/A'}</div>
                  <div><strong>User ID:</strong> <code style="font-size: 0.75rem;">\${user.id}</code></div>
                </div>
              </div>
            \`;
          }
        } catch (err) {
          console.error('Failed to fetch user info:', err);
        }
      }
      
      // Show modal with all details
      this.showModal('Transaction Details', \`
        <div style="max-height: 70vh; overflow-y: auto;">
          <div style="margin-bottom: 1.5rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
              <h3 style="margin: 0; color: #1f2937;">Transaction #\${txId}</h3>
              <span style="background: #fef3c7; color: #92400e; padding: 0.25rem 0.75rem; border-radius: 0.375rem; font-size: 0.75rem; font-weight: 600;">
                \${transaction.type}
              </span>
            </div>
            
            <div style="display: grid; gap: 0.75rem; font-size: 0.875rem;">
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Transaction ID</div>
                <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">\${transaction.id}</code>
              </div>
              
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Asset ID</div>
                <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">\${txData.assetId || 'N/A'}</code>
              </div>
              
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Token ID</div>
                <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">\${txData.tokenId || 'N/A'}</code>
              </div>
              
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Document Title</div>
                <div>\${txData.title || 'N/A'}</div>
              </div>
              
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Document Type</div>
                <div style="text-transform: capitalize;">\${txData.documentType || 'N/A'}</div>
              </div>
              
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">IPFS Hash</div>
                <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">\${txData.ipfsHash || 'N/A'}</code>
              </div>
              
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Ethereum TX</div>
                <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">\${txData.ethereumTxHash || 'N/A'}</code>
              </div>
              
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Stripe Session</div>
                <code style="background: #f3f4f6; padding: 0.5rem; border-radius: 0.25rem; display: block; font-size: 0.75rem;">\${txData.stripeSessionId || 'N/A'}</code>
              </div>
              
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Paid Amount</div>
                <div>\$\${txData.paidAmount || '25'}</div>
              </div>
              
              <div>
                <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Created At</div>
                <div>\${new Date(transaction.timestamp).toLocaleString()}</div>
              </div>
            </div>
            
            \${userInfo}
          </div>
        </div>
      \`);
    } catch (error) {
      console.error('Query transaction error:', error);
      alert('Failed to query transaction: ' + error.message);
    }
  }

  async mineTransaction(txId) {
    if (!confirm(\`Are you sure you want to mine transaction \${txId}?\`)) {
      return;
    }
    
    try {
      this.showProgressModal('Mining Transaction', 'Mining transaction to blockchain...');
      
      const response = await fetch('/api/vdc/mine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSecret: prompt('Enter admin secret:') })
      });
      
      const result = await response.json();
      
      this.hideProgressModal();
      
      if (result.success) {
        alert(\`✅ Successfully mined block #\${result.data.blockNumber}\`);
        this.loadPendingTransactions(); // Refresh the list
      } else {
        alert('Failed to mine transaction: ' + result.error);
      }
    } catch (error) {
      this.hideProgressModal();
      console.error('Mine transaction error:', error);
      alert('Failed to mine transaction: ' + error.message);
    }
  }

  async deleteTransaction(txId) {
    if (!confirm(\`⚠️ WARNING: Are you sure you want to DELETE transaction \${txId}? This action cannot be undone!\`)) {
      return;
    }
    
    try {
      const adminSecret = prompt('Enter admin secret to confirm deletion:');
      if (!adminSecret) return;
      
      const response = await fetch(\`/api/vdc/transaction/\${txId}\`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          'x-admin-secret': adminSecret
        }
      });
      
      const result = await response.json();
      
      if (result.success) {
        alert('✅ Transaction deleted successfully');
        this.loadPendingTransactions(); // Refresh the list
      } else {
        alert('Failed to delete transaction: ' + result.error);
      }
    } catch (error) {
      console.error('Delete transaction error:', error);
      alert('Failed to delete transaction: ' + error.message);
    }
  }

  async handleSearch() {
    const query = document.getElementById('search-query').value;
    const type = document.getElementById('search-type').value;
    
    const container = document.getElementById('search-results');
    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (type) params.append('type', type);
      
      const response = await fetch(\`/api/search?\${params}\`);
      const result = await response.json();
      
      if (result.success && result.data.assets.length > 0) {
        container.innerHTML = result.data.assets.map(asset => \`<div class="asset-card"><div class="asset-type">\${asset.documentType}</div><div class="asset-title">\${asset.title}</div><div class="asset-description">\${asset.description}</div><div class="asset-meta"><span>Token: \${asset.tokenId}</span><span>\${new Date(asset.createdAt).toLocaleDateString()}</span></div></div>\`).join('');
      } else {
        container.innerHTML = '<p class="text-center text-muted">No assets found matching your search criteria.</p>';
      }
    } catch (error) {
      container.innerHTML = '<div class="alert alert-error">Failed to search assets</div>';
    }
  }

  logout() {
    this.currentUser = null;
    localStorage.removeItem('veritas-user');
    this.navigateTo('login');
  }

  showSecurityWarningModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = \`
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">🔒 Important Security Information</h3>
        </div>
        <div class="modal-body">
          <div class="alert alert-warning" style="margin-bottom: 1.5rem;">
            <strong>⚠️ Zero-Knowledge Architecture</strong><br>
            Your documents are encrypted with post-quantum cryptography. Only you can decrypt them.
          </div>

          <h4 style="margin-bottom: 1rem; font-size: 1rem;">Before you continue, please confirm:</h4>

          <div class="checkbox-group">
            <input type="checkbox" id="confirm-private-key">
            <label for="confirm-private-key">
              I have <strong>saved my Private Key</strong> in a secure location (password manager, safe, or other secure storage)
            </label>
          </div>

          <div class="checkbox-group">
            <input type="checkbox" id="confirm-understand-loss">
            <label for="confirm-understand-loss">
              I understand that <strong>losing my Private Key means permanent loss of access</strong> to my account and all documents
            </label>
          </div>

          <div class="checkbox-group">
            <input type="checkbox" id="confirm-no-recovery">
            <label for="confirm-no-recovery">
              I understand there is <strong>no password reset</strong> and <strong>no recovery process</strong> - the cryptographic keys cannot be recreated
            </label>
          </div>

          <div class="checkbox-group">
            <input type="checkbox" id="confirm-new-account">
            <label for="confirm-new-account">
              I understand that if I lose access, I will need to <strong>create a new account</strong> and all existing documents will be permanently inaccessible
            </label>
          </div>

          <div style="background-color: var(--surface); padding: 1rem; border-radius: 8px; margin-top: 1.5rem;">
            <h4 style="font-size: 0.9rem; margin-bottom: 0.5rem; color: var(--text-primary);">📜 Legal Compliance Note</h4>
            <p style="font-size: 0.875rem; line-height: 1.6; color: var(--text-secondary); margin: 0;">
              Documents stored in Veritas are encrypted using NIST-standardized post-quantum cryptographic algorithms 
              (Kyber-768 and Dilithium-2), stored on IPFS with Ethereum blockchain anchoring, and timestamped with 
              cryptographic proofs. This ensures compliance with legal standards for digital evidence in jurisdictions 
              that recognize blockchain-based document authentication, including courts in the United States, European Union, 
              United Kingdom, Australia, and other countries with established digital evidence frameworks.
            </p>
          </div>
        </div>
        <div class="modal-footer">
          <button id="modal-cancel" class="btn btn-secondary">Go Back</button>
          <button id="modal-confirm" class="btn btn-primary" disabled>I Understand - Proceed to Login</button>
        </div>
      </div>
    \`;

    document.body.appendChild(modal);

    // Enable confirm button only when all checkboxes are checked
    const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
    const confirmButton = modal.querySelector('#modal-confirm');
    
    const updateConfirmButton = () => {
      const allChecked = Array.from(checkboxes).every(cb => cb.checked);
      confirmButton.disabled = !allChecked;
    };

    checkboxes.forEach(cb => {
      cb.addEventListener('change', updateConfirmButton);
    });

    // Cancel button
    modal.querySelector('#modal-cancel').addEventListener('click', () => {
      modal.remove();
    });

    // Confirm button
    confirmButton.addEventListener('click', () => {
      modal.remove();
      this.navigateTo('login');
    });
  }

  showInviteModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = \`<div class="modal-content"><div class="modal-header"><h3 class="modal-title">Invite New User</h3><button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button></div><div class="modal-body"><form id="invite-form"><div class="form-group"><label class="label" for="invite-email">Email Address</label><input type="email" id="invite-email" class="input" placeholder="user@example.com" required></div><div class="form-group"><label><input type="checkbox" id="invite-message"> Include personal message</label></div><div class="form-group" id="message-group" style="display: none;"><label class="label" for="invite-message-text">Personal Message (optional)</label><textarea id="invite-message-text" class="textarea" placeholder="Add a personal message to your invitation..."></textarea></div><button type="submit" class="btn btn-primary" style="width: 100%;">Send Invitation</button></form></div></div>\`;

    document.body.appendChild(modal);
    
    // Show message field when checkbox is checked
    document.getElementById('invite-message').addEventListener('change', (e) => {
      document.getElementById('message-group').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('invite-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSendInvite();
    });
  }

  async handleSendInvite() {
    const email = document.getElementById('invite-email').value;
    const includeMessage = document.getElementById('invite-message').checked;
    const message = includeMessage ? document.getElementById('invite-message-text').value : '';

    try {
      // Require active session token (zero-knowledge: no private keys sent)
      if (!this.sessionToken) {
        this.showAlert('error', 'Session expired. Please log in again.');
        this.navigateTo('login');
        return;
      }

      const response = await fetch('/api/auth/send-invite', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + this.sessionToken
        },
        body: JSON.stringify({ email }),
      });

      const result = await response.json();
      if (result.success) {
        // Close modal
        document.querySelector('.modal').remove();
        
        // Show success message
        this.showAlert('success', 'Invitation sent successfully!');
        
        // Optionally send email with the invitation link
        if (includeMessage) {
          this.sendInviteEmail(email, result.data.activationUrl, message);
        }
      } else {
        this.showAlert('error', result.error || 'Failed to send invitation');
      }
    } catch (error) {
      this.showAlert('error', 'Network error. Please try again.');
    }
  }

  sendInviteEmail(email, activationUrl, message) {
    const subject = 'You have been invited to join Veritas Documents';
    const body = \`\${message ? message + '\\\\n\\\\n' : ''}You have been invited to join Veritas Documents, a secure platform for storing legal documents as NFTs.\\\\n\\\\nClick here to activate your account: \${activationUrl}\\\\n\\\\nThis invitation will expire in 7 days.\\\\n\\\\nBest regards,\\\\n\${this.currentUser.email}\`;

    const mailtoLink = \`mailto:\${email}?subject=\${encodeURIComponent(subject)}&body=\${encodeURIComponent(body)}\`;
    window.open(mailtoLink);
  }

  getStoredPrivateKey() {
    // In a real app, this would be stored securely (encrypted in localStorage or using a password manager)
    // For now, we'll prompt the user to enter it when needed
    return prompt('Please enter your private key to authorize this action:');
  }

  showAlert(type, message) {
    const existing = document.querySelector('.alert');
    if (existing) existing.remove();

    const alert = document.createElement('div');
    alert.className = \`alert alert-\${type}\`;
    alert.textContent = message;
    
    const content = document.getElementById('content');
    content.insertBefore(alert, content.firstChild);
    
    setTimeout(() => alert.remove(), 5000);
  }

  showProgressModal(title, message) {
    const modal = document.createElement('div');
    modal.className = 'progress-modal';
    modal.id = 'progress-modal';
    modal.innerHTML = \`
      <div class="progress-modal-content">
        <div class="progress-spinner"></div>
        <div class="progress-modal-title">\${title}</div>
        <div class="progress-modal-message">\${message}</div>
      </div>
    \`;
    document.body.appendChild(modal);
    return modal;
  }

  hideProgressModal() {
    const modal = document.getElementById('progress-modal');
    if (modal) {
      modal.remove();
    }
  }

  showModal(title, content) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = \`
      <div class="modal-content" style="max-width: 700px;">
        <div class="modal-header">
          <h3 class="modal-title">\${title}</h3>
          <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          \${content}
        </div>
        <div class="modal-footer">
          <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
        </div>
      </div>
    \`;
    document.body.appendChild(modal);
    return modal;
  }

  showAlert(type, message) {
    const alertClass = type === 'success' ? 'alert-success' : type === 'error' ? 'alert-error' : 'alert-warning';
    const alert = document.createElement('div');
    alert.className = \`alert \${alertClass}\`;
    alert.textContent = message;
    alert.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 10000; max-width: 400px;';
    
    document.body.appendChild(alert);
    
    setTimeout(() => {
      alert.remove();
    }, 5000);
  }

  async viewAsset(assetId) {
    try {
      const response = await fetch(\`/api/web3-assets/web3/\${assetId}\`, {
        headers: {
          'Authorization': 'Bearer ' + this.sessionToken
        }
      });
      
      const result = await response.json();
      if (result.success) {
        const asset = result.data;
        const isRegistered = asset.vdcBlockNumber;
        const statusColor = isRegistered ? '#059669' : '#d97706';
        const statusText = isRegistered ? 'Registered' : 'Pending Approval';
        
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = \`
          <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
              <h3 class="modal-title">📜 Document Details</h3>
              <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
            </div>
            <div class="modal-body">
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                <div>
                  <span class="asset-type">\${asset.documentType}</span>
                  <h3 style="margin: 0.5rem 0; font-size: 1.25rem;">\${asset.title}</h3>
                  <p style="color: var(--text-secondary);">\${asset.description || 'No description'}</p>
                </div>
                
                <div style="background-color: var(--surface); padding: 1rem; border-radius: 6px;">
                  <div style="display: grid; gap: 0.75rem;">
                    <div>
                      <strong>Status:</strong>
                      <span style="color: \${statusColor}; font-weight: 600; margin-left: 0.5rem;">
                        \${isRegistered ? '✅' : '⏳'} \${statusText}
                      </span>
                    </div>
                    <div><strong>NFT Token ID:</strong> \${asset.tokenId}</div>
                    <div><strong>Created:</strong> \${new Date(asset.createdAt).toLocaleString()}</div>
                    \${isRegistered ? \`<div><strong>VDC Block:</strong> #\${asset.vdcBlockNumber}</div>\` : ''}
                    \${asset.ipfsHash ? \`<div><strong>IPFS Hash:</strong> <code style="font-size: 0.75rem; word-break: break-all;">\${asset.ipfsHash}</code></div>\` : ''}
                    \${asset.ethereumTxHash ? \`<div><strong>Ethereum TX:</strong> <a href="https://etherscan.io/tx/\${asset.ethereumTxHash}" target="_blank" style="font-size: 0.75rem; word-break: break-all;">\${asset.ethereumTxHash}</a></div>\` : ''}
                  </div>
                </div>
                
                \${isRegistered ? \`
                  <div class="alert alert-success">
                    <strong>✓ This document is permanently registered on the VDC blockchain</strong><br>
                    <small>Block #\${asset.vdcBlockNumber} provides cryptographic proof of authenticity and timestamp.</small>
                  </div>
                \` : \`
                  <div class="alert alert-warning">
                    <strong>⏳ This document is awaiting approval</strong><br>
                    <small>Once approved and mined into the VDC blockchain, it will be permanently registered.</small>
                  </div>
                \`}
              </div>
            </div>
            <div class="modal-footer">
              <button class="btn btn-secondary" onclick="this.closest('.modal').remove()">Close</button>
            </div>
          </div>
        \`;
        
        document.body.appendChild(modal);
      } else {
        this.showAlert('error', 'Failed to load document details');
      }
    } catch (error) {
      console.error('View document error:', error);
      this.showAlert('error', 'Error loading document: ' + error.message);
    }
  }

  openAccountRequestEmail() {
    const subject = 'Request for Veritas Documents Account';
    const body = 'Hello,\\\\n\\\\nI would like to request an account for Veritas Documents.\\\\n\\\\nPlease provide me with an invitation link.\\\\n\\\\nThank you.';

    const mailtoLink = \`mailto:admin@veritas-documents.com?subject=\${encodeURIComponent(subject)}&body=\${encodeURIComponent(body)}\`;
    window.open(mailtoLink);
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  window.app = new VeritasApp();
});`;

  return c.text(js, 200, {
    'Content-Type': 'application/javascript; charset=utf-8',
    'Cache-Control': 'public, max-age=3600'
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
                <h1 class="logo">Veritas Documents</h1>
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
    
  <script src="/static/app.bundle.js?v=10"></script>
  <script src="/static/app.js?v=10"></script>
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
        button { background: #2563eb; color: white; padding: 12px 24px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; margin: 8px; }
        .btn-secondary { background: #6b7280; }
        .status { padding: 12px; border-radius: 6px; margin: 16px 0; }
        .success { background: #dcfce7; color: #166534; }
        .error { background: #fef2f2; color: #dc2626; }
        .info { background: #eff6ff; color: #1d4ed8; }
        .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
        pre { background: #1f2937; color: #f9fafb; padding: 16px; border-radius: 6px; overflow-x: auto; font-size: 12px; }
    </style>
</head>
<body>
    <h1>🔐 Veritas Documents - Web3 Integration Demo</h1>
    <p>Demonstrating IPFS storage and Ethereum anchoring with post-quantum cryptography</p>
    <div class="card">
        <h3>Web3 Integration Status</h3>
        <p>✅ IPFS Client implemented with Cloudflare Gateway</p>
        <p>✅ Ethereum Anchoring using Maatara post-quantum signatures</p>
        <p>✅ Enhanced asset handlers with Web3 capabilities</p>
        <p>🔧 Ready for testing with real credentials</p>
        
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
    <div class="success-icon">✅</div>
    <h1 class="success-title">Payment Successful!</h1>
    <p class="success-message">
      Your asset has been created and payment has been received.
      Thank you for using Veritas Documents!
    </p>

    <div class="processing-info">
      <h3>⏳ Asset Registration in Progress</h3>
      <p>
        Your document is now securely stored on IPFS with post-quantum encryption.
        <strong>Blockchain registration is currently being processed.</strong>
      </p>
      <p style="margin-top: 1rem;">
        ⏱️ <strong>Processing Time:</strong> Please allow up to 24 hours for your asset 
        to be permanently registered on the Veritas Documents Chain (VDC).
      </p>
      <p>
        📧 <strong>Notification:</strong> We will email you once your asset registration 
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
        <dd>✅ Payment Completed | ⏳ Blockchain Registration Pending</dd>
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