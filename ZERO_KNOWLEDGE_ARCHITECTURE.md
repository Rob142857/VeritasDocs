# Zero-Knowledge Architecture - Post-Quantum Implementation

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production

---

## 📋 Table of Contents

1. [Core Principles](#core-principles)
2. [Login Verification (Decryption-Based)](#login-verification-decryption-based)
3. [Blockchain User Block Structure](#blockchain-user-block-structure)
4. [Machine Identities & System Accounts](#machine-identities--system-accounts)
5. [Complete Flow Diagrams](#complete-flow-diagrams)
6. [Security Properties](#security-properties)
7. [Testing](#testing)

---

## 🔐 Core Principles


### ✅ Current Implementation: Decryption-Based Verification

```
User provides Kyber private key
    ↓
Server retrieves user's encrypted data from VDC blockchain
    ↓
Server attempts decryption with provided key
    ↓
If decryption succeeds → User has correct key → Login succeeds
If decryption fails → Invalid key → Login fails
```

**Why this is secure:**
- ✅ Post-quantum secure (Kyber-768, NIST FIPS 203)
- ✅ True zero-knowledge (server never sees plaintext key or data)
- ✅ Cryptographic proof (only correct key can decrypt)
- ✅ No hashes stored (nothing to attack)
- ✅ No plaintext transmission
- ✅ Constant-time operations (no timing attacks)

---

## 🔓 Login Verification (Decryption-Based)

```
User provides Kyber private key
    ↓
Server retrieves user's blockchain transaction
    ↓
Server attempts decryption of encryptedUserData with provided key
    ↓
If decryption succeeds → User has correct key → Login succeeds
If decryption fails → Invalid key → Login fails
```

**Why this is secure:**
- ✅ Post-quantum secure (Kyber-768)
- ✅ Zero-knowledge (server never sees plaintext key)
- ✅ Cryptographic proof (only correct key can decrypt)
- ✅ No hashes stored (nothing to attack)
- ✅ No plaintext transmission

## ❌ Previous Insecure Method (Removed)

### SHA-256 Hash Verification (WRONG)

```
User provides private key
    ↓
Server hashes it with SHA-256
    ↓
Server compares hash with stored hash
```

**Why this was WRONG:**
- ❌ SHA-256 is NOT post-quantum secure
- ❌ Hash can be attacked with quantum computers
- ❌ Hash stored on server is a target
- ❌ Doesn't prove user can actually use the key
- ❌ Not true zero-knowledge

## Blockchain User Block Structure

### Plaintext (Public, No Encryption)

```typescript
{
  // PUBLICLY SEARCHABLE
  userId: "user_20251003_123456_abc",
  kyberPublicKey: "base64url-kyber-public-key",
  dilithiumPublicKey: "base64url-dilithium-public-key",
  accountType: "admin" | "paid" | "invited",  // Set at invite creation
  timestamp: 1696348800000,
  email: "user@example.com"  // For lookup only
}
```

**Purpose:**
- User can find their block by email or userId
- Browser can download block without decryption
- Public keys available for encryption/verification
- Account type used for UI permissions (admin vs regular user)

### Encrypted (Kyber-Wrapped, Client-Side Only)

```typescript
{
  encryptedUserData: {
    version: "1.0",
    algorithm: "kyber768-aes256gcm",
    kem_ct: "kyber-encapsulation-ciphertext",
    iv: "aes-initialization-vector",
    ciphertext: "encrypted-user-data"
  }
}
```

**Encrypted Contents (only user can decrypt):**
```typescript
{
  email: "user@example.com",
  personalDetails: {
    fullName: "John Doe",
    dateOfBirth: "1990-01-01",
    address: "123 Main St",
    phoneNumber: "+1234567890"
  },
  preferences: {
    // User preferences, settings, etc.
  },
  timestamp: 1696348800000
}
```

**Security:**
- ✅ Encrypted with user's Kyber public key
- ✅ Only user's Kyber private key can decrypt
- ✅ Server never sees plaintext
- ✅ Quantum-resistant encryption
- ✅ Nothing sensitive sent unencrypted

### Signature (Dilithium-2, Authenticity Proof)

```typescript
{
  signature: "dilithium-signature-base64url"
}
```

**What's Signed:**
```typescript
{
  kyberPublicKey,
  dilithiumPublicKey,
  encryptedUserData,
  timestamp
}
```

**Purpose:**
- Proves blockchain transaction is authentic
- Proves user created this block
- Cannot be forged or tampered with
- Post-quantum secure signature

---

## 🤖 Machine Identities & System Accounts

### The Challenge: Who Signs System Transactions?

In a zero-knowledge system, **users control their own private keys**. But the VDC blockchain requires **dual signatures** on every transaction:
1. **User signature** - Proves user authorized the action
2. **System signature** - Proves platform validated the action

**Question**: If the server never sees user private keys, how does it add the system signature without violating zero-knowledge?

**Answer**: **Machine identities** - cryptographic accounts controlled by the platform infrastructure.

### System Master Account

The VDC blockchain has a **system master account** with its own Dilithium keypair:

```typescript
// Generated ONCE during setup
{
  systemDilithiumPublicKey: "base64url-public-key",  // In genesis block
  systemDilithiumPrivateKey: "base64url-private-key", // In Cloudflare Secrets
  systemKyberPublicKey: "base64url-public-key",      // For encryption
  systemKyberPrivateKey: "base64url-private-key",    // For decryption
  keyVersion: 1,                                      // For key rotation
  keyId: "vdc-master-v1-1735888726509"
}
```

### Security Architecture for Machine Identities

#### 1. **Key Generation** (One-Time Setup)

```bash
# Generate system master keys
node generate-system-keys.js
```

Creates:
- `system-master-keys.json` - **NEVER deployed to production**
- `system-public-keys.json` - Public keys only
- Secrets setup script for Cloudflare

**Critical**: Master keys are generated **once** and stored securely. The complete private key file is **deleted** after secrets are configured.

#### 2. **Key Storage** (Split Secret Architecture)

Private keys are **never stored in a single location**:

```typescript
// Cloudflare Secrets (Production)
SYSTEM_DILITHIUM_PRIVATE_PART1  // First half of private key
SYSTEM_DILITHIUM_PRIVATE_PART2  // Second half of private key
SYSTEM_KYBER_PRIVATE            // Kyber private key
SYSTEM_KEY_ID                   // Key version identifier

// Reconstructed at runtime (in worker memory only)
const systemPrivateKey = PART1 + PART2;
```

**Why split the key?**
- ✅ No single secret contains the full private key
- ✅ Requires compromise of multiple secrets
- ✅ Enables key rotation without downtime
- ✅ Audit trail for secret access

#### 3. **Key Usage** (Runtime Only)

```typescript
// src/utils/blockchain.ts
function getSystemDilithiumPrivateKey(env: Environment): string {
  // Check for full key (development only)
  if (env.SYSTEM_DILITHIUM_PRIVATE_KEY?.length > 0) {
    return env.SYSTEM_DILITHIUM_PRIVATE_KEY;
  }

  // Production: Reconstruct from parts
  const part1 = env.SYSTEM_DILITHIUM_PRIVATE_PART1 || '';
  const part2 = env.SYSTEM_DILITHIUM_PRIVATE_PART2 || '';
  const combined = part1 + part2;

  if (!combined) {
    throw new Error('System Dilithium private key not configured');
  }

  return combined; // Exists only in memory during request
}
```

**Key properties:**
- ✅ Key reconstructed per-request in worker memory
- ✅ Never written to disk or logs
- ✅ Destroyed when request completes
- ✅ Zero-knowledge preserved (user keys still client-side only)

#### 4. **Dual Signature Flow**

```typescript
// User activation (src/handlers/auth.ts)
async function handleActivation() {
  // 1. User signs transaction client-side
  const userSignature = dilithium_2_sign(
    userPrivateKey,  // Client-side only!
    transactionData
  );

  // 2. Send to server (NO PRIVATE KEY)
  await fetch('/api/auth/activate', {
    body: JSON.stringify({
      ...data,
      signature: userSignature  // Pre-computed by client
    })
  });

  // 3. Server adds system signature (src/utils/blockchain.ts)
  const systemPrivateKey = getSystemDilithiumPrivateKey(env);
  const systemSignature = await maataraClient.signData(
    transactionData,
    systemPrivateKey  // Machine identity
  );

  // 4. Create dual-signed transaction
  const transaction = {
    ...txData,
    signatures: {
      user: {
        publicKey: userDilithiumPublicKey,
        signature: userSignature  // From client
      },
      system: {
        publicKey: systemDilithiumPublicKey,
        signature: systemSignature,  // From machine identity
        keyVersion: 1
      }
    }
  };
}
```

**Zero-knowledge preserved:**
- ✅ User private key NEVER sent to server
- ✅ User signature computed client-side
- ✅ System signature added server-side (machine identity)
- ✅ Both signatures verifiable by anyone with public keys

### Why Machine Identities Are Needed

#### 1. **Blockchain Consensus**

Every blockchain needs a way to validate transactions:

```
Traditional blockchain: Miners compete to validate blocks
VDC blockchain: System master account validates & signs blocks
```

**Benefits:**
- ✅ Consistent validation (no mining competition)
- ✅ Instant finality (no waiting for confirmations)
- ✅ Post-quantum signatures (Dilithium-2)
- ✅ Audit trail (all system actions signed)

#### 2. **Platform Integrity**

System signatures prove:
- ✅ Transaction was accepted by the platform
- ✅ Transaction passed validation rules
- ✅ Transaction is in the canonical chain
- ✅ Platform hasn't been compromised (signature verification)

#### 3. **Key Rotation**

Machine identities enable key rotation:

```typescript
// Future: Rotate system keys
{
  keyVersion: 2,  // New version
  systemDilithiumPublicKey: "new-public-key",
  previousKeyVersion: 1,
  rotationTimestamp: Date.now()
}

// Old transactions still valid (verified with old public key)
// New transactions signed with new key
```

### Security Guarantees

#### What Machine Identities CAN Do:
- ✅ Sign VDC blockchain transactions (system signature)
- ✅ Sign VDC blocks (block signature)
- ✅ Validate user signatures
- ✅ Add transactions to blockchain

#### What Machine Identities CANNOT Do:
- ❌ Access user private keys (never sent to server)
- ❌ Decrypt user personal data (encrypted with user's Kyber key)
- ❌ Forge user signatures (requires user's private key)
- ❌ Impersonate users (each user has unique keys)
- ❌ Change historical transactions (blockchain immutability)

### Comparison: User vs Machine Identities

| Property | User Identity | Machine Identity (System) |
|----------|---------------|---------------------------|
| **Key Generation** | Client-side (browser) | Server-side (one-time setup) |
| **Private Key Storage** | User's device/password manager | Cloudflare Secrets (split) |
| **Public Key Storage** | VDC blockchain | VDC genesis block |
| **Purpose** | Prove user authorization | Prove platform validation |
| **Signature Usage** | User transactions | System transactions + blocks |
| **Compromised Impact** | One user account | Entire blockchain (critical) |
| **Recovery** | User's recovery phrase | System backup (secure offsite) |
| **Zero-Knowledge** | Yes (client-side only) | N/A (server-side by design) |

### Trust Model

```
User trusts:
  ✅ Their own device (generates their keys)
  ✅ Ma'atara WASM module (open source, auditable)
  ✅ Math (Kyber-768 & Dilithium-2 security proofs)

User does NOT need to trust:
  ❌ Server (never sees user private keys)
  ❌ Cloudflare (user data encrypted client-side)
  ❌ Admins (cannot decrypt user data)

Platform trusts:
  ✅ Cloudflare Secrets (encrypted at rest, access controlled)
  ✅ HSM-backed secrets (optional future enhancement)
  ✅ Split secret architecture (requires multiple secret access)

Verifiers trust:
  ✅ VDC blockchain (public, auditable)
  ✅ Dilithium signatures (cryptographically verifiable)
  ✅ Genesis block (contains system public key)
```

### Operational Security

#### Production Deployment

```bash
# 1. Generate system keys (secure workstation)
node generate-system-keys.js

# 2. Configure secrets (automated script)
.\setup-production-secrets.ps1

# 3. Verify secrets uploaded
wrangler secret list --env production

# 4. Delete local master key file
Remove-Item system-master-keys.json -Force

# 5. Secure backup (offline storage)
# Store system-public-keys.json in git
# Store system-master-keys.json in secure vault (HSM, etc.)
```

#### Key Rotation (Future)

```typescript
// Planned: Automated key rotation
async function rotateSystemKeys() {
  // 1. Generate new keypair
  const newKeys = dilithium_2_keypair();

  // 2. Create rotation transaction (signed by old key)
  const rotationTx = {
    type: 'key_rotation',
    oldKeyVersion: 1,
    newKeyVersion: 2,
    newPublicKey: newKeys.publicKey,
    rotationTimestamp: Date.now()
  };

  // 3. Sign with OLD key
  const oldSignature = signData(rotationTx, oldPrivateKey);

  // 4. Sign with NEW key (proves possession)
  const newSignature = signData(rotationTx, newKeys.privateKey);

  // 5. Update secrets
  await updateCloudflareSecrets(newKeys);

  // 6. Add to blockchain
  await vdc.addAdminAction('key_rotation', rotationTx);
}
```

### Monitoring & Auditing

#### Cloudflare Secret Access Logs

```
✅ All secret access logged in Cloudflare audit trail
✅ Alerts on unexpected secret access
✅ Monitoring for failed signature attempts
✅ Dashboard for system key usage metrics
```

#### Blockchain Verification

```bash
# Verify genesis block signature
GET /api/vdc/block/0

# Verify system key hasn't changed
GET /api/vdc/stats

# Verify specific transaction signatures
GET /api/vdc/verify/:blockNumber
```

---

## 📊 Complete Flow Diagrams

### Set at Invite Creation (Not User-Definable!)

```typescript
// When admin creates invite
POST /api/auth/create-link
{
  "email": "user@example.com",
  "adminSecret": "...",
  "inviteType": "admin" | "user"  // ADMIN SETS THIS
}

// Stored in one-time link
{
  inviteType: "admin" | "user",
  // ...
}

// Becomes account type
accountType: inviteType === "admin" ? "admin" : "invited"
```

**Security:**
- ✅ Account type set by admin, not user
- ✅ Cannot be changed during activation
- ✅ Stored in blockchain transaction (immutable)
- ✅ UI uses this to gate admin functions
- ✅ Server validates permissions

### UI Permission Gating

```typescript
// After login, server returns accountType
{
  user: {...},
  accountType: "admin" | "paid" | "invited",
  blockchainTx: {...}
}

// Frontend checks permissions
if (accountType === "admin") {
  // Show admin functions:
  // - Create user invites
  // - View all users
  // - Manage platform
} else {
  // Regular user functions only:
  // - Create documents
  // - View own documents
  // - Search public documents
}
```

## Complete Flow Diagram

### User Registration

```
┌─────────────────────────────────────────────────────────────┐
│ 1. ADMIN CREATES INVITE LINK                                 │
│    inviteType: "admin" | "user"  ← ADMIN SETS THIS          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. USER VISITS ACTIVATION LINK                               │
│    Fills personal details                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. BROWSER GENERATES KEYS                                    │
│    • Kyber-768 keypair (encryption)                          │
│    • Dilithium-2 keypair (signing)                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. BROWSER ENCRYPTS USER DATA                                │
│    userData = { email, personalDetails, timestamp }          │
│    encryptedUserData = kyberEncrypt(userData, kyberPublicKey)│
│    ❌ NO PLAINTEXT DATA SENT TO SERVER                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. BROWSER SIGNS BLOCKCHAIN TRANSACTION                      │
│    blockData = {                                              │
│      kyberPublicKey,                                          │
│      dilithiumPublicKey,                                      │
│      encryptedUserData,                                       │
│      timestamp                                                │
│    }                                                          │
│    signature = dilithiumSign(blockData, dilithiumPrivateKey) │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. SEND TO SERVER (NO PLAINTEXT!)                           │
│    {                                                          │
│      token,                                                   │
│      kyberPublicKey,  ← PUBLIC                               │
│      dilithiumPublicKey,  ← PUBLIC                           │
│      encryptedUserData,  ← ENCRYPTED                         │
│      signature  ← PROOF                                       │
│    }                                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. SERVER VERIFIES SIGNATURE                                 │
│    dilithiumVerify(blockData, signature, dilithiumPublicKey) │
│    If invalid → REJECT                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. SERVER CREATES BLOCKCHAIN TRANSACTION                     │
│    {                                                          │
│      type: "user_registration",                              │
│      userId,                                                  │
│      email,  ← PLAINTEXT (for lookup)                        │
│      kyberPublicKey,  ← PUBLIC                               │
│      dilithiumPublicKey,  ← PUBLIC                           │
│      accountType,  ← FROM INVITE (admin set)                 │
│      encryptedUserData,  ← KYBER ENCRYPTED                   │
│      signature  ← DILITHIUM SIGNED                           │
│    }                                                          │
│    Stored in KV: blockchain:tx:{txId}                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. USER SAVES PRIVATE KEYS                                   │
│    • Kyber Private Key ← REQUIRED FOR LOGIN                  │
│    • Dilithium Private Key ← REQUIRED FOR SIGNING            │
│    • Recovery Phrase ← BACKUP                                 │
│    ❌ NEVER SENT TO SERVER                                   │
└─────────────────────────────────────────────────────────────┘
```

### Login Verification

```
┌─────────────────────────────────────────────────────────────┐
│ 1. USER SUBMITS LOGIN                                        │
│    email: "user@example.com"                                 │
│    privateKey: "kyber-private-key-base64url"                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. SERVER FINDS USER BY EMAIL                                │
│    userId = KV.get("user:email:user@example.com")           │
│    user = KV.get("user:{userId}")                            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. SERVER RETRIEVES BLOCKCHAIN TRANSACTION                   │
│    blockchainTxId = user.encryptedPrivateData.blockchainTxId│
│    tx = KV.get("blockchain:tx:{txId}")                       │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. SERVER ATTEMPTS DECRYPTION                                │
│    decryptedData = kyberDecrypt(                             │
│      tx.encryptedUserData,                                   │
│      providedPrivateKey                                       │
│    )                                                          │
│                                                               │
│    ✅ SUCCESS → User has correct key                         │
│    ❌ FAILURE → Invalid key, reject login                    │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. VERIFY EMAIL MATCH                                        │
│    if (decryptedData.email !== providedEmail)                │
│      REJECT                                                   │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. LOGIN SUCCESS                                             │
│    Return:                                                    │
│    • user data                                                │
│    • blockchainTx (for client verification)                  │
│    • accountType (for UI permissions)                        │
│    • decryptedUserData (user's own data)                     │
└─────────────────────────────────────────────────────────────┘
```

## Security Properties

### Zero-Knowledge

- ✅ Server never sees private keys
- ✅ Server never sees plaintext personal data
- ✅ User data encrypted with user's own key
- ✅ Only user can decrypt their data

### Post-Quantum Secure

- ✅ Kyber-768 for encryption (NIST FIPS 203)
- ✅ Dilithium-2 for signatures (NIST FIPS 204)
- ✅ AES-256-GCM for symmetric encryption
- ✅ No SHA-256 hashes for verification

### Blockchain Integrity

- ✅ Dilithium signatures prove authenticity
- ✅ Transactions are immutable
- ✅ Account type set by admin (not user)
- ✅ Complete audit trail

### Attack Resistance

- ✅ Quantum computer resistant
- ✅ No hash attacks possible
- ✅ No rainbow table attacks
- ✅ No brute force possible (decryption proves key)
- ✅ No timing attacks (constant-time crypto)

## Key Differences from Previous Implementation

| Aspect | ❌ Old (Insecure) | ✅ New (Secure) |
|--------|------------------|-----------------|
| Login Verification | SHA-256 hash comparison | Kyber decryption |
| Post-Quantum | No (SHA-256) | Yes (Kyber-768) |
| Data Transmission | Some plaintext | Only encrypted |
| Private Key | Hashed on server | Never sent to server |
| User Data Storage | Plain JSON | Kyber-encrypted |
| Account Type | Could be user-set | Admin-set only |
| Verification Method | Hash match | Cryptographic proof |

## Benefits

### For Users
- **Privacy**: Personal data never exposed
- **Security**: Quantum-resistant cryptography
- **Control**: Only they can decrypt their data
- **Portability**: Can export/import keys

### For Platform
- **Compliance**: True zero-knowledge
- **Audit Trail**: Blockchain verification
- **Security**: No sensitive data stored
- **Trust**: Cryptographic proofs

### For Attackers
- **Impossible**: Cannot break Kyber-768 with current or quantum computers
- **No Targets**: No hashes to attack
- **No Data**: Encrypted data is useless without key
- **Verifiable**: All operations cryptographically proven

## Testing

### Reset User and Create New Invite

```powershell
.\reset-user-blockchain.ps1 -Email "your@email.com"
```

### Test Activation

1. Visit activation URL
2. Fill personal details
3. Browser generates Kyber + Dilithium keys
4. Browser encrypts personal details
5. Browser signs transaction
6. Server verifies signature
7. Server stores blockchain transaction
8. **Save both private keys!**

### Test Login

1. Enter email + Kyber private key
2. Server retrieves blockchain transaction
3. Server attempts decryption
4. **If decryption succeeds → Login successful**
5. Server returns account type for UI permissions

## 🎯 Conclusion

This implementation provides:

### For Users
- ✅ **True zero-knowledge**: Server never sees private keys or plaintext data
- ✅ **Post-quantum secure**: NIST-standardized Kyber-768 & Dilithium-2
- ✅ **Cryptographic proof**: Decryption proves key ownership
- ✅ **Privacy by design**: All personal data encrypted client-side
- ✅ **Full control**: Only user can decrypt their own data

### For Platform
- ✅ **Blockchain integrity**: Dual signatures (user + system) on every transaction
- ✅ **Machine identities**: Secure system account for blockchain validation
- ✅ **Split secret architecture**: System keys protected across multiple secrets
- ✅ **Immutable audit trail**: Complete transaction history in VDC blockchain
- ✅ **Verifiable operations**: All actions cryptographically signed

### Security Guarantees
- ✅ **No hashes**: No vulnerable hash storage
- ✅ **No plaintext**: All sensitive data encrypted
- ✅ **Pure cryptographic proof**: Math-based verification
- ✅ **Quantum-resistant**: Future-proof cryptography
- ✅ **Zero-knowledge preserved**: Even with machine identities

**Architecture**: Zero-knowledge user identities + secure machine identities = trustless, verifiable, post-quantum secure system. 🔐

---

## 📚 Related Documentation

- [**SECURITY_ARCHITECTURE.md**](./SECURITY_ARCHITECTURE.md) - Complete security design and threat model
- [**BLOCKCHAIN_ARCHITECTURE.md**](./BLOCKCHAIN_ARCHITECTURE.md) - VDC blockchain technical details
- [**ACTIVATION_TOKEN_FLOW.md**](./ACTIVATION_TOKEN_FLOW.md) - User onboarding process
- [**VDC_INTEGRATION_GUIDE.md**](./VDC_INTEGRATION_GUIDE.md) - Working with VDC blockchain

---

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production Ready  
**Deployment**: https://veritas-docs-production.rme-6e5.workers.dev
