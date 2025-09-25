import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { Environment } from './types';
import { authHandler } from './handlers/auth';
import { assetHandler } from './handlers/assets';
import { userHandler } from './handlers/users';
import { stripeHandler } from './handlers/stripe';
import { searchHandler } from './handlers/search';

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

/* Utility classes */
.hidden { display: none !important; }
.text-center { text-align: center; }
.text-right { text-align: right; }
.mb-0 { margin-bottom: 0 !important; }
.mb-1 { margin-bottom: 0.5rem !important; }
.mb-2 { margin-bottom: 1rem !important; }
.mt-2 { margin-top: 1rem !important; }
.p-4 { padding: 2rem !important; }`;

  c.header('Content-Type', 'text/css');
  return c.text(css);
});

app.get('/static/app.js', async (c) => {
  const js = `
// Veritas Documents - Frontend Application

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
        default:
          this.currentPage = 'dashboard';
          this.renderDashboard();
      }
    } else {
      this.currentPage = 'login';
      this.renderLogin();
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
      nav.innerHTML = \`
        <a href="#" data-nav="dashboard" class="\${this.currentPage === 'dashboard' ? 'active' : ''}">Dashboard</a>
        <a href="#" data-nav="create-asset" class="\${this.currentPage === 'create-asset' ? 'active' : ''}">Create Asset</a>
        <a href="#" data-nav="search" class="\${this.currentPage === 'search' ? 'active' : ''}">Search</a>
        <a href="#" data-nav="logout">Logout</a>
      \`;
    } else {
      nav.innerHTML = \`
        <a href="#" data-nav="search" class="\${this.currentPage === 'search' ? 'active' : ''}">Search</a>
      \`;
    }
  }

  renderLogin() {
    const content = document.getElementById('content');
    content.innerHTML = \`
      <div class="card" style="max-width: 400px; margin: 2rem auto;">
        <div class="card-header">
          <h2 class="card-title">Login to Veritas Documents</h2>
          <p class="card-subtitle">Secure legal document storage with post-quantum cryptography</p>
        </div>
        
        <form id="login-form">
          <div class="form-group">
            <label class="label" for="email">Email</label>
            <input type="email" id="email" class="input" required>
          </div>
          
          <div class="form-group">
            <label class="label" for="private-key">Private Key</label>
            <textarea id="private-key" class="textarea" placeholder="Enter your private key..." required></textarea>
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%;">Login</button>
        </form>

        <div class="mt-2 text-center">
          <p class="text-muted">Don't have an account? Contact an administrator for an invitation.</p>
        </div>
      </div>
    \`;

    document.getElementById('login-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleLogin();
    });
  }

  renderDashboard() {
    const content = document.getElementById('content');
    content.innerHTML = \`
      <div class="dashboard-stats">
        <div class="stat-card">
          <div class="stat-number" id="owned-count">-</div>
          <div class="stat-label">Owned Assets</div>
        </div>
        <div class="stat-card">
          <div class="stat-number" id="created-count">-</div>
          <div class="stat-label">Created Assets</div>
        </div>
        <div class="stat-card">
          <div class="stat-number">$25</div>
          <div class="stat-label">Per Asset</div>
        </div>
      </div>

      <div class="grid grid-2">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Quick Actions</h3>
          </div>
          <div style="display: flex; gap: 1rem; flex-wrap: wrap;">
            <a href="#" data-nav="create-asset" class="btn btn-primary">Create New Asset</a>
            <button id="invite-user" class="btn btn-secondary">Invite User</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3 class="card-title">Account Information</h3>
          </div>
          <p><strong>Email:</strong> \${this.currentUser.email}</p>
          <p><strong>Account Type:</strong> \${this.currentUser.accountType}</p>
          <p><strong>Member Since:</strong> \${new Date(this.currentUser.createdAt).toLocaleDateString()}</p>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h3 class="card-title">Your Assets</h3>
        </div>
        <div id="user-assets" class="loading">
          <div class="spinner"></div>
        </div>
      </div>
    \`;

    this.loadUserAssets();
    document.getElementById('invite-user').addEventListener('click', () => this.showInviteModal());
  }

  renderSearch() {
    const content = document.getElementById('content');
    content.innerHTML = \`
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Search Assets</h2>
          <p class="card-subtitle">Explore publicly available legal documents</p>
        </div>
        
        <form id="search-form" style="display: flex; gap: 1rem; margin-bottom: 2rem;">
          <input type="text" id="search-query" class="input" placeholder="Search assets..." style="flex: 1;">
          <select id="search-type" class="select" style="width: 200px;">
            <option value="">All Types</option>
            <option value="will">Will</option>
            <option value="deed">Property Deed</option>
            <option value="certificate">Certificate</option>
            <option value="contract">Contract</option>
            <option value="other">Other</option>
          </select>
          <button type="submit" class="btn btn-primary">Search</button>
        </form>
      </div>

      <div id="search-results" class="grid grid-3">
        <!-- Search results will be populated here -->
      </div>
    \`;

    document.getElementById('search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSearch();
    });

    // Load initial results
    this.handleSearch();
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

  async loadUserAssets() {
    try {
      const response = await fetch(\`/api/assets/user/\${this.currentUser.id}\`);
      const result = await response.json();
      
      const container = document.getElementById('user-assets');
      if (result.success && result.data.assets.length > 0) {
        container.innerHTML = result.data.assets.map(asset => \`
          <div class="asset-card">
            <div class="asset-type">\${asset.documentType}</div>
            <div class="asset-title">\${asset.title}</div>
            <div class="asset-description">\${asset.description}</div>
            <div class="asset-meta">
              <span>Token: \${asset.tokenId}</span>
              <span>\${new Date(asset.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        \`).join('');
        
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
        container.innerHTML = result.data.assets.map(asset => \`
          <div class="asset-card">
            <div class="asset-type">\${asset.documentType}</div>
            <div class="asset-title">\${asset.title}</div>
            <div class="asset-description">\${asset.description}</div>
            <div class="asset-meta">
              <span>Token: \${asset.tokenId}</span>
              <span>\${new Date(asset.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        \`).join('');
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
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  new VeritasApp();
});`;

  c.header('Content-Type', 'application/javascript');
  return c.text(js);
});

// API Routes
app.route('/api/auth', authHandler);
app.route('/api/assets', assetHandler);
app.route('/api/users', userHandler);
app.route('/api/stripe', stripeHandler);
app.route('/api/search', searchHandler);

// Serve the main application
app.get('/', (c) => {
  return c.html(`
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
        
        <script src="/static/app.js"></script>
    </body>
    </html>
  `);
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