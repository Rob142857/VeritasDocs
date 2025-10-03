# Veritas Documents Blockchain Architecture

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production

---

## 📋 Table of Contents

1. [Architecture Decision: Single Master Chain](#architecture-decision-single-master-chain-vs-per-user-chains)
2. [VDC Blockchain Implementation](#vdc-blockchain-implementation)
3. [Transaction Types](#transaction-types)
4. [Dual Signature System](#dual-signature-system)
5. [Block Structure](#block-structure)
6. [IPFS Integration](#ipfs-integration)
7. [Verification & Security](#verification--security)

---

## 🏗️ Architecture Decision: Single Master Chain vs Per-User Chains

### ✅ RECOMMENDED: Single Master Chain (Your Design)

```
VERITAS MASTER CHAIN
┌────────────────────────────────────────────────────────────────┐
│ Block 0: Genesis                                                │
│ - Signed by: System Master Key                                  │
│ - Contains: Chain initialization, version, timestamp            │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│ Block 1: User Registrations                                     │
│ ├─ TX 1: User Alice registers                                   │
│ │  - Signed by: Alice's Dilithium key + System Master Key      │
│ │  - Data: Alice's public keys, encrypted personal data         │
│ ├─ TX 2: User Bob registers                                     │
│ │  - Signed by: Bob's Dilithium key + System Master Key        │
│ │  - Data: Bob's public keys, encrypted personal data           │
│ └─ TX 3: User Charlie registers                                 │
│    - Signed by: Charlie's Dilithium key + System Master Key    │
│    - Data: Charlie's public keys, encrypted personal data       │
│                                                                  │
│ Block Signature: System Master Dilithium Key                    │
│ IPFS Hash: QmXxxx...                                            │
└────────────────────────────────────────────────────────────────┘
                            ↓
┌────────────────────────────────────────────────────────────────┐
│ Block 2: Document Creations                                     │
│ ├─ TX 4: Alice creates legal contract                          │
│ │  - Signed by: Alice's Dilithium key + System Master Key      │
│ │  - Data: Document hash, IPFS hash, metadata                   │
│ ├─ TX 5: Bob creates will                                       │
│ │  - Signed by: Bob's Dilithium key + System Master Key        │
│ │  - Data: Document hash, IPFS hash, metadata                   │
│ └─ TX 6: Alice transfers contract to Charlie                    │
│    - Signed by: Alice's Dilithium key + System Master Key      │
│    - Data: Asset transfer, from/to, timestamp                   │
│                                                                  │
│ Block Signature: System Master Dilithium Key                    │
│ IPFS Hash: QmYyyy...                                            │
└────────────────────────────────────────────────────────────────┘
                            ↓
                          [...]
```

### Why Single Master Chain is BETTER

#### ✅ **1. True Blockchain Properties**

- **Chain Integrity**: Each block links to previous block
- **Merkle Proofs**: Can prove transaction exists in block
- **Global Ordering**: Clear timeline of all events
- **Immutable History**: Cannot rewrite past blocks
- **Consensus**: Can implement validation rules

#### ✅ **2. Legal & Audit Benefits**

- **Court-Admissible**: Single authoritative source of truth
- **Chronological Proof**: "Document A existed before Document B"
- **Third-Party Verification**: Anyone can verify chain integrity
- **Regulatory Compliance**: Complete audit trail
- **Timestamp Proof**: Cryptographic proof of "when"

#### ✅ **3. Scalability & Efficiency**

- **Fewer Chains**: One chain vs thousands of user chains
- **Easier Indexing**: Single chain to search
- **Simpler Storage**: One IPFS pinset vs many
- **Lower Costs**: Single chain validation
- **Better Performance**: No cross-chain lookups

#### ✅ **4. Security Benefits**

- **Double Signatures**: User + System validates legitimacy
- **System Validation**: Master key proves server approved transaction
- **Fraud Prevention**: Malicious transactions rejected before block creation
- **Access Control**: System key gates what enters chain
- **Key Rotation**: Can rotate system key without breaking user keys

#### ✅ **5. Document Use Cases**

- **Asset Transfers**: Clear chain of custody
- **Ownership Disputes**: Blockchain proves current owner
- **Version History**: All document updates in one place
- **Multi-Party Documents**: Multiple users signing same document
- **Notarization**: System signature = notary stamp

### ❌ Per-User Chains (Rejected)

```
Alice's Chain          Bob's Chain           Charlie's Chain
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Alice Block 1│      │ Bob Block 1  │      │Charlie Block1│
│ - User reg   │      │ - User reg   │      │ - User reg   │
└──────────────┘      └──────────────┘      └──────────────┘
      ↓                      ↓                      ↓
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│ Alice Block 2│      │ Bob Block 2  │      │Charlie Block2│
│ - Create doc │      │ - Create doc │      │ - Receive doc│
└──────────────┘      └──────────────┘      └──────────────┘
```

**Problems:**
- ❌ No global ordering (which doc came first?)
- ❌ Cross-chain transfers are complex
- ❌ No single source of truth
- ❌ Hard to prove document authenticity
- ❌ Synchronization nightmares
- ❌ Each chain needs separate validation
- ❌ Difficult for courts/auditors

---

## Implementation: Dual-Signature System

### Transaction Structure

```typescript
interface VeritasTransaction {
  // Transaction metadata
  id: string;
  type: 'user_registration' | 'document_creation' | 'asset_transfer' | 'admin_action';
  timestamp: number;
  
  // Transaction data (encrypted if sensitive)
  data: {
    // For user registration
    userId?: string;
    email?: string;
    kyberPublicKey?: string;
    dilithiumPublicKey?: string;
    encryptedPersonalData?: KyberCiphertext;
    accountType?: 'admin' | 'paid' | 'invited';
    
    // For document creation
    documentId?: string;
    documentHash?: string;
    ipfsHash?: string;
    metadata?: any;
    
    // For asset transfer
    assetId?: string;
    fromUserId?: string;
    toUserId?: string;
  };
  
  // DUAL SIGNATURES (key innovation!)
  signatures: {
    // User signature: Proves user created/approved this transaction
    user: {
      publicKey: string;  // User's Dilithium public key
      signature: string;  // User's Dilithium signature
    };
    
    // System signature: Proves platform validated/approved this transaction
    system: {
      publicKey: string;  // System's Dilithium public key (from Cloudflare secret)
      signature: string;  // System's Dilithium signature
    };
  };
}
```

### Block Structure

```typescript
interface VeritasBlock {
  // Block metadata
  blockNumber: number;
  timestamp: number;
  previousHash: string;  // Links to previous block
  hash: string;          // This block's hash
  
  // Block contents
  transactions: VeritasTransaction[];
  merkleRoot: string;    // Merkle root of transactions
  
  // Block signature
  blockSignature: {
    publicKey: string;   // System Master Dilithium key
    signature: string;   // System Master Dilithium signature
  };
  
  // IPFS storage
  ipfsHash?: string;     // Where this block is permanently stored
}
```

### Why Dual Signatures?

```
USER CREATES TRANSACTION
        ↓
User signs with their Dilithium private key
        ↓
Transaction sent to server
        ↓
SERVER VALIDATES TRANSACTION
├─ Verify user signature (proves user created it)
├─ Verify user permissions (is this allowed?)
├─ Verify data integrity (is data valid?)
└─ Check business rules (does it make sense?)
        ↓
If valid: SERVER SIGNS TRANSACTION
        ↓
Server signs with System Master Dilithium key
        ↓
Transaction added to pending pool
        ↓
When enough transactions: CREATE BLOCK
        ↓
Server signs entire block with System Master key
        ↓
Block stored in IPFS and pinned
```

**Security Benefits:**

1. **User Signature**: Proves user authorized the action (non-repudiation)
2. **System Signature**: Proves platform validated it (legitimacy)
3. **Both Required**: Cannot fake transactions without both keys
4. **Audit Trail**: Can see exactly who approved what and when

---

## Cloudflare Secret: System Master Keys

### Setup System Keys

```typescript
// Generate system master keys (run once, securely)
const systemKeys = await generateSystemMasterKeys();

// Store in Cloudflare Secrets (NOT in KV!)
{
  SYSTEM_KYBER_PRIVATE_KEY: "...",      // For encrypting system data
  SYSTEM_KYBER_PUBLIC_KEY: "...",       // Public, can be in code
  SYSTEM_DILITHIUM_PRIVATE_KEY: "...",  // For signing transactions/blocks
  SYSTEM_DILITHIUM_PUBLIC_KEY: "..."    // Public, can be in code
}
```

### Security Rules

```typescript
// ✅ GOOD: Secrets in Cloudflare
wrangler secret put SYSTEM_DILITHIUM_PRIVATE_KEY

// ❌ BAD: Keys in code
const systemKey = "hardcoded-private-key";  // NEVER DO THIS!

// ❌ BAD: Keys in KV
await env.VERITAS_KV.put("system-key", privateKey);  // NEVER DO THIS!

// ❌ BAD: Keys in environment variables in wrangler.toml
[vars]
SYSTEM_KEY = "..."  // NEVER DO THIS!
```

### Key Rotation Strategy

```typescript
// System keys should be rotatable
interface SystemKeyVersion {
  version: number;
  dilithiumPublicKey: string;
  validFrom: number;
  validUntil: number | null;  // null = current key
}

// Block signed with key version
interface BlockSignature {
  keyVersion: number;
  publicKey: string;
  signature: string;
}

// Can verify old blocks with old public keys
// Can sign new blocks with new private key
```

---

## Transaction Flow Examples

### Example 1: User Registration

```typescript
// 1. CLIENT: User fills activation form
const personalData = {
  email: "alice@example.com",
  fullName: "Alice Smith",
  dateOfBirth: "1990-01-01",
  address: "123 Main St"
};

// 2. CLIENT: Generate user keys
const userKeys = await generateUserKeys();
// - kyberPublicKey, kyberPrivateKey
// - dilithiumPublicKey, dilithiumPrivateKey

// 3. CLIENT: Encrypt personal data with user's own Kyber key
const encryptedData = await kyberEncrypt(personalData, userKeys.kyberPublicKey);

// 4. CLIENT: Create transaction
const txData = {
  userId: "user_20251003_123456",
  email: "alice@example.com",
  kyberPublicKey: userKeys.kyberPublicKey,
  dilithiumPublicKey: userKeys.dilithiumPublicKey,
  encryptedPersonalData: encryptedData,
  accountType: "invited",  // From invite link
  timestamp: Date.now()
};

// 5. CLIENT: Sign transaction with user's Dilithium key
const userSignature = await dilithiumSign(txData, userKeys.dilithiumPrivateKey);

// 6. CLIENT: Send to server
POST /api/auth/activate
{
  token: "...",
  txData: txData,
  userSignature: userSignature
}

// 7. SERVER: Verify user signature
const isValid = await dilithiumVerify(txData, userSignature, txData.dilithiumPublicKey);
if (!isValid) throw new Error("Invalid user signature");

// 8. SERVER: Sign with system key
const systemPrivateKey = env.SYSTEM_DILITHIUM_PRIVATE_KEY;
const systemSignature = await dilithiumSign(txData, systemPrivateKey);

// 9. SERVER: Create blockchain transaction
const transaction: VeritasTransaction = {
  id: `tx_${Date.now()}_${randomId()}`,
  type: 'user_registration',
  timestamp: Date.now(),
  data: txData,
  signatures: {
    user: {
      publicKey: txData.dilithiumPublicKey,
      signature: userSignature
    },
    system: {
      publicKey: env.SYSTEM_DILITHIUM_PUBLIC_KEY,
      signature: systemSignature
    }
  }
};

// 10. SERVER: Add to pending transaction pool
await addToPendingPool(transaction);

// 11. SERVER: When enough transactions, create block
if (pendingPool.length >= 10) {
  await mineBlock();
}
```

### Example 2: Document Creation

```typescript
// 1. CLIENT: User uploads document
const documentFile = getFileFromInput();
const documentData = await documentFile.arrayBuffer();

// 2. CLIENT: Hash document for integrity
const documentHash = await sha256(documentData);

// 3. CLIENT: Encrypt document with recipient's public key
const recipientKyberKey = await lookupUserPublicKey(recipientEmail);
const encryptedDoc = await kyberEncrypt(documentData, recipientKyberKey);

// 4. CLIENT: Upload to IPFS
const ipfsHash = await uploadToIPFS(encryptedDoc);

// 5. CLIENT: Create transaction
const txData = {
  documentId: `doc_${Date.now()}`,
  documentHash: documentHash,
  ipfsHash: ipfsHash,
  metadata: {
    title: "Legal Contract",
    documentType: "contract",
    recipientEmail: "bob@example.com",
    createdBy: currentUser.userId
  },
  timestamp: Date.now()
};

// 6. CLIENT: Sign with user's Dilithium key
const userSignature = await dilithiumSign(txData, userKeys.dilithiumPrivateKey);

// 7. CLIENT: Send to server
POST /api/documents/create
{
  txData: txData,
  userSignature: userSignature
}

// 8. SERVER: Verify user signature
// 9. SERVER: Verify user has permission to create documents
// 10. SERVER: Verify IPFS hash exists
// 11. SERVER: Sign with system key
// 12. SERVER: Add to blockchain pending pool
```

### Example 3: Asset Transfer

```typescript
// 1. CLIENT: User initiates transfer
const transferData = {
  assetId: "doc_1696348800000",
  fromUserId: currentUser.userId,
  toUserId: recipientUser.userId,
  timestamp: Date.now()
};

// 2. CLIENT: Sign transfer
const userSignature = await dilithiumSign(transferData, userKeys.dilithiumPrivateKey);

// 3. SERVER: Verify user signature
// 4. SERVER: Verify user owns the asset (check blockchain)
// 5. SERVER: Verify recipient exists
// 6. SERVER: Sign with system key (validates transfer)
// 7. SERVER: Add to blockchain

// Result: Clear chain of custody in blockchain
```

---

## Block Mining Strategy

### When to Create Blocks

```typescript
// Option 1: Time-based (every N minutes)
if (Date.now() - lastBlockTime >= 5 * 60 * 1000) {  // 5 minutes
  await mineBlock();
}

// Option 2: Transaction-based (every N transactions)
if (pendingPool.length >= 10) {
  await mineBlock();
}

// Option 3: Hybrid (whichever comes first)
if (pendingPool.length >= 10 || Date.now() - lastBlockTime >= 5 * 60 * 1000) {
  await mineBlock();
}

// Option 4: Critical transaction (immediate)
if (transaction.type === 'admin_action') {
  await mineBlock();  // Mine immediately for critical operations
}
```

### Block Creation Process

```typescript
async function mineBlock(env: Environment): Promise<VeritasBlock> {
  // 1. Get pending transactions
  const transactions = await getPendingTransactions();
  
  if (transactions.length === 0) {
    throw new Error("No transactions to mine");
  }
  
  // 2. Get previous block
  const previousBlock = await getLatestBlock();
  
  // 3. Calculate Merkle root
  const merkleRoot = calculateMerkleRoot(transactions);
  
  // 4. Create block
  const block: VeritasBlock = {
    blockNumber: previousBlock.blockNumber + 1,
    timestamp: Date.now(),
    previousHash: previousBlock.hash,
    hash: "",  // Will be calculated
    transactions: transactions,
    merkleRoot: merkleRoot,
    blockSignature: {
      publicKey: env.SYSTEM_DILITHIUM_PUBLIC_KEY,
      signature: ""  // Will be calculated
    }
  };
  
  // 5. Calculate block hash
  block.hash = await calculateBlockHash(block);
  
  // 6. Sign block with system master key
  const blockDataToSign = {
    blockNumber: block.blockNumber,
    timestamp: block.timestamp,
    previousHash: block.previousHash,
    hash: block.hash,
    merkleRoot: block.merkleRoot
  };
  
  block.blockSignature.signature = await dilithiumSign(
    blockDataToSign,
    env.SYSTEM_DILITHIUM_PRIVATE_KEY
  );
  
  // 7. Upload to IPFS
  const ipfsHash = await uploadBlockToIPFS(block);
  block.ipfsHash = ipfsHash;
  
  // 8. Store block metadata in KV
  await env.VERITAS_KV.put(
    `blockchain:block:${block.blockNumber}`,
    JSON.stringify({ ipfsHash, hash: block.hash, timestamp: block.timestamp })
  );
  
  // 9. Update latest block pointer
  await env.VERITAS_KV.put(
    `blockchain:latest`,
    JSON.stringify({ blockNumber: block.blockNumber, hash: block.hash })
  );
  
  // 10. Clear pending transactions
  await clearPendingTransactions();
  
  return block;
}
```

---

## Storage Architecture

### Data Flow

```
USER TRANSACTION
      ↓
PENDING POOL (KV: blockchain:pending:{txId})
      ↓
BLOCK MINING (accumulate transactions)
      ↓
BLOCK CREATION (with system signature)
      ↓
IPFS STORAGE (permanent, immutable)
      ↓
KV INDEX (block number → IPFS hash)
      ↓
PINNING (ensure availability)
```

### KV Storage Keys

```typescript
// Blockchain state
"blockchain:latest"                    → { blockNumber, hash, ipfsHash }
"blockchain:genesis"                   → Genesis block data
"blockchain:block:{blockNumber}"       → { ipfsHash, hash, timestamp }

// Pending transactions
"blockchain:pending:{txId}"            → Transaction data
"blockchain:pending:count"             → Number of pending transactions

// Indexes for fast lookup
"blockchain:tx:{txId}"                 → { blockNumber, ipfsHash }
"blockchain:user:{userId}:txs"         → List of transaction IDs
"blockchain:document:{docId}:txs"      → List of transaction IDs

// User records (reference blockchain)
"user:{userId}"                        → { id, email, blockchainTxId, ... }
"user:email:{email}"                   → userId

// System state
"system:master:public-key"             → System Dilithium public key (current version)
"system:master:key-versions"           → Historical public keys for verification
```

### IPFS Storage

```typescript
// Block stored as JSON in IPFS
{
  blockNumber: 42,
  timestamp: 1696348800000,
  previousHash: "abc123...",
  hash: "def456...",
  transactions: [...],
  merkleRoot: "ghi789...",
  blockSignature: {
    publicKey: "...",
    signature: "..."
  }
}

// Pinning strategy
1. Upload block to IPFS
2. Pin via Pinata/Web3.Storage
3. Store IPFS hash in KV
4. Reference in next block (chain IPFS hashes together)
```

---

## Verification & Validation

### Verify Transaction

```typescript
async function verifyTransaction(tx: VeritasTransaction): Promise<boolean> {
  // 1. Verify user signature
  const userSigValid = await dilithiumVerify(
    tx.data,
    tx.signatures.user.signature,
    tx.signatures.user.publicKey
  );
  
  if (!userSigValid) {
    return false;
  }
  
  // 2. Verify system signature
  const systemSigValid = await dilithiumVerify(
    tx.data,
    tx.signatures.system.signature,
    tx.signatures.system.publicKey
  );
  
  if (!systemSigValid) {
    return false;
  }
  
  // 3. Both signatures must be valid
  return true;
}
```

### Verify Block

```typescript
async function verifyBlock(block: VeritasBlock): Promise<boolean> {
  // 1. Verify block hash
  const calculatedHash = await calculateBlockHash(block);
  if (calculatedHash !== block.hash) {
    return false;
  }
  
  // 2. Verify merkle root
  const calculatedMerkleRoot = calculateMerkleRoot(block.transactions);
  if (calculatedMerkleRoot !== block.merkleRoot) {
    return false;
  }
  
  // 3. Verify block signature
  const blockDataToVerify = {
    blockNumber: block.blockNumber,
    timestamp: block.timestamp,
    previousHash: block.previousHash,
    hash: block.hash,
    merkleRoot: block.merkleRoot
  };
  
  const blockSigValid = await dilithiumVerify(
    blockDataToVerify,
    block.blockSignature.signature,
    block.blockSignature.publicKey
  );
  
  if (!blockSigValid) {
    return false;
  }
  
  // 4. Verify all transactions
  for (const tx of block.transactions) {
    if (!(await verifyTransaction(tx))) {
      return false;
    }
  }
  
  return true;
}
```

### Verify Chain

```typescript
async function verifyChain(): Promise<boolean> {
  const latest = await getLatestBlock();
  
  for (let i = 1; i <= latest.blockNumber; i++) {
    const block = await getBlock(i);
    const previousBlock = await getBlock(i - 1);
    
    // Verify block internally
    if (!(await verifyBlock(block))) {
      return false;
    }
    
    // Verify chain linkage
    if (block.previousHash !== previousBlock.hash) {
      return false;
    }
  }
  
  return true;
}
```

---

## Summary: Why This Architecture is Best

### ✅ Single Master Chain with Dual Signatures

| Feature | Benefit |
|---------|---------|
| **Single Chain** | One source of truth, clear ordering |
| **User Signature** | Proves user authorized action |
| **System Signature** | Proves platform validated action |
| **IPFS Storage** | Permanent, immutable, decentralized |
| **Merkle Proofs** | Can prove transaction in block |
| **Block Signatures** | Proves block authenticity |
| **Cloudflare Secrets** | System keys never exposed |
| **Zero-Knowledge** | User data encrypted client-side |
| **Post-Quantum** | Kyber + Dilithium (NIST standards) |

### 🎯 Perfect for Legal Documents

- ✅ Court-admissible proof of existence
- ✅ Chronological ordering (proves "Document A before B")
- ✅ Chain of custody (ownership transfers)
- ✅ Non-repudiation (signatures prove who did what)
- ✅ Tamper-proof (blockchain immutability)
- ✅ Third-party verifiable (anyone can verify)
- ✅ Quantum-resistant (future-proof)

### 🚀 Implementation Steps

1. **Generate system master keys** (Dilithium keypair)
2. **Store in Cloudflare secrets** (never in code/KV)
3. **Create genesis block** (block 0, signed by system)
4. **Implement dual-signature transactions** (user + system)
5. **Build block mining** (accumulate pending transactions)
6. **Upload blocks to IPFS** (permanent storage)
7. **Index in KV** (fast lookups)
8. **Implement verification** (validate entire chain)

This is the **correct architecture** for your legal document platform! 🎉

---

## 📚 Related Documentation

- [**ZERO_KNOWLEDGE_ARCHITECTURE.md**](./ZERO_KNOWLEDGE_ARCHITECTURE.md) - Zero-knowledge security model & machine identities
- [**SECURITY_ARCHITECTURE.md**](./SECURITY_ARCHITECTURE.md) - Comprehensive security design
- [**VDC_INTEGRATION_GUIDE.md**](./VDC_INTEGRATION_GUIDE.md) - Developer guide for VDC blockchain
- [**TECHNICAL_STATUS.md**](./TECHNICAL_STATUS.md) - Current implementation status

---

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production Ready  
**Deployment**: https://veritas-docs-production.rme-6e5.workers.dev
