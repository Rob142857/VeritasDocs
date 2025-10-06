`
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
      info.innerHTML = '<strong>✅ File selected:</strong> ' + file.name + '<br><small>Size: ' + (file.size/1024).toFixed(2) + ' KB</small>';
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
        showKpMessage('success', '✅ Login successful! Redirecting...');
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
      '  <div class="docs-sidebar">',
      '    <h3 class="docs-sidebar-title">📚 Documentation</h3>',
      '    <nav class="docs-nav">',
      '      <a href="#" class="docs-nav-link active" data-doc="README">README</a>',
      '      <a href="#" class="docs-nav-link" data-doc="ZERO_KNOWLEDGE_ARCHITECTURE">Zero-Knowledge Architecture</a>',
      '      <a href="#" class="docs-nav-link" data-doc="VDC_INTEGRATION_GUIDE">VDC Integration Guide</a>',
      '      <a href="#" class="docs-nav-link" data-doc="DEVELOPMENT_PLAN">Development Plan</a>',
      '      <a href="#" class="docs-nav-link" data-doc="TECHNICAL_STATUS">Technical Status</a>',
      '      <a href="#" class="docs-nav-link" data-doc="SECURITY_GUARDRAILS">Security Guardrails</a>',
      '    </nav>',
      '  </div>',
      '  <div class="docs-content">',
      '    <div id="doc-viewer" class="doc-viewer">',
      '      <div class="loading">Loading documentation...</div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join('');

    // Add styles for docs page
    if (!document.getElementById('docs-styles')) {
      const style = document.createElement('style');
      style.id = 'docs-styles';
      style.textContent = [
        '.docs-container {',
        '  display: grid;',
        '  grid-template-columns: 280px 1fr;',
        '  gap: 2rem;',
        '  max-width: 1400px;',
        '  margin: 0 auto;',
        '}',
        '',
        '.docs-sidebar {',
        '  background: var(--surface);',
        '  border-radius: 8px;',
        '  padding: 1.5rem;',
        '  height: fit-content;',
        '  position: sticky;',
        '  top: 2rem;',
        '}',
        '',
        '.docs-sidebar-title {',
        '  margin: 0 0 1rem 0;',
        '  font-size: 1.25rem;',
        '  color: var(--text-primary);',
        '}',
        '',
        '.docs-nav {',
        '  display: flex;',
        '  flex-direction: column;',
        '  gap: 0.5rem;',
        '}',
        '',
        '.docs-nav-link {',
        '  padding: 0.75rem 1rem;',
        '  color: var(--text-secondary);',
        '  text-decoration: none;',
        '  border-radius: 6px;',
        '  transition: all 0.2s;',
        '  font-size: 0.95rem;',
        '}',
        '',
        '.docs-nav-link:hover {',
        '  background: var(--background);',
        '  color: var(--primary-color);',
        '}',
        '',
        '.docs-nav-link.active {',
        '  background: var(--primary-color);',
        '  color: white;',
        '  font-weight: 500;',
        '}',
        '',
        '.docs-content {',
        '  background: white;',
        '  border-radius: 8px;',
        '  padding: 2.5rem;',
        '  box-shadow: 0 1px 3px rgba(0,0,0,0.1);',
        '  min-height: 600px;',
        '}',
        '',
        '.doc-viewer {',
        '  line-height: 1.7;',
        '}',
        '',
        '.doc-viewer .loading { text-align: center; padding: 3rem; color: var(--text-muted); }',
        '@media (max-width: 768px) {',
        '  .docs-container {',
        '    grid-template-columns: 1fr;',
        '  }',
        '  .docs-sidebar {',
        '    position: static;',
        '  }',
        '}'
      ].join('\n');
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
      '    <div class="alert alert-success">✅ Account Activated!</div>',
      '    <div class="alert alert-warning">',
      '      <strong>⚠️ Save Your Recovery Passphrase</strong><br/>Write down these 12 words in order. You will need them to access your account.
',
      '    </div>',
      '    <div id="passphrase-words" style="font-family:monospace;font-size:1.1rem;padding:1rem;background:#f5f5f5;border:2px solid #fbbf24;border-radius:6px;text-align:center;"></div>',
      '    <div class="form-group" style="margin-top:1rem;">',
      '      <label style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;">',
      '        <input type="checkbox" id="confirm-saved-passphrase" style="width:auto;">',
      '        <span><strong>I have written down my passphrase in a safe place</strong></span>',
      '      </label>',
      '    </div>',
      '    <button id="download-keypack-btn" class="btn btn-primary" disabled style="width:100%;">🔐 Download Keypack File</button>',
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
            showActMsg('success', '🎉 Keypack downloaded! You can now login below.');
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

  renderAdmin() {
    const content = document.getElementById('content');
    content.innerHTML = [
      '<div class="card">',
      '  <div class="card-header">',
      '    <h2 class="card-title" style="color: #f59e0b;">⚙️ Admin Panel</h2>',
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
                  <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Asset ID</div>
                  <div style="font-family: monospace; font-size: 0.75rem;">\${txData.assetId || 'N/A'}</div>
                </div>
                <div>
                  <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Token ID</div>
                  <div style="font-family: monospace; font-size: 0.75rem;">\${txData.tokenId || 'N/A'}</div>
                </div>
                <div>
                  <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Creator</div>
                  <div style="font-family: monospace; font-size: 0.75rem;">\${txData.creatorId || 'N/A'}</div>
                </div>
                <div>
                  <div style="color: #6b7280; font-size: 0.75rem; margin-bottom: 0.25rem;">Created</div>
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
        container.innerHTML = [
          '<div style="text-align: center; padding: 3rem; color: #6b7280;">',
          '  <div style="font-size: 3rem; margin-bottom: 1rem;">✅</div>',
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

  // Compose and open an invitation email with a preset message and a space for a personal note
  sendInviteEmail(email, activationUrl, personalMessage) {
    try {
      const subject = 'Invitation to Veritas Documents';
      const lines = [
        (personalMessage || ''),
        '',
        'You have been invited to create an account at Veritas Documents.',
        'Please click the link below and activate your account within 6 days:',
        '',
        activationUrl,
        '',
        'If you have any questions, just reply to this email.'
      ];
      const body = lines.join('\n');
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
      '  <div class="modal-body">',
      '    <div class="form-group">',
      '      <label class="label" for="invite-email">Friend\'s Email</label>',
      '      <input type="email" id="invite-email" class="input" placeholder="friend@example.com" />',
      '    </div>',
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

  const mailtoLink = 'mailto:admin@veritas-documents.com?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
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