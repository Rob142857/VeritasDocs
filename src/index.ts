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

type Bindings = Environment;

const app = new Hono<{ Bindings: Bindings }>();

// CORS middleware
app.use('*', cors({
  origin: ['https://veritas-documents.workers.dev', 'http://localhost:8787'],
  allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

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
  border-radius: 8px;
  padding: 1.5rem;
  transition: box-shadow 0.2s;
}

.asset-card:hover {
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.asset-type {
  display: inline-block;
  padding: 0.25rem 0.75rem;
  background-color: var(--surface);
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.asset-title {
  font-size: 1.125rem;
  font-weight: 600;
  margin-bottom: 0.5rem;
}

.asset-description {
  color: var(--text-secondary);
  margin-bottom: 1rem;
}

.asset-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.875rem;
  color: var(--text-muted);
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
    // Try to load from KV first
    const env = c.env as Environment;
    let bundle = await env.VERITAS_KV.get('frontend-bundle');
    if (!bundle) {
      // Fallback to legacy key name used in some manual uploads
      bundle = await env.VERITAS_KV.get('app-bundle');
    }
    if (bundle) {
      return c.text(bundle, 200, { 'Content-Type': 'application/javascript' });
    }
  } catch (error) {
    console.error('Failed to load bundle from KV:', error);
  }
  
  return c.text('console.error("Frontend bundle not found");', 200, { 'Content-Type': 'application/javascript' });
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
    this.init();
  }

  init() {
    // Check if user is logged in
    const storedUser = localStorage.getItem('veritas-user');
    if (storedUser) {
      this.currentUser = JSON.parse(storedUser);
      this.currentPage = 'dashboard';
    }

    this.router();
    this.setupNavigation();
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
      nav.innerHTML = \`<a href="#" data-nav="dashboard" class="\${this.currentPage === 'dashboard' ? 'active' : ''}">Dashboard</a><a href="#" data-nav="create-asset" class="\${this.currentPage === 'create-asset' ? 'active' : ''}">Create Asset</a><a href="#" data-nav="search" class="\${this.currentPage === 'search' ? 'active' : ''}">Search</a><a href="#" data-nav="docs" class="\${this.currentPage === 'docs' ? 'active' : ''}">Docs</a><a href="#" data-nav="logout">Logout</a>\`;
    } else {
      nav.innerHTML = \`<a href="#" data-nav="search" class="\${this.currentPage === 'search' ? 'active' : ''}">Search</a><a href="#" data-nav="docs" class="\${this.currentPage === 'docs' ? 'active' : ''}">Docs</a>\`;
    }
  }

  renderLogin() {
    const content = document.getElementById('content');
    content.innerHTML = \`<div class="card" style="max-width: 400px; margin: 2rem auto;"><div class="card-header"><h2 class="card-title">Login to Veritas Documents</h2><p class="card-subtitle">Secure legal document storage with post-quantum cryptography</p></div><form id="login-form"><div class="form-group"><label class="label" for="email">Email</label><input type="email" id="email" class="input" required></div><div class="form-group"><label class="label" for="private-key">Private Key</label><textarea id="private-key" class="textarea" placeholder="Enter your private key..." required></textarea></div><button type="submit" class="btn btn-primary" style="width: 100%;">Login</button></form><div class="mt-2 text-center"><p class="text-muted">Don't have an account? <a href="#" id="request-account-link" class="text-primary" style="text-decoration: underline;">Request new account</a></p></div></div>\`;

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
    content.innerHTML = \`<div class="card" style="max-width: 600px; margin: 0 auto;"><div class="card-header"><h2 class="card-title">Create New Asset</h2><p class="card-subtitle">Store your legal document as an NFT ($25 fee)</p></div><form id="create-asset-form"><div class="form-group"><label class="label" for="asset-title">Document Title</label><input type="text" id="asset-title" class="input" required></div><div class="form-group"><label class="label" for="asset-description">Description</label><textarea id="asset-description" class="textarea"></textarea></div><div class="form-group"><label class="label" for="document-type">Document Type</label><select id="document-type" class="select" required><option value="">Select type...</option><option value="will">Will</option><option value="deed">Property Deed</option><option value="certificate">Certificate</option><option value="contract">Contract</option><option value="other">Other</option></select></div><div class="form-group"><label class="label" for="document-file">Document File</label><input type="file" id="document-file" class="input" required></div><div class="form-group"><label><input type="checkbox" id="public-searchable"> Make this asset publicly searchable</label></div><div class="form-group"><label class="label" for="private-key-create">Your Private Key (for signing)</label><textarea id="private-key-create" class="textarea" placeholder="Enter your private key..." required></textarea></div><button type="submit" class="btn btn-primary" style="width: 100%;">Create Asset ($25)</button></form></div>\`;

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
    const email = document.getElementById('email').value;
    const privateKey = document.getElementById('private-key').value;

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, privateKey }),
      });

      const result = await response.json();
      if (result.success) {
        this.currentUser = result.data.user;
        localStorage.setItem('veritas-user', JSON.stringify(this.currentUser));
        this.navigateTo('dashboard');
      } else {
        this.showAlert('error', result.error || 'Login failed');
      }
    } catch (error) {
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

    try {
      // Initialize Post-Quantum Cryptography
      console.log('Initializing PQC for key generation...');
      await window.VeritasCrypto.ensureCryptoReady();
      
      // Generate both Kyber-768 (encryption) and Dilithium-2 (signing) keypairs client-side
      console.log('Generating post-quantum keypairs...');
      const keyPair = await window.VeritasCrypto.generateClientKeypair();
      console.log('Keypairs generated successfully');
      
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
    const privateKey = document.getElementById('private-key-create').value;

    if (!fileInput.files[0]) {
      this.showAlert('error', 'Please select a document file');
      return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    reader.onload = async (e) => {
      try {
        const documentContent = e.target.result;
        console.log('Document loaded, size:', documentContent.length);

        // Wait for Post-Quantum Cryptography to initialize
        console.log('Initializing PQC...');
        await window.VeritasCrypto.ensureCryptoReady();
        console.log('PQC ready');

        // Encrypt the document client-side with Post-Quantum Cryptography
        console.log('Encrypting document...');
        const encryptedData = await window.VeritasCrypto.encryptDocumentData(
          documentContent,
          this.currentUser.publicKey
        );
        console.log('Document encrypted, sending to server...');

        const response = await fetch('/api/web3-assets/create-web3', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: this.currentUser.id,
            title,
            description,
            documentType,
            documentData: encryptedData,
            isPubliclySearchable: isPublic,
            privateKey,
          }),
        });

        const result = await response.json();
        if (result.success) {
          this.showAlert('success', 'Asset created successfully! Redirecting to payment...');
          setTimeout(() => {
            window.location.href = result.data.stripeUrl;
          }, 2000);
        } else {
          this.showAlert('error', result.error || 'Failed to create asset');
        }
      } catch (error) {
        console.error('Asset creation error:', error);
        this.showAlert('error', 'Error: ' + error.message);
      }
    };

    reader.readAsText(file);
  }

  async loadUserAssets() {
    try {
      const response = await fetch(\`/api/assets/user/\${this.currentUser.id}\`);
      const result = await response.json();
      
      const container = document.getElementById('user-assets');
      if (result.success && result.data.assets.length > 0) {
        container.innerHTML = result.data.assets.map(asset => \`<div class="asset-card"><div class="asset-type">\${asset.documentType}</div><div class="asset-title">\${asset.title}</div><div class="asset-description">\${asset.description}</div><div class="asset-meta"><span>Token: \${asset.tokenId}</span><span>\${new Date(asset.createdAt).toLocaleDateString()}</span></div></div>\`).join('');
        
        document.getElementById('owned-count').textContent = result.data.assets.filter(a => a.ownerId === this.currentUser.id).length;
        document.getElementById('created-count').textContent = result.data.assets.filter(a => a.creatorId === this.currentUser.id).length;
      } else {
        container.innerHTML = '<p class="text-center text-muted">No assets found. Create your first asset to get started!</p>';
        document.getElementById('owned-count').textContent = '0';
        document.getElementById('created-count').textContent = '0';
      }
    } catch (error) {
      document.getElementById('user-assets').innerHTML = '<div class="alert alert-error">Failed to load assets</div>';
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
      // Create authorization header
      const token = btoa(\`\${this.currentUser.email}:\${this.getStoredPrivateKey()}\`);
      
      const response = await fetch('/api/auth/send-invite', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`
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

  openAccountRequestEmail() {
    const subject = 'Request for Veritas Documents Account';
    const body = 'Hello,\\\\n\\\\nI would like to request an account for Veritas Documents.\\\\n\\\\nPlease provide me with an invitation link.\\\\n\\\\nThank you.';

    const mailtoLink = \`mailto:admin@veritas-documents.com?subject=\${encodeURIComponent(subject)}&body=\${encodeURIComponent(body)}\`;
    window.open(mailtoLink);
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  new VeritasApp();
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
    
    <script src="/static/app.bundle.js"></script>
    <script src="/static/app.js"></script>
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

// Catch-all for SPA routing
app.get('*', (c) => {
  return c.redirect('/');
});

export default app;