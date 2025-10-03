# Activation Token Flow - Veritas Documents

## Overview
The activation token system provides secure, one-time account creation with client-side key generation and blockchain registration.

## Current Flow (Step-by-Step)

### 1. **Admin Creates Invitation Link**
- **Endpoint**: `POST /api/auth/create-link`
- **Required**: `adminSecret`, `email`
- **Process**:
  1. Verifies admin credentials
  2. Generates unique `token` (UUID) and `linkId`
  3. Creates `OneTimeLink` object with:
     - Email of invitee
     - Expiration (7 days)
     - Invite type (`admin` or `user`)
     - Used status (initially `false`)
  4. Stores in KV: `link:{token}` → OneTimeLink data
  5. Returns activation URL: `https://your-domain.com/activate?token={token}`

### 2. **User Visits Activation Link**
- **URL**: `/activate?token=xxxx-xxxx-xxxx`
- **Frontend Flow** (in `public/app.js`):
  1. Detects activation token in URL
  2. Calls `renderActivationPage(token)`
  3. Shows form for personal details:
     - Full Name
     - Date of Birth
     - Address
     - Phone Number
  4. User fills form and clicks "Activate Account"

### 3. **Client-Side Key Generation** (Currently Broken - Needs Fix)
**This is where the WASM error is happening!**

Current code attempts:
```javascript
async handleActivation(token) {
  const personalDetails = { ... };
  
  // 🔴 PROBLEM: The old code doesn't generate keys!
  // It just sends personal details to the server
  
  await fetch('/api/auth/activate', {
    method: 'POST',
    body: JSON.stringify({ token, personalDetails })
  });
}
```

**What SHOULD happen** (needs implementation):
```javascript
async handleActivation(token) {
  // 1. Initialize WASM (post-quantum crypto)
  await VeritasCrypto.ensureCryptoReady();
  
  // 2. Generate TWO keypairs client-side:
  const { 
    kyberPublicKey,      // For encryption
    kyberPrivateKey,     // Keep secret!
    dilithiumPublicKey,  // For signatures
    dilithiumPrivateKey  // Keep secret!
  } = await VeritasCrypto.generateClientKeypair();
  
  // 3. Encrypt personal details with user's OWN Kyber key
  const userData = { 
    email: result.email,
    personalDetails,
    preferences: {} 
  };
  const encryptedUserData = await VeritasCrypto.encryptDocumentData(
    JSON.stringify(userData),
    kyberPublicKey
  );
  
  // 4. Sign the registration data with Dilithium private key
  const dataToSign = JSON.stringify({
    kyberPublicKey,
    dilithiumPublicKey,
    encryptedUserData,
    timestamp: Date.now()
  });
  const signature = await VeritasCrypto.signData(
    dataToSign,
    dilithiumPrivateKey
  );
  
  // 5. Send to server
  await fetch('/api/auth/activate', {
    method: 'POST',
    body: JSON.stringify({
      token,
      kyberPublicKey,
      dilithiumPublicKey,
      encryptedUserData,
      signature
    })
  });
}
```

### 4. **Server-Side Activation** (`/api/auth/activate`)
**Current process**:
1. Validates token exists and not expired/used
2. Verifies Dilithium signature
3. Creates blockchain transaction with:
   - **PUBLIC DATA**: email, public keys, account type
   - **ENCRYPTED DATA**: personal details (only user can decrypt)
   - **SIGNATURE**: proves user owns the private key
4. Generates **recovery phrase** (BIP39 mnemonic)
5. Stores:
   - Blockchain transaction in KV
   - User record (minimal, points to blockchain tx)
   - Email → userId mapping
6. Marks token as used
7. Returns to client:
   - `kyberPublicKey` ✅ (safe to display)
   - `dilithiumPublicKey` ✅ (safe to display)
   - `kyberPrivateKey` ⚠️ **SENSITIVE**
   - `dilithiumPrivateKey` ⚠️ **SENSITIVE**
   - `recoveryPhrase` ⚠️ **SENSITIVE**

### 5. **Current Display (Insecure)**
Shows ALL keys on screen:
```javascript
content.innerHTML = `
  <textarea readonly>${result.data.publicKey}</textarea>
  <textarea readonly>${result.data.privateKey}</textarea>
  <textarea readonly>${result.data.recoveryPhrase}</textarea>
`;
```

---

## Proposed Improvement: Email Private Keys

### Security Enhancement Flow

**1. On Activation Success**:
```javascript
// ONLY show recovery phrase on screen
content.innerHTML = `
  <div class="card">
    <h2>Account Activated! ✅</h2>
    
    <div class="alert alert-warning">
      <strong>⚠️ CRITICAL: Write down your recovery phrase NOW</strong>
      <p>This is the ONLY time you'll see this phrase. It's your backup if you lose your private keys.</p>
    </div>
    
    <div class="form-group">
      <label>Recovery Phrase (Write This Down!)</label>
      <textarea readonly>${result.data.recoveryPhrase}</textarea>
    </div>
    
    <div class="alert alert-info">
      <strong>📧 Private Keys Sent to Email</strong>
      <p>Your Kyber and Dilithium private keys have been emailed to:</p>
      <p><strong>${userEmail}</strong></p>
      <p>Check your inbox and store them securely (password manager recommended).</p>
    </div>
    
    <label>
      <input type="checkbox" id="confirm-saved">
      I have written down my recovery phrase and will check my email for private keys
    </label>
    
    <button id="continue-login" disabled>Continue to Login</button>
  </div>
`;

// Enable button only after checkbox
document.getElementById('confirm-saved').addEventListener('change', (e) => {
  document.getElementById('continue-login').disabled = !e.target.checked;
});
```

**2. Server-Side Email Sending**:

Add to `POST /api/auth/activate` endpoint:

```typescript
// After successful activation, send email
await sendPrivateKeysEmail(env, {
  to: oneTimeLink.email,
  kyberPrivateKey,
  dilithiumPrivateKey,
  kyberPublicKey,
  dilithiumPublicKey,
  userId
});

// Return modified response (NO private keys)
return c.json({
  success: true,
  data: {
    userId,
    kyberPublicKey,      // ✅ Safe to show
    dilithiumPublicKey,  // ✅ Safe to show
    recoveryPhrase,      // ✅ Show once on screen
    // ❌ NO kyberPrivateKey
    // ❌ NO dilithiumPrivateKey
    emailSent: true,
    emailAddress: oneTimeLink.email
  }
});
```

**3. Email Template** (Postmark Integration):

```typescript
async function sendPrivateKeysEmail(
  env: Environment,
  data: {
    to: string;
    kyberPrivateKey: string;
    dilithiumPrivateKey: string;
    kyberPublicKey: string;
    dilithiumPublicKey: string;
    userId: string;
  }
) {
  const emailHTML = `
    <h1>🔐 Veritas Documents - Your Private Keys</h1>
    
    <p><strong>CRITICAL SECURITY INFORMATION</strong></p>
    
    <p>Your Veritas Documents account has been activated. Below are your cryptographic keys. 
    Store them in a secure password manager immediately.</p>
    
    <hr>
    
    <h2>Kyber Private Key (Encryption)</h2>
    <p>Use this to decrypt your documents:</p>
    <pre style="background: #f5f5f5; padding: 10px; word-wrap: break-word;">
${data.kyberPrivateKey}
    </pre>
    
    <h2>Dilithium Private Key (Signatures)</h2>
    <p>Use this to sign blockchain transactions:</p>
    <pre style="background: #f5f5f5; padding: 10px; word-wrap: break-word;">
${data.dilithiumPrivateKey}
    </pre>
    
    <hr>
    
    <h2>Public Keys (Reference Only)</h2>
    <p><strong>Kyber Public:</strong> ${data.kyberPublicKey.substring(0, 50)}...</p>
    <p><strong>Dilithium Public:</strong> ${data.dilithiumPublicKey.substring(0, 50)}...</p>
    
    <hr>
    
    <p><strong>⚠️ SECURITY WARNINGS:</strong></p>
    <ul>
      <li>Never share your private keys with anyone</li>
      <li>Store in a password manager (1Password, Bitwarden, etc.)</li>
      <li>We CANNOT recover lost private keys</li>
      <li>Delete this email after saving keys securely</li>
    </ul>
    
    <p>User ID: ${data.userId}</p>
    <p>If you did not create this account, please contact support immediately.</p>
  `;

  // Postmark API call
  await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': env.POSTMARK_API_KEY
    },
    body: JSON.stringify({
      From: 'noreply@veritasdocuments.com',
      To: data.to,
      Subject: '🔐 Veritas Documents - Your Private Keys (Save Securely)',
      HtmlBody: emailHTML,
      MessageStream: 'outbound'
    })
  });
}
```

---

## Security Benefits

### Current Issues:
- ❌ Private keys displayed on screen (could be screenshot)
- ❌ Keys visible in browser history/cache
- ❌ No confirmation user has saved keys
- ❌ Easy to accidentally close browser and lose keys

### With Email Approach:
- ✅ Private keys only sent to verified email
- ✅ User has permanent reference in inbox
- ✅ Recovery phrase still shown once (can't be emailed safely)
- ✅ Requires checkbox confirmation before proceeding
- ✅ Email can be archived securely or imported to password manager
- ✅ Audit trail of when keys were sent

---

## Implementation Checklist

- [ ] Fix frontend `handleActivation()` to generate keys client-side
- [ ] Add WASM initialization before key generation
- [ ] Modify activation success screen to hide private keys
- [ ] Create `sendPrivateKeysEmail()` function
- [ ] Add Postmark API key to Cloudflare secrets
- [ ] Update activation endpoint to call email function
- [ ] Add checkbox confirmation UI
- [ ] Test full activation flow
- [ ] Add email logging for audit trail

---

## Environment Variables Needed

```bash
POSTMARK_API_KEY=your-postmark-server-token
POSTMARK_FROM_EMAIL=noreply@veritasdocuments.com
```

---

## Notes

- **Recovery phrase** should NEVER be emailed (too sensitive, email is not encrypted)
- **Private keys** can be emailed because:
  1. Email is already verified and approved
  2. User needs them to login
  3. More secure than displaying on public screen
  4. Can be stored in password manager directly from email
- Future enhancement: Encrypt email body with user's recovery phrase
