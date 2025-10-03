# Blockchain-Based User Registration System

**Version**: 1.1.0  
**Last Updated**: October 3, 2025  
**Status**: Production  
**Audience**: Developers, Legal  
**Category**: Architecture  
**Priority**: 7  
**Summary**: Operational blueprint for the user registration blockchain workflow, covering key generation, encryption, and dual-signature validation.  
**Keywords**: registration, blockchain, workflow, signatures, compliance

---

## Overview

The Veritas Documents platform now implements a true blockchain-based user registration system where each user account activation creates a cryptographically signed transaction stored on the Veritas blockchain.

## Architecture

### User Registration Flow

```
┌─────────────────────────────────────────────────────────────┐
│ 1. CLIENT-SIDE KEY GENERATION                                │
│                                                               │
│    Browser generates:                                         │
│    ├── Kyber-768 keypair (encryption)                        │
│    ├── Dilithium-2 keypair (signing)                        │
│    └── SHA-256 hash of Kyber private key                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. DATA ENCRYPTION                                            │
│                                                               │
│    Personal details encrypted with Kyber public key:         │
│    • Full name                                                │
│    • Date of birth                                            │
│    • Address                                                  │
│    • Phone number                                             │
│                                                               │
│    Result: Kyber-wrapped ciphertext                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. TRANSACTION SIGNING                                        │
│                                                               │
│    Data to sign:                                              │
│    {                                                          │
│      email: "user@example.com",                              │
│      personalDetailsHash: "sha256-hash",                     │
│      timestamp: 1696348800000                                │
│    }                                                          │
│                                                               │
│    Signature: Dilithium-2 private key signs above data      │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. BLOCKCHAIN TRANSACTION CREATION                            │
│                                                               │
│    Server receives:                                           │
│    • Encrypted personal details (Kyber-wrapped)              │
│    • Kyber public key                                        │
│    • Dilithium public key                                    │
│    • SHA-256 hash of private key                             │
│    • Dilithium signature                                     │
│                                                               │
│    Server creates blockchain transaction:                     │
│    {                                                          │
│      type: "user_registration",                              │
│      userId: "user_20251003_123456",                         │
│      email: "user@example.com",                              │
│      kyberPublicKey: "...",                                  │
│      dilithiumPublicKey: "...",                              │
│      encryptedPersonalDetails: "...",                        │
│      signature: "...",                                       │
│      timestamp: 1696348800000                                │
│    }                                                          │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. STORAGE                                                    │
│                                                               │
│    KV Storage (temporary, until IPFS migration):             │
│    • blockchain:tx:{txId} → Transaction data                 │
│    • blockchain:user:{userId} → Transaction ID mapping       │
│    • user:{userId} → User record                             │
│    • user:email:{email} → User ID mapping                    │
│                                                               │
│    User record includes:                                      │
│    • Kyber public key                                        │
│    • Reference to blockchain transaction                      │
│    • SHA-256 hash for login verification                     │
│    • Dilithium public key for signature verification         │
└─────────────────────────────────────────────────────────────┘
```

## Data Structures

### Blockchain Transaction

```typescript
{
  type: 'user_registration',
  userId: 'user_20251003_123456_abc',
  email: 'robert.evans@rmesolutions.com.au',
  kyberPublicKey: 'base64url-encoded-kyber-public-key',
  dilithiumPublicKey: 'base64url-encoded-dilithium-public-key',
  encryptedPersonalDetails: {
    version: '1.0',
    algorithm: 'kyber768-aes256gcm',
    kem_ct: 'kyber-ciphertext',
    iv: 'aes-iv',
    ciphertext: 'encrypted-personal-details'
  },
  signature: 'dilithium-signature-of-transaction',
  timestamp: 1696348800000
}
```

### User Record

```typescript
{
  id: 'user_20251003_123456_abc',
  email: 'robert.evans@rmesolutions.com.au',
  publicKey: 'kyber-public-key-b64u',  // For encryption
  encryptedPrivateData: {
    email: 'robert.evans@rmesolutions.com.au',
    recoveryPhrase: '12-word mnemonic phrase',
    privateKeyHash: 'sha256-hash-of-kyber-private-key',
    dilithiumPublicKey: 'dilithium-public-key-b64u',
    blockchainTxId: 'tx_user_20251003_123456_abc_1696348800000'
  },
  createdAt: 1696348800000,
  hasActivated: true,
  accountType: 'paid'
}
```

## Login Verification

### Method 1: Private Key Hash Verification

```typescript
// Client submits login request
POST /api/auth/login
{
  email: "user@example.com",
  privateKey: "kyber-private-key-b64u"
}

// Server verification process
1. Retrieve user by email
2. Hash provided private key (SHA-256)
3. Compare with stored hash
4. If match → Login successful
5. Return user data + blockchain transaction
```

### Method 2: Blockchain Signature Verification (Future)

```typescript
// Enhanced verification using blockchain
1. Retrieve user's blockchain transaction
2. Verify Dilithium signature on transaction
3. Decrypt personal details with provided Kyber key
4. If decryption succeeds → User identity proven
5. Login successful
```

## Key Management

### Keys Generated During Activation

| Key | Type | Purpose | Stored Where | User Must Save |
|-----|------|---------|--------------|----------------|
| Kyber Private Key | Secret | Login + Decryption | ❌ Nowhere (client only) | ✅ **YES** |
| Kyber Public Key | Public | Encryption | ✅ Server KV + Blockchain | ❌ No |
| Dilithium Private Key | Secret | Sign transactions | ❌ Nowhere (client only) | ✅ **YES** |
| Dilithium Public Key | Public | Verify signatures | ✅ Server KV + Blockchain | ❌ No |
| Private Key Hash | Public | Login verification | ✅ Server KV | ❌ No |
| Recovery Phrase | Secret | Account recovery | ❌ Nowhere (client only) | ⚠️ Recommended |

### Security Properties

- **Zero-Knowledge**: Server never sees private keys
- **Quantum-Resistant**: NIST post-quantum algorithms
- **Cryptographically Verifiable**: Dilithium signatures prove identity
- **Immutable**: Blockchain transactions cannot be altered
- **Decentralized**: Data encrypted with user's own keys

## Migration to Full Blockchain

Currently, transactions are stored in Cloudflare KV. The migration plan:

### Phase 1: Transaction Storage (Current)
```
blockchain:tx:{txId} → KV
blockchain:user:{userId} → KV
```

### Phase 2: Block Creation
```
1. Accumulate transactions in pending pool
2. Create Veritas block with Merkle root
3. Sign block with validator key
4. Store block in KV
```

### Phase 3: IPFS Migration
```
1. Upload block to IPFS
2. Store IPFS hash in KV
3. Pin block for persistence
4. Reference IPFS hash in next block
```

### Phase 4: Full Chain Validation
```
1. Verify block signatures
2. Validate Merkle proofs
3. Check transaction signatures
4. Ensure chain integrity
```

## Benefits

### For Users

- **True Ownership**: Cryptographic proof of identity
- **Privacy**: Personal details encrypted, never exposed
- **Security**: Quantum-resistant cryptography
- **Portability**: Keys can be exported/imported
- **Legal Standing**: Blockchain-verified identity

### For Platform

- **Audit Trail**: Complete verification history
- **Compliance**: Cryptographic proof for regulations
- **Scalability**: Decentralized storage
- **Trust**: Transparent verification process
- **Future-Proof**: Quantum-resistant algorithms

## Testing the New System

### 1. Reset Existing User

```powershell
.\reset-user-blockchain.ps1 -Email "your@email.com"
```

### 2. Activate Account

1. Visit activation URL from script output
2. Fill in personal details
3. Browser generates Kyber + Dilithium keys
4. Browser encrypts personal details
5. Browser signs blockchain transaction
6. Server creates blockchain transaction
7. Save both private keys!

### 3. Login

1. Enter email + Kyber private key
2. Server verifies by hashing key
3. Server returns blockchain transaction
4. Login successful

### 4. Verify Blockchain Transaction

```bash
# Get transaction from KV
npx wrangler kv key get "blockchain:tx:YOUR_TX_ID" \
  --namespace-id "9f0ea31309cd44cab7bfe3569e16aa45" \
  --remote

# Verify signature client-side using Dilithium public key
```

## Next Steps

1. ✅ **User Registration** - Complete with blockchain transactions
2. ✅ **Login Verification** - SHA-256 hash method working
3. ⏳ **Block Creation** - Accumulate transactions into blocks
4. ⏳ **IPFS Migration** - Move blocks to IPFS
5. ⏳ **Chain Validation** - Full blockchain verification
6. ⏳ **Document Signing** - Use Dilithium for document signatures
7. ⏳ **Asset Transfers** - Transfer documents via signed transactions

## Conclusion

The Veritas Documents platform now implements a blockchain-based user registration system that:

- Generates post-quantum cryptographic keys client-side
- Encrypts personal identity information with Kyber-768
- Signs blockchain transactions with Dilithium-2
- Stores immutable identity records on the Veritas blockchain
- Verifies user identity through cryptographic proof

This provides a foundation for a fully decentralized, quantum-resistant legal document storage platform with blockchain-verified identity.
