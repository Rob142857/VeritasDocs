# Keypack Implementation Plan

## Overview
Upgrade from individual JSON key downloads to a single encrypted `.keypack` file protected by a user-generated passphrase.

---

## Current Flow (Before)

### Activation
1. User fills personal details
2. **Client-side**: Generate Kyber + Dilithium keypairs
3. **Client-side**: Encrypt personal data with Kyber public key
4. **Client-side**: Sign transaction with Dilithium private key
5. **Server**: Store public keys + encrypted data in VDC blockchain
6. **Server**: Return success + recovery phrase
7. **Client**: ❌ **NO KEY DOWNLOAD** (keys lost!)

### Login
1. User enters email
2. User **manually pastes** Dilithium private key from... where?
3. Sign challenge with private key
4. Server verifies signature (zero-knowledge proof)

**Problem**: Users have no way to download/store their private keys! 🚨

---

## New Flow (After)

### Activation
1. User fills personal details
2. **Client-side**: Generate Kyber + Dilithium keypairs
3. **Client-side**: Generate 12-word BIP39 passphrase (user MUST copy)
4. **Client-side**: Encrypt personal data with Kyber public key
5. **Client-side**: Sign transaction with Dilithium private key
6. **Server**: Store public keys + encrypted data in VDC blockchain
7. **Server**: Return success (no keys sent!)
8. **Client-side**: Create keypack file:
   ```json
   {
     "version": "1.0",
     "email": "user@example.com",
     "timestamp": 1696435200000,
     "keyType": "pqc-kyber768-dilithium2",
     "keys": {
       "kyber": {
         "public": "base64url...",
         "private": "base64url..."
       },
       "dilithium": {
         "public": "base64url...",
         "private": "base64url..."
       }
     }
   }
   ```
9. **Client-side**: Encrypt keypack with passphrase-derived AES-GCM key:
   - Derive AES-GCM-256 key from passphrase using PBKDF2 (100k iterations)
   - Encrypt with AES-256-GCM
   - Generate salt (16 bytes random)
   - Store: `{salt, iv, ciphertext, authTag}`
10. **Client-side**: Download `.keypack` file (binary format)
11. **Client-side**: Show passphrase one more time with "⚠️ SAVE THIS PHRASE" warning

### Login
1. User enters **email**
2. User enters **12-word passphrase**
3. User uploads **`.keypack` file**
4. **Client-side**: Derive AES key from passphrase (PBKDF2 with stored salt)
5. **Client-side**: Decrypt keypack
6. **Client-side**: Validate email matches keypack
7. **Client-side**: Sign login challenge with Dilithium private key
8. **Server**: Verify signature (zero-knowledge proof)
9. **Client-side**: Store keys in memory (NOT localStorage for security)
10. Session established ✅

---

## Implementation Tasks

### 1. Backend (No Changes Required!)
- ✅ Server already never sees private keys
- ✅ VDC blockchain only stores public keys + encrypted data
- ✅ Login only verifies signatures (zero-knowledge)

### 2. Frontend Crypto Utilities (`src/frontend/app.ts`)

Add new functions:

```typescript
// Generate BIP39 mnemonic (12 words)
export async function generatePassphrase(): Promise<string> {
  // Use @maatara/core-pqc generateMnemonic() - already imported!
  const mnemonic = generateMnemonic();
  return mnemonic; // Returns 12-word phrase
}

// Derive AES key from passphrase
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<string> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);
  
  // Import passphrase as CryptoKey
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  // Derive AES-256-GCM key using PBKDF2
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000, // 100k iterations for security
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
  
  // Export as base64url for storage
  const exported = await crypto.subtle.exportKey('raw', aesKey);
  return b64uEncode(new Uint8Array(exported));
}

// Create keypack structure
export interface Keypack {
  version: string;
  email: string;
  timestamp: number;
  keyType: string;
  keys: {
    kyber: {
      public: string;
      private: string;
    };
    dilithium: {
      public: string;
      private: string;
    };
  };
}

// Encrypt keypack with passphrase
export async function encryptKeypack(
  keypack: Keypack,
  passphrase: string
): Promise<{salt: string; iv: string; ciphertext: string; authTag: string}> {
  // Generate random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive AES key from passphrase
  const aesKeyB64u = await deriveKeyFromPassphrase(passphrase, salt);
  
  // Serialize keypack to JSON
  const keypackJson = JSON.stringify(keypack);
  const plaintextB64u = b64uEncode(new TextEncoder().encode(keypackJson));
  
  // Encrypt with AES-256-GCM using Ma'atara library
  const aadB64u = b64uEncode(new TextEncoder().encode('veritas-keypack-v1'));
  const result = await (aesGcmWrap as any)(aesKeyB64u, plaintextB64u, aadB64u);
  
  if (result.error) throw new Error(result.error);
  
  return {
    salt: b64uEncode(salt),
    iv: result.iv_b64u,
    ciphertext: result.ct_b64u,
    authTag: '' // GCM auth tag is included in ct_b64u
  };
}

// Decrypt keypack with passphrase
export async function decryptKeypack(
  encrypted: {salt: string; iv: string; ciphertext: string},
  passphrase: string
): Promise<Keypack> {
  // Decode salt
  const salt = b64uDecode(encrypted.salt);
  
  // Derive AES key from passphrase
  const aesKeyB64u = await deriveKeyFromPassphrase(passphrase, salt);
  
  // Decrypt with AES-256-GCM
  const aadB64u = b64uEncode(new TextEncoder().encode('veritas-keypack-v1'));
  const result = await (aesGcmUnwrap as any)(
    aesKeyB64u,
    encrypted.iv,
    encrypted.ciphertext,
    aadB64u
  );
  
  if (result.error) throw new Error('Incorrect passphrase or corrupted keypack');
  
  // Decode and parse keypack
  const keypackJson = new TextDecoder().decode(b64uDecode(result.dek_b64u));
  return JSON.parse(keypackJson) as Keypack;
}

// Download keypack as .keypack file
export function downloadKeypack(
  email: string,
  encrypted: {salt: string; iv: string; ciphertext: string}
): void {
  const keypackData = {
    format: 'veritas-keypack-v1',
    encrypted
  };
  
  const blob = new Blob([JSON.stringify(keypackData, null, 2)], {
    type: 'application/octet-stream'
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `veritas-${email.replace('@', '-')}.keypack`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

### 3. Frontend UI (`public/app.js`)

#### 3a. Modify `renderActivationPage()`

Add passphrase display section:

```html
<div id="passphrase-section" style="display: none;">
  <div class="alert alert-warning">
    <h3>⚠️ Save Your Recovery Passphrase</h3>
    <p><strong>Write down these 12 words in order. You will need them to access your account.</strong></p>
    <div id="passphrase-words" style="font-family: monospace; font-size: 1.2rem; padding: 1rem; background: #f5f5f5; border-radius: 4px; user-select: all;"></div>
    <button id="copy-passphrase" class="btn btn-secondary">📋 Copy Passphrase</button>
    <div class="form-group mt-2">
      <label>
        <input type="checkbox" id="confirm-saved-passphrase">
        I have written down my passphrase in a safe place
      </label>
    </div>
    <button id="download-keypack-btn" class="btn btn-primary" disabled>Download Keypack & Complete Activation</button>
  </div>
</div>
```

#### 3b. Modify `handleActivation()`

```javascript
async handleActivation(token) {
  const personalDetails = { ... };
  
  try {
    // Step 1: Initialize PQC
    await window.VeritasCrypto.ensureCryptoReady();
    
    // Step 2: Generate keypairs
    const keypairs = await window.VeritasCrypto.generateClientKeypair();
    
    // Step 3: Generate passphrase (BIP39 mnemonic)
    const passphrase = await window.VeritasCrypto.generatePassphrase();
    console.log('Generated passphrase (12 words)');
    
    // Step 4: Get email from token
    const tokenResponse = await fetch(`/api/auth/token-info?token=${token}`);
    const tokenData = await tokenResponse.json();
    const userEmail = tokenData.data.email;
    
    // Step 5: Encrypt personal data
    const userData = { email: userEmail, personalDetails, ... };
    const encryptedUserData = await window.VeritasCrypto.encryptDocumentData(
      JSON.stringify(userData),
      keypairs.kyberPublicKey
    );
    
    // Step 6: Sign transaction
    const dataToSign = JSON.stringify({ ... });
    const signature = await window.VeritasCrypto.signData(dataToSign, keypairs.dilithiumPrivateKey);
    
    // Step 7: Activate account on server (public keys only!)
    const response = await fetch('/api/auth/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token,
        kyberPublicKey: keypairs.kyberPublicKey,
        dilithiumPublicKey: keypairs.dilithiumPublicKey,
        encryptedUserData,
        signature
      })
    });
    
    const result = await response.json();
    
    if (!result.success) {
      this.showAlert('error', result.error);
      return;
    }
    
    // Step 8: Show passphrase to user
    document.getElementById('activation-form').style.display = 'none';
    document.getElementById('passphrase-section').style.display = 'block';
    document.getElementById('passphrase-words').textContent = passphrase;
    
    // Step 9: Setup copy button
    document.getElementById('copy-passphrase').onclick = () => {
      navigator.clipboard.writeText(passphrase);
      this.showAlert('success', 'Passphrase copied to clipboard!');
    };
    
    // Step 10: Enable download button when confirmed
    document.getElementById('confirm-saved-passphrase').onchange = (e) => {
      document.getElementById('download-keypack-btn').disabled = !e.target.checked;
    };
    
    // Step 11: Download keypack button
    document.getElementById('download-keypack-btn').onclick = async () => {
      // Create keypack
      const keypack = {
        version: '1.0',
        email: userEmail,
        timestamp: Date.now(),
        keyType: 'pqc-kyber768-dilithium2',
        keys: {
          kyber: {
            public: keypairs.kyberPublicKey,
            private: keypairs.kyberPrivateKey
          },
          dilithium: {
            public: keypairs.dilithiumPublicKey,
            private: keypairs.dilithiumPrivateKey
          }
        }
      };
      
      // Encrypt keypack with passphrase
      const encrypted = await window.VeritasCrypto.encryptKeypack(keypack, passphrase);
      
      // Download encrypted keypack
      window.VeritasCrypto.downloadKeypack(userEmail, encrypted);
      
      this.showAlert('success', 'Activation complete! You can now log in.');
      
      // Redirect to login after 3 seconds
      setTimeout(() => {
        window.location.href = '/';
      }, 3000);
    };
    
  } catch (error) {
    console.error('Activation error:', error);
    this.showAlert('error', 'Activation error: ' + error.message);
  }
}
```

#### 3c. Modify `renderLogin()`

```html
<form id="login-form">
  <div class="form-group">
    <label class="label" for="email">Email</label>
    <input type="email" id="email" class="input" required>
  </div>
  
  <div class="form-group">
    <label class="label" for="passphrase">Recovery Passphrase (12 words)</label>
    <textarea id="passphrase" class="textarea" placeholder="Enter your 12-word passphrase..." rows="2" required></textarea>
  </div>
  
  <div class="form-group">
    <label class="label" for="keypack-file">Keypack File</label>
    <input type="file" id="keypack-file" class="input" accept=".keypack" required>
  </div>
  
  <button type="submit" class="btn btn-primary" style="width: 100%;">Login</button>
</form>
```

#### 3d. Modify `handleLogin()`

```javascript
async handleLogin() {
  const email = document.getElementById('email').value;
  const passphrase = document.getElementById('passphrase').value.trim();
  const keypackFile = document.getElementById('keypack-file').files[0];
  
  if (!email || !passphrase || !keypackFile) {
    this.showAlert('error', 'Email, passphrase, and keypack file are required');
    return;
  }
  
  try {
    this.showAlert('info', 'Loading keypack...');
    
    // Step 1: Read keypack file
    const keypackText = await keypackFile.text();
    const keypackData = JSON.parse(keypackText);
    
    if (keypackData.format !== 'veritas-keypack-v1') {
      this.showAlert('error', 'Invalid keypack format');
      return;
    }
    
    // Step 2: Initialize PQC
    await window.VeritasCrypto.ensureCryptoReady();
    
    // Step 3: Decrypt keypack with passphrase
    this.showAlert('info', 'Decrypting keypack...');
    const keypack = await window.VeritasCrypto.decryptKeypack(
      keypackData.encrypted,
      passphrase
    );
    
    // Step 4: Validate email matches
    if (keypack.email !== email) {
      this.showAlert('error', 'Email does not match keypack');
      return;
    }
    
    // Step 5: Sign login challenge
    const timestamp = Date.now();
    const challenge = `login:${email}:${timestamp}`;
    const signature = await window.VeritasCrypto.signData(
      challenge,
      keypack.keys.dilithium.private
    );
    
    // Step 6: Send zero-knowledge proof
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, signature, timestamp })
    });
    
    const result = await response.json();
    
    if (result.success) {
      // Store user data + decrypted keys in memory (NOT localStorage!)
      this.currentUser = result.data.user;
      this.currentUser.keys = keypack.keys; // Store decrypted keys
      this.currentUser.sessionToken = result.data.sessionToken;
      
      // Only store non-sensitive data in localStorage
      localStorage.setItem('veritas-user', JSON.stringify({
        email: this.currentUser.email,
        accountType: this.currentUser.accountType,
        sessionToken: this.currentUser.sessionToken
      }));
      
      this.navigateTo('dashboard');
    } else {
      this.showAlert('error', result.error || 'Login failed');
    }
    
  } catch (error) {
    console.error('Login error:', error);
    if (error.message.includes('passphrase')) {
      this.showAlert('error', 'Incorrect passphrase or corrupted keypack');
    } else {
      this.showAlert('error', 'Login error: ' + error.message);
    }
  }
}
```

---

## Security Considerations

### ✅ What's Good
1. **Zero-knowledge**: Server NEVER sees private keys or passphrase
2. **Client-side encryption**: All crypto happens in browser
3. **Strong KDF**: PBKDF2 with 100k iterations prevents brute force
4. **PQC**: Kyber-768 + Dilithium-2 (NIST standardized)
5. **AES-256-GCM**: Authenticated encryption (no tampering)
6. **Memory-only keys**: Private keys NOT stored in localStorage (session only)

### ⚠️ Risks to Mitigate
1. **Passphrase loss**: If user loses passphrase + keypack → PERMANENT LOCKOUT
   - Solution: Clear warnings, mandatory confirmation checkbox
   - Future: Optional recovery email (encrypted with system key)

2. **Keypack file loss**: User can lose `.keypack` file
   - Solution: Encourage multiple backups (USB drive, password manager)
   - Future: Encrypted cloud backup option

3. **Weak passphrase**: User might choose weak passphrase
   - Solution: BIP39 generates strong 12-word phrases (128 bits entropy)
   - No custom passphrases allowed

4. **Session hijacking**: Keys stored in memory could leak
   - Solution: Clear keys on logout/tab close
   - Use `sessionStorage` instead of `localStorage` for keys

---

## Testing Plan

### Manual Testing
1. **Activation Flow**:
   - ✅ Generate passphrase (12 words)
   - ✅ Show passphrase with copy button
   - ✅ Require confirmation checkbox
   - ✅ Download `.keypack` file
   - ✅ Verify file is encrypted (not plaintext JSON)

2. **Login Flow**:
   - ✅ Upload `.keypack` file
   - ✅ Enter correct passphrase → success
   - ✅ Enter wrong passphrase → error
   - ✅ Upload wrong `.keypack` → error
   - ✅ Mismatched email → error

3. **Security**:
   - ✅ Private keys NOT in network requests (inspect DevTools)
   - ✅ Keypack file encrypted (cannot read in text editor)
   - ✅ Keys cleared on logout

### Automated Testing
- Unit tests for `encryptKeypack()` / `decryptKeypack()`
- Integration tests for full activation flow
- E2E tests with Playwright

---

## Migration Strategy

### For Existing Users (if any)
- **Problem**: Existing users have no `.keypack` file
- **Solution**: Add "Download Keypack" button in dashboard
  - User enters current Dilithium private key
  - User creates new passphrase
  - System generates `.keypack` from existing keys
  - User downloads encrypted keypack

---

## Future Enhancements

1. **Encrypted Cloud Backup**: Store encrypted keypack in R2 (triple-encrypted)
2. **Recovery Email**: Send encrypted keypack to user's email (system key + user passphrase)
3. **Hardware Key Support**: WebAuthn for biometric unlock
4. **Multi-factor**: Require both keypack + TOTP
5. **Passphrase Strength Meter**: Visual feedback on passphrase entropy
6. **Account Recovery**: Shamir's Secret Sharing (split passphrase among trusted contacts)

---

## Implementation Timeline

**Phase 1** (This PR):
- [x] Add crypto utilities to `app.ts`
- [x] Modify activation UI + flow
- [x] Modify login UI + flow
- [x] Test end-to-end
- [x] Update documentation

**Phase 2** (Future):
- [ ] Add "Download Keypack" for existing users
- [ ] Add encrypted cloud backup option
- [ ] Add recovery email option

**Phase 3** (Future):
- [ ] Hardware key support
- [ ] Multi-factor authentication
- [ ] Account recovery options
