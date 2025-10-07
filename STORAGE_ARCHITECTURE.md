# Storage Architecture and Privacy Framework

**Version**: 2.0.0  
**Last Updated**: October 7, 2025  
**Status**: Production Implementation  
**Audience**: Technical, Legal, Research

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Cloudflare Infrastructure Foundation](#cloudflare-infrastructure-foundation)
3. [Multi-Tier Storage Architecture](#multi-tier-storage-architecture)
4. [IPFS Privacy-Aware Metadata](#ipfs-privacy-aware-metadata)
5. [Encryption and Security](#encryption-and-security)
6. [Storage Policies](#storage-policies)
7. [Implementation Guide](#implementation-guide)
8. [Legal and Compliance](#legal-and-compliance)
9. [Verification and Audit](#verification-and-audit)

---

## Executive Summary

Veritas Documents implements a **privacy-first, quantum-resistant storage architecture** built on Cloudflare's global infrastructure with seamless post-quantum cryptography. The system combines:

- **Cloudflare R2 + TLS 1.3**: Primary encrypted storage with built-in PQC transport security
- **IPFS (Pinata)**: Decentralized storage with privacy-aware metadata
- **Cloudflare KV**: High-performance metadata and block storage
- **VDC Blockchain**: Immutable audit trail with dual signatures
- **Ethereum Anchoring**: Cross-chain verification

**Key Innovations:**
- **Zero-Knowledge Architecture**: Server never sees unencrypted user data
- **Post-Quantum Everything**: Client-side Kyber-768/Dilithium-2 PLUS Cloudflare's TLS 1.3 PQC
- **Privacy-Aware IPFS**: Conditional metadata disclosure based on user preference
- **Multi-Layer Defense**: Five storage tiers with encryption at rest and in transit

---

## Cloudflare Infrastructure Foundation

### Seamless Post-Quantum Cryptography

Veritas Documents is **powered by Cloudflare's Zero Trust infrastructure** with built-in post-quantum cryptography, providing defense-in-depth against quantum threats.

#### Transport Layer Security (TLS 1.3 + PQC)

**Every request to Veritas Documents is protected by Cloudflare's hybrid post-quantum TLS:**

- **Algorithm**: X25519Kyber768Draft00 (hybrid classical + PQC)
- **Deployment**: Automatic for all Cloudflare Workers traffic
- **Protection**: Zero configuration required—PQC enabled by default
- **Scope**: All API calls, asset uploads, user authentication

**What This Means:**
Even before application-layer encryption, all data transmitted to/from Veritas Documents is protected by quantum-resistant cryptography at the network level. An adversary recording encrypted traffic today cannot decrypt it even with a future quantum computer.

#### Cloudflare R2 Object Storage

**Durable, S3-compatible storage with global distribution:**

- **Zero Egress Fees**: No bandwidth charges for data retrieval
- **Automatic Encryption**: Data encrypted at rest by Cloudflare
- **High Availability**: 99.9% uptime SLA
- **Global Edge**: Low-latency access worldwide
- **Integration**: Native Workers binding for <1ms latency

**Security Model:**
R2 provides the foundational storage layer with automatic encryption at rest. Veritas Documents adds **application-layer Kyber-768 encryption** on top, creating a defense-in-depth model where data is encrypted twice: once by the application, once by Cloudflare infrastructure.

#### Cloudflare Workers KV

**Globally distributed key-value store:**

- **Edge Computing**: Data replicated to 300+ cities worldwide
- **Sub-Millisecond Reads**: Eventually consistent, blazing fast
- **Strong Consistency**: Write-after-read guaranteed for single keys
- **Massive Scale**: Billions of keys supported

**Use Cases in Veritas:**
- User account metadata (encrypted with system keys)
- Asset metadata (privacy-aware schemas)
- VDC blockchain blocks (publicly verifiable)
- Fast lookups for authentication and authorization

### Cloudflare's Zero Trust PQC Announcement

**Official Resources:**

**Blog Post**: [Post-Quantum Zero Trust](https://blog.cloudflare.com/post-quantum-zero-trust/)  
*"Cloudflare is the first major internet infrastructure provider to enable post-quantum cryptography by default for all customers."*

**Video Interview**: [Secure Your Future: Upgrade to Post-Quantum Cryptography with Zero Trust](https://cloudflare.tv/shows/security-week/secure-your-future-upgrade-to-post-quantum-cryptography-with-zero-trust/pgxbObal)  
*CTO and senior engineers discuss seamless PQC deployment across Cloudflare's global network.*

**Key Takeaways:**
- ✅ PQC enabled by default—no opt-in required
- ✅ Hybrid approach maintains backward compatibility
- ✅ Protection against "harvest now, decrypt later" attacks
- ✅ NIST-standardized algorithms (Kyber-768 in TLS)
- ✅ Zero performance impact for users

### Defense-in-Depth PQC Model

```
┌─────────────────────────────────────────────────────────┐
│              POST-QUANTUM PROTECTION LAYERS             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Layer 1: Client-Side Application Encryption            │
│  ├─ Kyber-768 (NIST FIPS 203)                          │
│  ├─ Dilithium-2 Signatures (NIST FIPS 204)             │
│  ├─ Ma'atara Protocol v0.2.3 (WASM)                    │
│  └─ Zero-knowledge: Server never sees plaintext         │
│                                                         │
│  Layer 2: Cloudflare TLS 1.3 + PQC (Automatic) ✨      │
│  ├─ X25519Kyber768Draft00                              │
│  ├─ Hybrid classical + post-quantum                    │
│  ├─ Enabled by default on all Workers                  │
│  └─ Protects data in transit                           │
│                                                         │
│  Layer 3: Cloudflare R2 Encryption at Rest             │
│  ├─ Automatic encryption by Cloudflare                 │
│  ├─ AES-256 encryption                                 │
│  ├─ Managed keys by Cloudflare                         │
│  └─ Transparent to application                         │
│                                                         │
│  Layer 4: IPFS Content Addressing                       │
│  ├─ Immutable content hashing                          │
│  ├─ Cryptographic integrity verification               │
│  ├─ Decentralized distribution                         │
│  └─ Privacy-aware metadata schemas                     │
│                                                         │
│  Layer 5: VDC Blockchain Signatures                     │
│  ├─ Dual Dilithium-2 signatures (user + system)       │
│  ├─ Immutable audit trail                              │
│  ├─ Merkle tree verification                           │
│  └─ Ethereum anchoring for cross-chain proof           │
│                                                         │
└─────────────────────────────────────────────────────────┘

🔒 RESULT: Military-grade quantum-resistant protection
           from browser to storage and back
```

---

## Multi-Tier Storage Architecture

Veritas Documents distributes data across **five storage tiers** to optimize for performance, durability, privacy, and verifiability:

### Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                     USER DOCUMENT                        │
│                 "Last Will and Testament"                │
└──────────────────────────────────────────────────────────┘
                          ↓
                 (Encrypted with Kyber-768)
                          ↓
         ┌────────────────┴────────────────┐
         │                                 │
    ┌────▼─────┐                     ┌────▼─────┐
    │ R2 (Primary)                   │ IPFS (Backup)
    │ • Encrypted document           │ • Encrypted document
    │ • Low latency                  │ • Decentralized
    │ • Durable                      │ • Verifiable
    └────┬─────┘                     └────┬─────┘
         │                                 │
         └────────────────┬────────────────┘
                          ↓
                    [Metadata]
                          ↓
         ┌────────────────┴────────────────┐
         │                                 │
    ┌────▼─────┐                     ┌────▼─────┐
    │ KV (Fast Access)               │ IPFS (Privacy-Aware)
    │ • Full metadata                │ • Minimal (private)
    │ • Owner only                   │ • Full (public)
    │ • Encrypted                    │ • User choice
    └────┬─────┘                     └────┬─────┘
         │                                 │
         └────────────────┬────────────────┘
                          ↓
                  [Blockchain Record]
                          ↓
                    ┌──────────┐
                    │ VDC Chain │
                    │ • Transaction
                    │ • Dual signatures
                    │ • Immutable
                    │ • IPFS-stored
                    └──────────┘
```

### Tier 1: Cloudflare R2 (Primary Storage)

**Purpose**: Durable, low-latency encrypted document storage

**What's Stored:**
- Encrypted document content (user Kyber-768)
- Encrypted pending transactions (system Kyber-768)
- Encrypted activation tokens (system Kyber-768)
- VDC blockchain blocks (public, no encryption needed)
- Backup copies of user/asset metadata

**Storage Paths:**
```
documents/{userId}/{assetId}.json          - User documents
pending_transactions/{txId}.json           - Pending VDC txs
activation_tokens/{token}.json             - User activation
blocks/{blockNumber}.json                  - VDC blocks (backup)
users/{userId}.json                        - User metadata (backup)
assets/{assetId}.json                      - Asset metadata (backup)
```

**Custom Metadata** (for encrypted objects):
```typescript
{
  assetId: string,
  userId: string,
  documentType: string,
  encryption_algorithm: "kyber768-aes256gcm",
  encryption_version: "1.0",
  encryption_source: "client" | "server" | "system",
  encryption_owner: string  // User ID or "system"
}
```

**Security:**
- Data encrypted at rest by Cloudflare (automatic)
- Application-layer Kyber-768 encryption (explicit)
- Access requires Workers authentication
- No public access—all requests authenticated

### Tier 2: IPFS via Pinata (Decentralized Storage)

**Purpose**: Decentralized backup and public verifiability with privacy

**What's Stored:**
- Encrypted document content (IPFS hash referenced in metadata)
- Privacy-aware asset metadata (conditional schema)
- VDC blockchain blocks (public verifiability)

**Privacy-Aware Metadata** (see detailed section below):
- **Private documents**: Minimal metadata (no identifying info)
- **Public documents**: Full metadata (searchable, discoverable)

**IPFS Characteristics:**
- ✅ **Immutable**: Content-addressed, cannot be changed
- ✅ **Decentralized**: Distributed across global IPFS network
- ✅ **Verifiable**: Cryptographic hash proves integrity
- ✅ **Public**: Anyone with hash can access (hence privacy-aware schemas)

**Pinata Integration:**
- Managed IPFS pinning service
- Guaranteed availability and fast retrieval
- Dedicated gateway: `gateway.pinata.cloud`
- Fallback to public gateways: `ipfs.io`, `cloudflare-ipfs.com`

### Tier 3: Cloudflare KV (Fast Metadata)

**Purpose**: High-speed global access to frequently queried data

**What's Stored:**
- User account metadata (encrypted with system keys)
- Asset metadata (full details for owner access)
- VDC blockchain blocks (fast verification)
- Pending transaction lists (references only)
- User asset ownership lists

**Storage Keys:**
```
user:{userId}                        - User account details
asset:{assetId}                      - Asset metadata
block:{blockNumber}                  - VDC blockchain block
user_assets:{userId}                 - Owned asset IDs
user_pending_assets:{userId}         - Pending payment assets
vdc_pending_transactions             - Pending tx list
vdc_pending_tx:{txId}                - Individual pending tx
stripe_session:{sessionId}           - Payment mapping
activation_token:{token}             - Legacy (being migrated)
```

**Encryption:**
- User metadata: Encrypted with system Kyber keys
- Asset metadata: Unencrypted (authorized access only)
- VDC blocks: Public (no encryption needed)

### Tier 4: VDC Blockchain (Immutable Audit Trail)

**Purpose**: Cryptographically verifiable transaction history

**What's Stored:**
- User registration transactions
- Asset creation transactions
- Ownership transfer transactions
- Payment confirmation transactions

**Block Structure:**
```typescript
{
  blockNumber: number,
  previousHash: string,
  timestamp: number,
  transactions: Transaction[],
  merkleRoot: string,
  nonce: number,
  hash: string,
  systemSignature: string,  // Dilithium-2
  minerAddress: string
}
```

**Transaction Structure:**
```typescript
{
  id: string,
  type: "user_registration" | "asset_creation" | "ownership_transfer",
  timestamp: number,
  data: object,
  signatures: {
    user: string,      // User Dilithium-2 signature
    system: string     // System Dilithium-2 signature
  }
}
```

**Storage:**
- **Primary**: IPFS (public verifiability)
- **Cache**: Cloudflare KV (fast access)
- **Backup**: Cloudflare R2 (durability)

### Tier 5: Ethereum (Cross-Chain Anchoring)

**Purpose**: External blockchain timestamping for legal proof

**What's Stored:**
- Merkle roots of VDC blocks
- Document hashes for temporal proof
- Cross-chain verification signatures

**Integration:**
- Ethereum mainnet for production assets
- Sepolia testnet for development
- Smart contract anchoring (future)
- Gas-efficient batch anchoring

---

## Core Principles

1. **Encryption First**: All sensitive data MUST be encrypted before storage
2. **Multi-Tier Redundancy**: Critical data stored in multiple tiers for durability
3. **Privacy by Design**: User-controlled disclosure with privacy-aware schemas
4. **Zero-Knowledge**: User data encrypted with user keys; system data encrypted with system keys
5. **Quantum Resistance**: Post-quantum cryptography at every layer

---

## IPFS Privacy-Aware Metadata

### Design Philosophy

IPFS is a **public, immutable** storage network. Any data uploaded to IPFS can be accessed by anyone who knows the IPFS hash. This creates a privacy requirement: metadata stored on IPFS must respect user privacy preferences.

Veritas Documents solves this with **conditional metadata schemas** based on the `isPubliclySearchable` flag.

### Private Document Metadata (isPubliclySearchable: false)

When a user creates a document **without** enabling public searchability (the default), the IPFS metadata contains only essential, non-identifying information:

```json
{
  "id": "asset_1759838146548_a7k9m3x",
  "ipfsHash": "QmZpkpJwfxQG3Hcah6neBRNfq4kSDWjHwar7gkMfHpkUSo",
  "createdAt": 1759838146549,
  "isPubliclySearchable": false,
  "ownerPublicKey": "kyber768_public_key_base64url_encoded",
  "creatorPublicKey": "kyber768_public_key_base64url_encoded"
}
```

**What's HIDDEN from public IPFS:**
- ❌ Document title
- ❌ Document description
- ❌ Document type (e.g., "will", "deed")
- ❌ Owner ID (UUID)
- ❌ Creator ID (UUID)
- ❌ Original filename
- ❌ Original content type
- ❌ Any custom metadata

**What's INCLUDED in public IPFS:**
- ✅ Asset ID (required for system operations)
- ✅ IPFS hash (link to encrypted document)
- ✅ Created timestamp (temporal metadata)
- ✅ Privacy flag
- ✅ Owner's Kyber public key (for verification, not personally identifiable)
- ✅ Creator's Kyber public key (for verification, not personally identifiable)

**Privacy Guarantee**: Public keys are cryptographically derived identifiers, not personal data under GDPR. They enable ownership verification without revealing user identity.

**Size**: ~250 bytes (43.9% smaller than public metadata)

### Public Document Metadata (isPubliclySearchable: true)

When a user **explicitly enables** public searchability, the IPFS metadata includes comprehensive information for discovery:

```json
{
  "id": "asset_1759838146548_a7k9m3x",
  "title": "Certificate of Authenticity",
  "description": "Digital artwork certificate",
  "documentType": "certificate",
  "ownerId": "0e9a60ff-6df9-4289-8d28-e6bca2f9085a",
  "creatorId": "0e9a60ff-6df9-4289-8d28-e6bca2f9085a",
  "ipfsHash": "QmZpkpJwfxQG3Hcah6neBRNfq4kSDWjHwar7gkMfHpkUSo",
  "createdAt": 1759838146549,
  "isPubliclySearchable": true,
  "publicMetadata": {
    "originalContentType": "application/pdf",
    "originalFilename": "certificate.pdf"
  }
}
```

**Size**: ~446 bytes

**Use Cases:**
- Public certificates and credentials
- Published legal notices
- Transferable NFT assets
- Publicly verifiable documents

**Important**: Even for public documents, the **encrypted document content** remains accessible only to those with the private key. IPFS metadata is public, but document content is still zero-knowledge.

### Where Complete Data is Stored

Even for private documents, the **complete asset record** (including title, description, etc.) is securely stored in:

1. **Cloudflare KV**: `asset:{assetId}` - Full metadata, requires authentication
2. **Cloudflare R2**: Backup storage, requires authorization
3. **VDC Blockchain**: Complete transaction details in cryptographically signed blocks

**Privacy Model Summary:**

| Data Element | Private IPFS | Public IPFS | KV (Private) | R2 (Private) | VDC Blockchain |
|--------------|--------------|-------------|--------------|--------------|----------------|
| Title | ❌ | ✅ | ✅ | ✅ | ✅ |
| Description | ❌ | ✅ | ✅ | ✅ | ✅ |
| Document Type | ❌ | ✅ | ✅ | ✅ | ✅ |
| User IDs | ❌ | ✅ | ✅ | ✅ | ✅ |
| Filename | ❌ | ✅ | ✅ | ✅ | ❌ |
| Public Keys | ✅ | ✅ | ✅ | ❌ | ✅ |
| IPFS Hash | ✅ | ✅ | ✅ | ✅ | ✅ |
| Encrypted Doc | ❌ | ❌ | ❌ | ✅ | ❌ |

### Metadata Generation Logic

```typescript
const isPublic = isPubliclySearchable === true;

const assetMetadata = isPublic ? {
  // PUBLIC metadata - full details for search and discovery
  id: assetId,
  title,
  description,
  documentType,
  ownerId: userId,
  creatorId: userId,
  ipfsHash: ipfsRecord?.hash,
  createdAt: Date.now(),
  isPubliclySearchable: true,
  publicMetadata: {
    originalContentType: contentType,
    originalFilename: filename
  }
} : {
  // PRIVATE metadata - minimal info, no identifying data
  id: assetId,
  ipfsHash: ipfsRecord?.hash,
  createdAt: Date.now(),
  isPubliclySearchable: false,
  ownerPublicKey: userKyberPublicKey,
  creatorPublicKey: userKyberPublicKey
};
```

### Verification

**To verify private document privacy:**

1. Create a document with `isPubliclySearchable: false`
2. Get the `ipfsMetadataHash` from the asset response
3. Access: `https://ipfs.io/ipfs/{metadataHash}`
4. **Confirm**: No title, description, or user IDs visible
5. **Confirm**: Only ID, hash, timestamp, and public keys present

**To verify owner can still access:**

1. Log in as document owner
2. Navigate to "My Documents"
3. **Confirm**: Full details visible (title, description, etc.)
4. **Confirm**: Can download and decrypt document

---

## Encryption and Security

### Cryptographic Primitives

**Kyber-768 (NIST FIPS 203)**
- Key Encapsulation Mechanism (KEM)
- Security Level: NIST Level 3 (equivalent to AES-192)
- Quantum Resistance: Secure against Shor's algorithm
- Key Size: Public key ~1,184 bytes, Private key ~2,400 bytes
- Use: Client-side document encryption + system-side metadata encryption

**Dilithium-2 (NIST FIPS 204)**
- Digital Signature Algorithm
- Security Level: NIST Level 2 (equivalent to AES-128)
- Quantum Resistance: Secure against quantum signature attacks
- Signature Size: ~2,420 bytes
- Use: User signatures, system signatures, dual-signature blocks

**Ma'atara Protocol v0.2.3**
- WebAssembly-based PQC toolkit
- Client-side execution in browser (zero-knowledge)
- Implements Kyber-768 and Dilithium-2
- Base64url string encoding for web compatibility

### Encryption Envelope Format

All encrypted payloads use the **Ma'atara Protocol envelope**:

```json
{
  "version": "1.0",
  "algorithm": "kyber768-aes256gcm",
  "kem_ct": "<base64url-encoded-kyber-ciphertext>",
  "iv": "<base64url-encoded-aes-iv>",
  "ciphertext": "<base64url-encoded-aes-ciphertext>"
}
```

**How it works:**
1. Generate random AES-256 key
2. Encrypt data with AES-256-GCM (authenticated encryption)
3. Encapsulate AES key using Kyber-768 KEM with recipient's public key
4. Package KEM ciphertext + IV + AES ciphertext together

**Decryption:**
1. Decapsulate KEM ciphertext using Kyber-768 private key → recovers AES key
2. Decrypt AES ciphertext using recovered key and IV
3. Verify authentication tag (GCM prevents tampering)

### Encryption Metadata (R2 Custom Metadata)

When storing encrypted objects in R2, custom metadata tracks encryption details:

```typescript
{
  assetId: string,
  userId: string,
  documentType: string,
  document_content_type: string,
  document_filename: string,
  encryption_algorithm: "kyber768-aes256gcm",
  encryption_version: "1.0",
  encryption_source: "client" | "server" | "system",
  encryption_owner: string  // User ID or "system"
}
```

**Encryption Source:**
- `client`: Document encrypted in browser before upload (preferred, zero-knowledge)
- `server`: Server encrypted with user's public key (fallback, still secure)
- `system`: Encrypted with system keys (for pending transactions, tokens)

### Zero-Knowledge Security Properties

1. **Private Key Non-Transmission**: User private keys generated in browser, never sent to server
2. **Client-Side Encryption**: Document content encrypted before leaving browser
3. **Proof-by-Decryption**: Ownership proven by successful decryption attempt
4. **Server Blindness**: Server never stores or processes unencrypted user documents
5. **Signature Verification**: Server verifies Dilithium signatures without accessing plaintext

---

## Storage Policies

Each data type has a **predefined storage policy** that specifies encryption requirements and storage tiers.

### Chain Blocks
```typescript
{
  tiers: ['kv', 'r2', 'ipfs'],
  encrypt: false,  // Publicly verifiable
  requireDualSignature: true
}
```

**Rationale**: VDC blocks must be publicly verifiable for blockchain integrity. They contain transaction hashes and signatures, not sensitive plaintext.

**Storage:**
- **KV**: Fast block retrieval for verification (~300+ edge locations)
- **R2**: Long-term archival with durability guarantees
- **IPFS**: Decentralized backup and public verifiability

### Pending Transactions
```typescript
{
  tiers: ['r2'],
  encrypt: true,
  encryptionKeyType: 'system'
}
```

**Rationale**: Pending transactions await mining and contain pre-finalized data. Encrypted with system keys to prevent unauthorized access before block mining.

**Storage:**
- **R2 Only**: Temporary state that becomes part of blockchain after mining
- **Encryption**: System Kyber-768 public key
- **Cleanup**: Removed from R2 after inclusion in mined block (still in blockchain)

### Documents (Asset Content)
```typescript
{
  tiers: ['r2', 'ipfs'],
  encrypt: true,
  encryptionKeyType: 'user'
}
```

**Rationale**: User documents must be encrypted end-to-end with user's private key for zero-knowledge security.

**Storage:**
- **R2**: Primary storage with low-latency access via Workers binding
- **IPFS**: Decentralized backup for content permanence
- **Encryption**: User's Kyber-768 public key (client-side preferred)
- **Zero-Knowledge**: Server never sees plaintext documents

### Activation Tokens
```typescript
{
  tiers: ['r2'],
  encrypt: true,
  encryptionKeyType: 'system'
}
```

**Rationale**: Activation tokens contain personal information (name, email) and temporary Dilithium keys before user completes activation.

**Storage:**
- **R2 Only**: Temporary data with 7-day expiry
- **Encryption**: System Kyber-768 public key
- **Cleanup**: Auto-deleted after user activation or expiry
- **Migration**: Legacy KV tokens being migrated to R2

### User Metadata
```typescript
{
  tiers: ['kv', 'r2'],
  encrypt: true,
  encryptionKeyType: 'system'
}
```

**Rationale**: User account details (email, name, public keys) need fast global access and encrypted backup.

**Storage:**
- **KV**: Fast user lookups for authentication (edge replicated)
- **R2**: Encrypted backup for disaster recovery
- **Encryption**: System Kyber-768 public key

### Asset Metadata
```typescript
{
  tiers: ['kv', 'r2', 'ipfs'],
  encrypt: false,  // Metadata is for authorized access
  ipfsPrivacyAware: true  // Privacy-aware schema for IPFS
}
```

**Rationale**: Asset metadata enables owner access to documents. Full metadata in KV/R2 requires authorization. IPFS metadata respects user privacy preference.

**Storage:**
- **KV**: Fast asset queries for dashboard and search
- **R2**: Backup storage for metadata
- **IPFS**: Privacy-aware metadata (minimal for private, full for public)
- **Access Control**: KV/R2 require authentication; IPFS public but privacy-aware

---

## Implementation Guide

### Storage Manager API

The `StorageManager` class provides unified storage operations across all tiers with automatic encryption enforcement.

#### Initialize Storage Manager

```typescript
import { StorageManager, STORAGE_POLICIES } from './utils/storage';

const manager = new StorageManager(env);
```

#### Store Encrypted Document

```typescript
const result = await manager.store(
  `documents/${userId}/${assetId}.json`,  // Storage key
  encryptedDocumentData,                  // Already encrypted by client
  STORAGE_POLICIES.document,              // Policy: R2 + IPFS
  userKyberPublicKey                      // For verification metadata
);

// Returns:
// {
//   success: true,
//   r2Key: "documents/user123/asset456.json",
//   ipfsHash: "QmXxx...",
//   ipfsGatewayUrl: "https://gateway.pinata.cloud/ipfs/QmXxx...",
//   encryption: {
//     algorithm: "kyber768-aes256gcm",
//     version: "1.0",
//     source: "client",
//     owner: "user123"
//   },
//   storedAt: 1728345678000
// }
```

#### Retrieve and Decrypt Document

```typescript
const stored = await manager.retrieve(
  `documents/${userId}/${assetId}.json`,
  STORAGE_POLICIES.document,
  userKyberPrivateKey  // Decryption key (zero-knowledge: never sent to server)
);

// Returns:
// {
//   data: { ... },  // Decrypted document content
//   metadata: {
//     key: "documents/user123/asset456.json",
//     storedAt: 1728345678000,
//     encryption: {
//       algorithm: "kyber768-aes256gcm",
//       version: "1.0",
//       source: "client",
//       owner: "user123"
//     },
//     r2Key: "documents/user123/asset456.json",
//     ipfsHash: "QmXxx..."
//   }
// }
```

### Convenience Functions

#### Store Chain Block

```typescript
import { storeChainBlock } from './utils/store';

const result = await storeChainBlock(env, blockNumber, block);

// Automatically:
// 1. Stores in KV for fast access
// 2. Archives in R2 for durability
// 3. Uploads to IPFS for decentralized backup
// 4. No encryption (publicly verifiable)
```

#### Store Pending Transaction

```typescript
import { storePendingTransaction } from './utils/store';

const result = await storePendingTransaction(env, txId, transaction);

// Automatically:
// 1. Encrypts with system Kyber public key
// 2. Stores in R2
// 3. Adds metadata for tracking
```

#### Store Document (User Asset)

```typescript
import { storeDocument } from './utils/store';

const result = await storeDocument(
  env,
  userId,
  assetId,
  encryptedDocumentData,  // Already encrypted client-side
  userKyberPublicKey      // For metadata only
);

// Automatically:
// 1. Stores encrypted document in R2
// 2. Uploads to IPFS (encrypted)
// 3. Creates privacy-aware IPFS metadata
// 4. Records encryption metadata in R2
```

#### Store Activation Token

```typescript
import { storeActivationToken } from './utils/store';

const result = await storeActivationToken(env, token, tokenData);

// Automatically:
// 1. Encrypts with system Kyber public key
// 2. Stores in R2
// 3. Sets 7-day expiry
```

### Privacy-Aware IPFS Upload

```typescript
import { createIPFSRecord } from './utils/ipfs';
import { IPFSClient } from './utils/ipfs';

const ipfsClient = new IPFSClient(env);

// Upload encrypted document
const documentRecord = await createIPFSRecord(
  ipfsClient,
  encryptedDocumentData,
  'application/json'
);

// Create privacy-aware metadata
const isPublic = isPubliclySearchable === true;

const metadata = isPublic ? {
  id: assetId,
  title,
  description,
  documentType,
  ownerId: userId,
  creatorId: userId,
  ipfsHash: documentRecord.hash,
  createdAt: Date.now(),
  isPubliclySearchable: true,
  publicMetadata: { originalContentType, originalFilename }
} : {
  id: assetId,
  ipfsHash: documentRecord.hash,
  createdAt: Date.now(),
  isPubliclySearchable: false,
  ownerPublicKey: userKyberPublicKey,
  creatorPublicKey: userKyberPublicKey
};

// Upload metadata to IPFS
const metadataRecord = await createIPFSRecord(
  ipfsClient,
  JSON.stringify(metadata),
  'application/json'
);

// Warm Cloudflare gateway for fast access
ipfsClient.warmGateway(metadataRecord.hash, 'cloudflare', 5000);
```

---

## Legal and Compliance

### GDPR Compliance (EU Regulation 2016/679)

**Article 5 (Data Minimization)**
- ✅ Private documents: Only minimal, non-identifying metadata in public IPFS
- ✅ Public keys not considered personal data under GDPR
- ✅ User IDs excluded from public IPFS metadata for private documents

**Article 6 (Lawful Basis)**
- ✅ User consent for public disclosure (explicit opt-in checkbox)
- ✅ Legitimate interest for system operation (asset IDs, timestamps)

**Article 17 (Right to Erasure)**
- ℹ️ IPFS immutable; users informed during onboarding
- ✅ Complete metadata removable from KV/R2 private storage
- ✅ Blockchain records serve legitimate legal archival purpose

**Article 25 (Data Protection by Design)**
- ✅ Private mode is default (`isPubliclySearchable: false`)
- ✅ Public disclosure requires explicit user action
- ✅ Multiple storage layers provide defense-in-depth

**Article 32 (Security of Processing)**
- ✅ Post-quantum cryptography (Kyber-768 + Dilithium-2)
- ✅ Encryption at rest (R2 automatic + application-layer)
- ✅ Encryption in transit (TLS 1.3 + PQC hybrid via Cloudflare)
- ✅ Zero-knowledge architecture (server never sees plaintext)

### eIDAS Regulation (EU Regulation 910/2014)

**Electronic Signatures:**
- ✅ Dilithium-2 digital signatures (NIST FIPS 204)
- ✅ Qualified electronic signatures possible (user private key control)
- ✅ Long-term signature validity (quantum-resistant)

**Trust Services:**
- ✅ Timestamping via blockchain anchoring
- ✅ Electronic document preservation
- ✅ Certificate services (public document metadata)

### US Compliance

**UETA (Uniform Electronic Transactions Act)**
- ✅ Electronic records admissible
- ✅ Digital signatures legally binding (Dilithium-2)
- ✅ Integrity verification via blockchain

**ESIGN Act (15 U.S.C. §§ 7001-7006)**
- ✅ Electronic signatures valid for legal documents
- ✅ Consent to electronic records (user onboarding)
- ✅ Record retention (blockchain + IPFS immutability)

### International Standards

**NIST Post-Quantum Cryptography**
- ✅ FIPS 203 (Kyber-768) for encryption
- ✅ FIPS 204 (Dilithium-2) for signatures
- ✅ Standards-based implementation (Ma'atara Protocol)

**UNCITRAL Model Law**
- ✅ Electronic signatures recognized
- ✅ Data message integrity
- ✅ Original document equivalence

---

## Verification and Audit

### IPFS Metadata Privacy Verification

**Test Private Document:**
```bash
# 1. Create asset with isPubliclySearchable: false
curl -X POST https://veritas-docs.example/api/web3-assets/create-web3 \
  -H "Content-Type: application/json" \
  -d '{"userId":"user123","title":"Private Will","isPubliclySearchable":false,...}'

# 2. Extract ipfsMetadataHash from response
# Example: QmXxxYyyZzz...

# 3. Access IPFS metadata via public gateway
curl https://ipfs.io/ipfs/QmXxxYyyZzz...

# 4. Verify output contains ONLY:
# - id (asset ID)
# - ipfsHash
# - createdAt (timestamp)
# - isPubliclySearchable: false
# - ownerPublicKey
# - creatorPublicKey

# 5. Verify NO title, description, user IDs, or filename present
```

**Test Public Document:**
```bash
# 1. Create asset with isPubliclySearchable: true
# 2. Access IPFS metadata
# 3. Verify full metadata present (title, description, etc.)
```

### Encryption Verification

**Verify R2 Encryption:**
```typescript
const verification = await manager.verifyEncryption(
  `documents/${userId}/${assetId}.json`
);

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

### Blockchain Verification

**Verify VDC Transaction:**
```bash
# 1. Get block number from asset record
# 2. Retrieve block from VDC blockchain
curl https://veritas-docs.example/api/vdc/blocks/5

# 3. Verify dual signatures:
#    - User Dilithium signature
#    - System Dilithium signature
# 4. Verify transaction inclusion
# 5. Verify merkle root
```

### Cloudflare TLS PQC Verification

**Check TLS Connection:**
```bash
# 1. Connect to Veritas Documents endpoint
# 2. Check TLS cipher suite
openssl s_client -connect veritas-docs.example:443 -showcerts

# 3. Look for "TLS_AES_256_GCM_SHA384" or similar
# 4. Verify Cloudflare's hybrid PQC is active (X25519Kyber768)
```

---

## Data Flow Examples

### 1. User Creates Private Document

```
Client (Browser)
  ↓ 1. Generate Kyber-768 + Dilithium-2 keypair (if first time)
  ↓ 2. Encrypt document with Kyber-768 public key (Ma'atara WASM)
  ↓ 3. Sign encrypted data with Dilithium-2 private key
  ↓ 4. Send to server via TLS 1.3 + PQC (Cloudflare automatic)
  ↓
Server (Cloudflare Worker)
  ↓ 5. Validate Dilithium signature
  ↓ 6. Store encrypted document in R2
  ↓ 7. Upload encrypted document to IPFS
  ↓ 8. Create MINIMAL metadata (no title, description, user IDs)
  ↓ 9. Upload minimal metadata to IPFS
  ↓ 10. Store FULL metadata in KV (requires auth to access)
  ↓ 11. Create Stripe checkout session ($25)
  ↓
User Completes Payment
  ↓ 12. Stripe webhook triggers
  ↓ 13. Create VDC transaction (dual signatures)
  ↓ 14. Queue for blockchain mining
  ↓
Admin Mines Block
  ↓ 15. Retrieve pending transactions
  ↓ 16. Create block with system signature
  ↓ 17. Store block in KV + R2 + IPFS
  ↓ 18. Update asset with block number
  ↓
Asset Permanently Registered ✅
```

### 2. User Accesses Own Private Document

```
Client (Browser)
  ↓ 1. User logs in with Dilithium signature
  ↓ 2. Request asset details from server
  ↓
Server (Cloudflare Worker)
  ↓ 3. Verify Dilithium signature (ownership proof)
  ↓ 4. Retrieve FULL metadata from KV (includes title, description)
  ↓ 5. Return asset details to client
  ↓
Client
  ↓ 6. Display full asset information
  ↓ 7. User clicks "Download"
  ↓ 8. Fetch encrypted document from R2 or IPFS
  ↓ 9. Decrypt with Kyber-768 private key (client-side, zero-knowledge)
  ↓ 10. Display or download plaintext document
```

### 3. Public User Searches Documents

```
Public User
  ↓ 1. Search query via public search API
  ↓
Server
  ↓ 2. Query KV for assets with isPubliclySearchable: true
  ↓ 3. Return public metadata (title, description, etc.)
  ↓
Public User
  ↓ 4. View public metadata
  ↓ 5. CANNOT decrypt document content (no private key)
  ↓ 6. Can verify IPFS metadata matches KV metadata
  ↓ 7. Can verify blockchain transaction signatures
```

---

## Security Guarantees

### Encryption Enforcement

1. **Policy Validation**: `StorageManager` throws error if policy requires encryption but no key provided
2. **Automatic Decryption**: Retrieval methods auto-decrypt when policy indicates encryption
3. **Metadata Tracking**: Every storage operation records encryption metadata in R2 custom metadata
4. **Verification Tools**: `verifyEncryption()` confirms encryption status before and after storage

### Zero-Knowledge Properties

1. **Private Key Non-Transmission**: User private keys generated in browser, never sent to server
2. **Client-Side Encryption**: All document encryption performed in browser via WASM
3. **Proof-by-Decryption**: Ownership proven by successful decryption, not password/credential
4. **Server Blindness**: Server never stores or processes unencrypted user documents
5. **Signature Verification**: Server verifies Dilithium signatures without accessing plaintext

### Multi-Layer Defense

| Threat | Mitigation Layer 1 | Mitigation Layer 2 | Mitigation Layer 3 |
|--------|-------------------|-------------------|-------------------|
| Quantum Computer | Kyber-768 app encryption | Cloudflare TLS 1.3 PQC | Dilithium-2 signatures |
| Network Sniffing | TLS 1.3 encryption | Cloudflare's global edge | End-to-end app encryption |
| Server Compromise | Zero-knowledge (no plaintext) | R2 encryption at rest | User-key encryption |
| IPFS Privacy Leak | Privacy-aware metadata | Encrypted document content | Public key obfuscation |
| Signature Forgery | Dilithium-2 (quantum-resistant) | Dual signatures (user + system) | Blockchain immutability |

---

## Future Enhancements

- [ ] **Automatic Migration**: Scan KV for legacy/unencrypted data and migrate to R2
- [ ] **Retention Policies**: Auto-delete expired activation tokens from R2
- [ ] **IPFS Pinning Status**: Real-time tracking and alerting for pin failures
- [ ] **Storage Metrics**: Cost analysis and usage dashboards per tier
- [ ] **Encryption Key Rotation**: Support user key rotation without data loss
- [ ] **Multi-Region R2**: Geo-replication for compliance (EU data residency)
- [ ] **Smart Contract Anchoring**: Automated Ethereum anchoring with Chainlink oracles
- [ ] **Metadata Search Indexing**: Algolia/Elasticsearch integration for public assets

---

## References

### Cloudflare Resources

**Post-Quantum Cryptography:**
- [Post-Quantum Zero Trust (Blog Post)](https://blog.cloudflare.com/post-quantum-zero-trust/)
- [Security Week: PQC Upgrade with Zero Trust (Video)](https://cloudflare.tv/shows/security-week/secure-your-future-upgrade-to-post-quantum-cryptography-with-zero-trust/pgxbObal)
- Cloudflare TLS 1.3 Hybrid PQC Documentation

**Infrastructure:**
- Cloudflare R2 Documentation
- Cloudflare Workers KV Documentation
- Cloudflare Workers Platform

### NIST Standards

- **FIPS 203**: Module-Lattice-Based Key-Encapsulation Mechanism (Kyber)
- **FIPS 204**: Module-Lattice-Based Digital Signature Algorithm (Dilithium)
- NIST Post-Quantum Cryptography Project

### Legal Frameworks

- **GDPR**: EU Regulation 2016/679 (General Data Protection Regulation)
- **eIDAS**: EU Regulation 910/2014 (Electronic Identification and Trust Services)
- **UETA**: Uniform Electronic Transactions Act
- **ESIGN**: Electronic Signatures in Global and National Commerce Act (15 U.S.C. §§ 7001-7006)
- **UNCITRAL**: Model Law on Electronic Signatures

### Technical Standards

- IPFS Specification: https://docs.ipfs.tech
- Ma'atara Protocol Documentation (Internal)
- WebAssembly Specification: https://webassembly.org

---

## Related Documentation

- **[Zero-Knowledge Architecture](./ZERO_KNOWLEDGE_ARCHITECTURE.md)** - Detailed zero-knowledge security model
- **[Blockchain Architecture](./BLOCKCHAIN_ARCHITECTURE.md)** - VDC blockchain design and dual signatures
- **[VDC Integration Guide](./VDC_INTEGRATION_GUIDE.md)** - Working with VDC blockchain API
- **[IPFS Privacy Reference](./IPFS_PRIVACY_REFERENCE.md)** - Quick reference for privacy-aware metadata
- **[Security Guardrails](./SECURITY_GUARDRAILS.md)** - User warnings and key management best practices

---

**Document Control:**
- Version: 2.0.0
- Effective Date: October 7, 2025
- Review Cycle: Quarterly
- Next Review: January 7, 2026
- Maintainer: Veritas Documents Technical Team
- Classification: Public

**Contact:**
- Technical Inquiries: tech@veritasdocs.com
- Security Inquiries: security@veritasdocs.com
- Legal Inquiries: legal@veritasdocs.com
- Research Collaboration: research@veritasdocs.com

---

*This document is maintained as part of the Veritas Documents open documentation initiative to promote transparency, academic research, legal technology innovation, and post-quantum cryptography adoption.*
