# Storage Architecture

**Version**: 1.0.0  
**Last Updated**: October 4, 2025  
**Status**: Implemented

## Overview

Veritas Documents implements a **unified multi-tier storage system** that enforces encryption and distributes data across:

- **R2** (Cloudflare R2): Primary durable storage (encrypted)
- **IPFS** (Pinata): Decentralized backup and public verifiability (encrypted)
- **KV** (Cloudflare KV): Fast access for blocks and metadata

## Core Principles

1. **Encryption First**: All sensitive data MUST be encrypted before storage
2. **Multi-Tier Redundancy**: Critical data stored in multiple tiers for durability
3. **Policy-Based Storage**: Each data type has a predefined storage policy
4. **Zero-Knowledge**: User data encrypted with user keys; system data encrypted with system keys

## Storage Policies

### Chain Blocks
```typescript
{
  tiers: ['kv', 'r2', 'ipfs'],
  encrypt: false, // Publicly verifiable
  requireDualSignature: true
}
```
- **KV**: Fast block retrieval for verification
- **R2**: Long-term archival
- **IPFS**: Public verifiability and decentralized backup
- **Dual Signatures**: User + System signatures on every block

### Pending Transactions
```typescript
{
  tiers: ['r2'],
  encrypt: true,
  encryptionKeyType: 'system'
}
```
- **R2**: Encrypted with system Kyber key
- **No KV**: Pending state is temporary
- **Optional IPFS**: Can be added for backup

### Documents (Asset Content)
```typescript
{
  tiers: ['r2', 'ipfs'],
  encrypt: true,
  encryptionKeyType: 'user'
}
```
- **R2**: Primary storage, encrypted with user's Kyber public key
- **IPFS**: Decentralized backup, also encrypted
- **Zero-Knowledge**: Server never sees plaintext

### Activation Tokens
```typescript
{
  tiers: ['r2'],
  encrypt: true,
  encryptionKeyType: 'system'
}
```
- **R2**: Encrypted with system Kyber key
- **Temporary**: Deleted after activation
- **Migrated from KV**: Legacy tokens moved to R2

### User Metadata
```typescript
{
  tiers: ['kv', 'r2'],
  encrypt: true,
  encryptionKeyType: 'system'
}
```
- **KV**: Fast user lookup
- **R2**: Encrypted backup of user details

### Asset Metadata
```typescript
{
  tiers: ['kv', 'r2'],
  encrypt: false // Metadata is public
}
```
- **KV**: Fast asset queries
- **R2**: Backup storage

## Encryption Details

### Kyber-768 + AES-256-GCM Envelope

All encrypted payloads use the Ma'atara Protocol format:

```json
{
  "version": "1.0",
  "algorithm": "kyber768-aes256gcm",
  "kem_ct": "<base64url-encoded-kyber-ciphertext>",
  "iv": "<base64url-encoded-aes-iv>",
  "ciphertext": "<base64url-encoded-aes-ciphertext>"
}
```

### Encryption Metadata

Stored in R2 `customMetadata`:

```typescript
{
  encryption_algorithm: "kyber768-aes256gcm",
  encryption_version: "1.0",
  encryption_key_id: "user_id | system",
  encryption_source: "client | server | system"
}
```

## Storage Manager API

### Store Object

```typescript
const manager = new StorageManager(env);

const result = await manager.store(
  'documents/user123/asset456.json',  // Key
  documentData,                        // Data
  STORAGE_POLICIES.document,          // Policy
  userKyberPublicKey                  // Encryption key
);

// Returns:
// {
//   success: true,
//   r2Key: "documents/user123/asset456.json",
//   ipfsHash: "QmXxx...",
//   ipfsGatewayUrl: "https://...",
//   encryption: { algorithm: "kyber768-aes256gcm", ... },
//   storedAt: 1234567890
// }
```

### Retrieve Object

```typescript
const stored = await manager.retrieve(
  'documents/user123/asset456.json',
  STORAGE_POLICIES.document,
  userKyberPrivateKey  // Decryption key
);

// Returns:
// {
//   data: { ... },  // Decrypted data
//   metadata: {
//     key: "documents/user123/asset456.json",
//     storedAt: 1234567890,
//     encryption: { ... },
//     r2Key: "documents/user123/asset456.json",
//     ipfsHash: "QmXxx..."
//   }
// }
```

### Verify Encryption

```typescript
const verification = await manager.verifyEncryption('documents/user123/asset456.json');

// Returns:
// {
//   encrypted: true,
//   metadata: {
//     algorithm: "kyber768-aes256gcm",
//     version: "1.0",
//     keyId: "user123",
//     source: "client"
//   },
//   tier: "r2"
// }
```

## Convenience Functions

### Store Chain Block

```typescript
import { storeChainBlock } from './utils/store';

const result = await storeChainBlock(env, blockNumber, block);
// Automatically stores in KV + R2 + IPFS
```

### Store Pending Transaction

```typescript
import { storePendingTransaction } from './utils/store';

const result = await storePendingTransaction(env, txId, transaction);
// Automatically encrypts with system key and stores in R2
```

### Store Document

```typescript
import { storeDocument } from './utils/store';

const result = await storeDocument(
  env,
  userId,
  assetId,
  documentData,
  userKyberPublicKey
);
// Encrypts with user key, stores in R2 + IPFS
```

### Store Activation Token

```typescript
import { storeActivationToken } from './utils/store';

const result = await storeActivationToken(env, token, tokenData);
// Encrypts with system key, stores in R2
```

## Migration from Legacy Storage

### Before (Legacy)

```typescript
// Inconsistent storage, sometimes unencrypted
await env.VERITAS_KV.put(`pending:${txId}`, JSON.stringify(tx));

// Or mixed KV/R2
await env.VDC_STORAGE.put(key, JSON.stringify(data), { ... });
```

### After (Unified)

```typescript
// Consistent, policy-enforced, encrypted
const result = await storePendingTransaction(env, txId, tx);
```

## Data Flow Examples

### 1. User Creates Document

```
Client (Browser)
  ↓ Encrypts with user's Kyber public key
  ↓ Signs with user's Dilithium private key
Server (Worker)
  ↓ Validates signature
  ↓ Calls storeDocument(env, userId, assetId, encryptedDoc, userPubKey)
StorageManager
  ↓ Stores encrypted payload in R2
  ↓ Uploads encrypted payload to IPFS
  ↓ Returns { r2Key, ipfsHash, encryption metadata }
```

### 2. System Creates Pending Transaction

```
Blockchain Handler
  ↓ Creates transaction with dual signatures
  ↓ Calls storePendingTransaction(env, txId, tx)
StorageManager
  ↓ Encrypts with system Kyber public key
  ↓ Stores encrypted payload in R2
  ↓ Returns { r2Key, encryption metadata }
```

### 3. Mining Block

```
Miner
  ↓ Fetches pending transactions (auto-decrypts)
  ↓ Creates block with dual-signed transactions
  ↓ Calls storeChainBlock(env, blockNumber, block)
StorageManager
  ↓ Stores block in KV (fast access)
  ↓ Archives block in R2 (durability)
  ↓ Uploads block to IPFS (verifiability)
  ↓ Returns { kvKey, r2Key, ipfsHash }
```

## Security Guarantees

1. **Encryption Enforcement**: `StorageManager` throws error if policy requires encryption but no key provided
2. **Automatic Decryption**: Retrieval methods auto-decrypt when policy indicates encryption
3. **Metadata Tracking**: Every storage operation records encryption metadata
4. **Verification Tools**: `verifyEncryption()` confirms encryption status

## Future Enhancements

- [ ] **Automatic Migration**: Scan KV for unencrypted/legacy data and migrate to R2
- [ ] **Retention Policies**: Auto-delete expired activation tokens
- [ ] **IPFS Pinning Status**: Track and report IPFS pin status
- [ ] **Storage Metrics**: Track storage costs and usage per tier
- [ ] **Encryption Rotation**: Support key rotation without data loss

## Related Documentation

- `ZERO_KNOWLEDGE_ARCHITECTURE.md` - Zero-knowledge security model
- `BLOCKCHAIN_ARCHITECTURE.md` - VDC blockchain design
- `SECURITY_ARCHITECTURE.md` - Overall security design
