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
      nav.innerHTML = `
        <a href="#" data-nav="dashboard" class="${this.currentPage === 'dashboard' ? 'active' : ''}">Dashboard</a>
        <a href="#" data-nav="create-asset" class="${this.currentPage === 'create-asset' ? 'active' : ''}">Create Asset</a>
        <a href="#" data-nav="search" class="${this.currentPage === 'search' ? 'active' : ''}">Search</a>
        <a href="#" data-nav="logout">Logout</a>
      `;
    } else {
      nav.innerHTML = `
        <a href="#" data-nav="search" class="${this.currentPage === 'search' ? 'active' : ''}">Search</a>
      `;
    }
  }

  renderLogin() {
    const content = document.getElementById('content');
    content.innerHTML = `
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
          <p class="text-muted">Don't have an account? 
            <a href="#" id="request-account-link" class="text-primary" style="text-decoration: underline;">
              Request new account
            </a>
          </p>
        </div>
      </div>
    `;

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
    content.innerHTML = `
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
          <p><strong>Email:</strong> ${this.currentUser.email}</p>
          <p><strong>Account Type:</strong> ${this.currentUser.accountType}</p>
          <p><strong>Member Since:</strong> ${new Date(this.currentUser.createdAt).toLocaleDateString()}</p>
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
    `;

    this.loadUserAssets();
    document.getElementById('invite-user').addEventListener('click', () => this.showInviteModal());
  }

  renderCreateAsset() {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="card" style="max-width: 600px; margin: 0 auto;">
        <div class="card-header">
          <h2 class="card-title">Create New Asset</h2>
          <p class="card-subtitle">Store your legal document as an NFT ($25 fee)</p>
        </div>
        
        <form id="create-asset-form">
          <div class="form-group">
            <label class="label" for="asset-title">Document Title</label>
            <input type="text" id="asset-title" class="input" required>
          </div>
          
          <div class="form-group">
            <label class="label" for="asset-description">Description</label>
            <textarea id="asset-description" class="textarea"></textarea>
          </div>
          
          <div class="form-group">
            <label class="label" for="document-type">Document Type</label>
            <select id="document-type" class="select" required>
              <option value="">Select type...</option>
              <option value="will">Will</option>
              <option value="deed">Property Deed</option>
              <option value="certificate">Certificate</option>
              <option value="contract">Contract</option>
              <option value="other">Other</option>
            </select>
          </div>
          
          <div class="form-group">
            <label class="label" for="document-file">Document File</label>
            <input type="file" id="document-file" class="input" required>
          </div>
          
          <div class="form-group">
            <label>
              <input type="checkbox" id="public-searchable"> 
              Make this asset publicly searchable
            </label>
          </div>
          
          <div class="form-group">
            <label class="label" for="private-key-create">Your Private Key (for signing)</label>
            <textarea id="private-key-create" class="textarea" placeholder="Enter your private key..." required></textarea>
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%;">Create Asset ($25)</button>
        </form>
      </div>
    `;

    document.getElementById('create-asset-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleCreateAsset();
    });
  }

  renderSearch() {
    const content = document.getElementById('content');
    content.innerHTML = `
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
    `;

    document.getElementById('search-form').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSearch();
    });

    // Load initial results
    this.handleSearch();
  }

  renderActivationPage(token) {
    const content = document.getElementById('content');
    content.innerHTML = `
      <div class="card" style="max-width: 500px; margin: 2rem auto;">
        <div class="card-header">
          <h2 class="card-title">Activate Your Account</h2>
          <p class="card-subtitle">Complete your account setup</p>
        </div>
        
        <form id="activation-form">
          <div class="form-group">
            <label class="label" for="full-name">Full Name</label>
            <input type="text" id="full-name" class="input" required>
          </div>
          
          <div class="form-group">
            <label class="label" for="date-of-birth">Date of Birth</label>
            <input type="date" id="date-of-birth" class="input">
          </div>
          
          <div class="form-group">
            <label class="label" for="address">Address</label>
            <textarea id="address" class="textarea"></textarea>
          </div>
          
          <div class="form-group">
            <label class="label" for="phone">Phone Number</label>
            <input type="tel" id="phone" class="input">
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%;">Activate Account</button>
        </form>
      </div>
    `;

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
      const response = await fetch('/api/auth/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, personalDetails }),
      });

      const result = await response.json();
      if (result.success) {
        // Show success message with keys
        const content = document.getElementById('content');
        content.innerHTML = `
          <div class="card" style="max-width: 600px; margin: 2rem auto;">
            <div class="alert alert-success">
              <strong>Account activated successfully!</strong> Please save your keys securely.
            </div>
            
            <div class="card-header">
              <h2 class="card-title">Your Account Credentials</h2>
              <p class="card-subtitle">Save these securely - you cannot recover them later</p>
            </div>
            
            <div class="form-group">
              <label class="label">Public Key</label>
              <textarea class="textarea" readonly>${result.data.publicKey}</textarea>
            </div>
            
            <div class="form-group">
              <label class="label">Private Key (Keep Secret!)</label>
              <textarea class="textarea" readonly>${result.data.privateKey}</textarea>
            </div>
            
            <div class="form-group">
              <label class="label">Recovery Phrase (Keep Secret!)</label>
              <textarea class="textarea" readonly>${result.data.recoveryPhrase}</textarea>
            </div>
            
            <button id="continue-login" class="btn btn-primary" style="width: 100%;">Continue to Login</button>
          </div>
        `;

        document.getElementById('continue-login').addEventListener('click', () => {
          this.navigateTo('login');
        });
      } else {
        this.showAlert('error', result.error || 'Activation failed');
      }
    } catch (error) {
      this.showAlert('error', 'Network error. Please try again.');
    }
  }

  async loadUserAssets() {
    try {
      const response = await fetch(`/api/assets/user/${this.currentUser.id}`);
      const result = await response.json();
      
      const container = document.getElementById('user-assets');
      if (result.success && result.data.assets.length > 0) {
        container.innerHTML = result.data.assets.map(asset => `
          <div class="asset-card">
            <div class="asset-type">${asset.documentType}</div>
            <div class="asset-title">${asset.title}</div>
            <div class="asset-description">${asset.description}</div>
            <div class="asset-meta">
              <span>Token: ${asset.tokenId}</span>
              <span>${new Date(asset.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        `).join('');
        
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
      
      const response = await fetch(`/api/search?${params}`);
      const result = await response.json();
      
      if (result.success && result.data.assets.length > 0) {
        container.innerHTML = result.data.assets.map(asset => `
          <div class="asset-card">
            <div class="asset-type">${asset.documentType}</div>
            <div class="asset-title">${asset.title}</div>
            <div class="asset-description">${asset.description}</div>
            <div class="asset-meta">
              <span>Token: ${asset.tokenId}</span>
              <span>${new Date(asset.createdAt).toLocaleDateString()}</span>
            </div>
          </div>
        `).join('');
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

  showInviteModal() {
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <h3 class="modal-title">Invite New User</h3>
          <button class="modal-close" onclick="this.closest('.modal').remove()">&times;</button>
        </div>
        <div class="modal-body">
          <form id="invite-form">
            <div class="form-group">
              <label class="label" for="invite-email">Email Address</label>
              <input type="email" id="invite-email" class="input" placeholder="user@example.com" required>
            </div>
            <div class="form-group">
              <label>
                <input type="checkbox" id="invite-message"> Include personal message
              </label>
            </div>
            <div class="form-group" id="message-group" style="display: none;">
              <label class="label" for="invite-message-text">Personal Message (optional)</label>
              <textarea id="invite-message-text" class="textarea" placeholder="Add a personal message to your invitation..."></textarea>
            </div>
            <button type="submit" class="btn btn-primary" style="width: 100%;">Send Invitation</button>
          </form>
        </div>
      </div>
    `;

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
      const token = btoa(`${this.currentUser.email}:${this.getStoredPrivateKey()}`);
      
      const response = await fetch('/api/auth/send-invite', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
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
    const subject = 'You\'ve been invited to join Veritas Documents';
    const body = `${message ? message + '\n\n' : ''}You've been invited to join Veritas Documents, a secure platform for storing legal documents as NFTs.

Click here to activate your account: ${activationUrl}

This invitation will expire in 7 days.

Best regards,
${this.currentUser.email}`;

    const mailtoLink = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
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
    alert.className = `alert alert-${type}`;
    alert.textContent = message;
    
    const content = document.getElementById('content');
    content.insertBefore(alert, content.firstChild);
    
    setTimeout(() => alert.remove(), 5000);
  }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  new VeritasApp();
});