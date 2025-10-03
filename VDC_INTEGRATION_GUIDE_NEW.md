# VDC Blockchain Integration Guide

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Setup & Initialization](#setup--initialization)
3. [User Registration Flow](#user-registration-flow)
4. [Document Creation Flow](#document-creation-flow)
5. [Querying the Blockchain](#querying-the-blockchain)
6. [Verification & Security](#verification--security)
7. [API Reference](#api-reference)

---

## 🎯 Overview

The **Veritas Documents Chain (VDC)** is a post-quantum blockchain for legal document storage with:

- **Dual Signatures**: Every transaction signed by user + system
- **Post-Quantum Crypto**: Dilithium-2 signatures (NIST FIPS 204)
- **IPFS Storage**: Blocks stored permanently in IPFS
- **Zero-Knowledge**: User data encrypted client-side
- **Immutable Audit Trail**: Complete verification history

---

## 🚀 Setup & Initialization

### 1. Generate System Master Keys

```bash
# Generate VDC system master keys (ONE TIME ONLY)
node generate-system-keys.js
```

Creates:
- `system-master-keys.json` - Complete keys (NEVER deploy to production)
- `system-public-keys.json` - Public keys only

### 2. Configure Cloudflare Secrets

```bash
# Upload secrets to Cloudflare
.\setup-production-secrets.ps1

# Or manually
echo "your-dilithium-public-key" | wrangler secret put SYSTEM_DILITHIUM_PUBLIC_KEY --env production
echo "first-half-of-private-key" | wrangler secret put SYSTEM_DILITHIUM_PRIVATE_PART1 --env production
echo "second-half-of-private-key" | wrangler secret put SYSTEM_DILITHIUM_PRIVATE_PART2 --env production
echo "your-kyber-public-key" | wrangler secret put SYSTEM_KYBER_PUBLIC_KEY --env production
echo "your-kyber-private-key" | wrangler secret put SYSTEM_KYBER_PRIVATE --env production
echo "vdc-master-v1-timestamp" | wrangler secret put SYSTEM_KEY_ID --env production
```

### 3. Initialize Genesis Block

```bash
# Create genesis block (block 0)
node initialize-genesis-block.js production
```

Creates:
- Block 0 with system public keys
- Genesis transaction signed by system
- IPFS hash for genesis block
- Initial blockchain state in KV

### 4. Verify Setup

```bash
# Check blockchain stats
curl https://your-worker.workers.dev/api/vdc/stats

# Expected response:
{
  "success": true,
  "data": {
    "initialized": true,
    "chain": "VeritasByMaataraBlockChain (VDC)",
    "totalBlocks": 1,
    "latestBlock": {
      "number": 0,
      "hash": "...",
      "ipfsHash": "Qm...",
      "timestamp": 1735888726509
    },
    "pendingTransactions": 0,
    "genesisHash": "..."
  }
}
```

---

## 👤 User Registration Flow

### Backend Implementation (Current)

```typescript
// src/handlers/auth.ts
import { initializeVDC, addUserToVDC } from '../utils/blockchain';

authHandler.post('/activate', async (c) => {
  const env = c.env;
  const { 
    token,
    kyberPublicKey,
    dilithiumPublicKey,
    encryptedUserData,  // Already encrypted client-side
    signature           // User's Dilithium signature from frontend
  } = await c.req.json();

  // ... token validation ...

  const userId = generateId();
  const accountType = oneTimeLink.inviteType === 'admin' ? 'admin' : 'invited';

  // Initialize VDC blockchain
  const vdc = await initializeVDC(env);

  // Add user to VDC with dual signatures
  // This will:
  // 1. Accept user's pre-computed signature
  // 2. Add system signature
  // 3. Create dual-signed transaction
  // 4. Add to pending pool
  try {
    const txId = await addUserToVDC(
      vdc,
      userId,
      oneTimeLink.email,
      kyberPublicKey,
      dilithiumPublicKey,
      encryptedUserData,
      accountType,
      signature  // User's signature from frontend
    );

    console.log(`✅ User ${userId} added to VDC (tx: ${txId})`);

    // Save user record
    const user = {
      id: userId,
      email: oneTimeLink.email,
      publicKey: kyberPublicKey,
      encryptedPrivateData: JSON.stringify({
        recoveryPhrase: generateMnemonic(),
        blockchainTxId: txId,
        dilithiumPublicKey
      }),
      createdAt: Date.now(),
      hasActivated: true,
      accountType
    };

    await env.VERITAS_KV.put(`user:${userId}`, JSON.stringify(user));
    await env.VERITAS_KV.put(`user:email:${email}`, userId);

    return c.json({ success: true, data: { userId, txId } });
  } catch (error: any) {
    return c.json({ 
      success: false, 
      error: `Blockchain transaction rejected: ${error?.message}` 
    }, 401);
  }
});
```

### Frontend Implementation

```javascript
// public/app.js
async function handleActivation(personalDetails) {
  // 1. Initialize WASM
  await window.VeritasCrypto.ensureCryptoReady();

  // 2. Generate keypairs (CLIENT-SIDE ONLY)
  const keypairs = await window.VeritasCrypto.generateClientKeypair();

  // 3. Encrypt user data
  const userData = {
    email: userEmail,
    personalDetails,
    preferences: {},
    createdAt: Date.now()
  };
  
  const encryptedUserData = await window.VeritasCrypto.encryptDocumentData(
    JSON.stringify(userData),
    keypairs.kyberPublicKey
  );

  // 4. Sign blockchain transaction
  const dataToSign = JSON.stringify({
    kyberPublicKey: keypairs.kyberPublicKey,
    dilithiumPublicKey: keypairs.dilithiumPublicKey,
    encryptedUserData,
    timestamp: Date.now()
  });

  const signature = await window.VeritasCrypto.signData(
    dataToSign,
    keypairs.dilithiumPrivateKey
  );

  // 5. Send to server (NO PRIVATE KEYS!)
  const response = await fetch('/api/auth/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: activationToken,
      kyberPublicKey: keypairs.kyberPublicKey,
      dilithiumPublicKey: keypairs.dilithiumPublicKey,
      encryptedUserData,
      signature  // Pre-computed by client
    })
  });

  // 6. Download keys as JSON
  if (response.ok) {
    downloadKeysAsJSON({
      email: userEmail,
      kyberKeys: keypairs.kyberKeys,
      dilithiumKeys: keypairs.dilithiumKeys,
      recoveryPhrase: result.data.recoveryPhrase
    });
  }
}
```

---

## 📄 Document Creation Flow

### Backend Implementation

```typescript
// src/handlers/docs.ts
import { initializeVDC, addDocumentToVDC } from '../utils/blockchain';

docsHandler.post('/create', async (c) => {
  const env = c.env;
  const { 
    title,
    documentData,        // Already encrypted client-side
    userDilithiumPrivateKey,  // For signing
    userDilithiumPublicKey
  } = await c.req.json();

  // Authenticate user
  const user = await authenticateUser(c);

  // Upload to IPFS
  const ipfsHash = await uploadToIPFS(documentData);

  // Calculate document hash
  const documentHash = await crypto.sha256(documentData);

  // Initialize VDC
  const vdc = await initializeVDC(env);

  // Add document to VDC with dual signatures
  const documentId = generateId();
  const txId = await addDocumentToVDC(
    vdc,
    documentId,
    documentHash,
    ipfsHash,
    { title, creator: user.id, timestamp: Date.now() },
    userDilithiumPrivateKey,
    userDilithiumPublicKey
  );

  return c.json({
    success: true,
    data: {
      documentId,
      txId,
      ipfsHash,
      hash: documentHash
    }
  });
});
```

---

## 🔍 Querying the Blockchain

### Get Blockchain Statistics

```bash
GET /api/vdc/stats
```

```json
{
  "success": true,
  "data": {
    "initialized": true,
    "chain": "VeritasByMaataraBlockChain (VDC)",
    "totalBlocks": 5,
    "latestBlock": {
      "number": 4,
      "hash": "abc123...",
      "ipfsHash": "QmXXX...",
      "timestamp": 1735900000000
    },
    "pendingTransactions": 3,
    "genesisHash": "000000..."
  }
}
```

### Get Specific Block

```bash
GET /api/vdc/block/:blockNumber
```

```json
{
  "success": true,
  "data": {
    "blockNumber": 1,
    "timestamp": 1735888800000,
    "previousHash": "genesis-hash",
    "hash": "block1-hash",
    "transactions": [
      {
        "id": "vdc_tx_123",
        "type": "user_registration",
        "timestamp": 1735888790000,
        "data": {
          "userId": "user_123",
          "email": "user@example.com",
          "kyberPublicKey": "...",
          "dilithiumPublicKey": "...",
          "encryptedUserData": "...",
          "accountType": "admin"
        },
        "signatures": {
          "user": {
            "publicKey": "user-dilithium-public",
            "signature": "user-dilithium-signature"
          },
          "system": {
            "publicKey": "system-dilithium-public",
            "signature": "system-dilithium-signature",
            "keyVersion": 1
          }
        }
      }
    ],
    "merkleRoot": "merkle-root-hash",
    "blockSignature": {
      "publicKey": "system-dilithium-public",
      "signature": "block-signature",
      "keyVersion": 1
    },
    "ipfsHash": "QmYYY..."
  }
}
```

### Verify Block

```bash
GET /api/vdc/verify/:blockNumber
```

```json
{
  "success": true,
  "data": {
    "blockNumber": 1,
    "blockHashValid": true,
    "merkleRootValid": true,
    "blockSignatureValid": true,
    "transactionSignaturesValid": true,
    "previousHashValid": true,
    "allChecks": true
  }
}
```

---

## 🔒 Verification & Security

### Verify Transaction Signatures

```typescript
// src/utils/blockchain.ts
async verifyTransaction(transaction: VDCTransaction): Promise<boolean> {
  const txData = {
    id: transaction.id,
    type: transaction.type,
    timestamp: transaction.timestamp,
    data: transaction.data
  };

  // Verify user signature
  const userSigValid = await this.maataraClient.verifySignature(
    JSON.stringify(txData),
    transaction.signatures.user.signature,
    transaction.signatures.user.publicKey
  );

  if (!userSigValid) {
    console.error('❌ User signature invalid');
    return false;
  }

  // Verify system signature
  const systemSigValid = await this.maataraClient.verifySignature(
    JSON.stringify(txData),
    transaction.signatures.system.signature,
    transaction.signatures.system.publicKey
  );

  if (!systemSigValid) {
    console.error('❌ System signature invalid');
    return false;
  }

  return true;
}
```

### Verify Entire Blockchain

```typescript
async function verifyEntireChain(vdc: VDCBlockchain): Promise<boolean> {
  const latest = await vdc.getLatestBlock();

  for (let i = 0; i <= latest.blockNumber; i++) {
    const block = await vdc.getBlock(i);
    
    if (!block) {
      console.error(`❌ Block ${i} not found`);
      return false;
    }

    // Verify block integrity
    const blockValid = await vdc.verifyBlock(block);
    if (!blockValid) {
      console.error(`❌ Block ${i} verification failed`);
      return false;
    }

    // Verify chain linkage (except genesis)
    if (i > 0) {
      const previousBlock = await vdc.getBlock(i - 1);
      if (block.previousHash !== previousBlock.hash) {
        console.error(`❌ Block ${i} chain linkage broken`);
        return false;
      }
    }
  }

  console.log(`✅ All ${latest.blockNumber + 1} blocks verified`);
  return true;
}
```

---

## 📡 API Reference

### VDC Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/vdc/stats` | GET | Get blockchain statistics |
| `/api/vdc/latest-block` | GET | Get latest block |
| `/api/vdc/block/:blockNumber` | GET | Get specific block |
| `/api/vdc/verify/:blockNumber` | GET | Verify block integrity |
| `/api/vdc/transaction/:txId` | GET | Get transaction by ID |

### VDCBlockchain Class Methods

```typescript
class VDCBlockchain {
  // Initialization
  async initialize(): Promise<void>
  async createGenesisBlock(): Promise<VDCBlock>

  // Transaction Management
  async addTransaction(
    type: VDCTransaction['type'],
    data: VDCTransaction['data'],
    userDilithiumPrivateKey: string,
    userDilithiumPublicKey: string
  ): Promise<string>

  async addUserRegistrationWithSignature(
    data: VDCTransaction['data'],
    userSignature: string,
    userDilithiumPublicKey: string
  ): Promise<string>

  async addAdminAction(
    action: string,
    payload: Record<string, any>
  ): Promise<{ transaction: VDCTransaction; pendingCount: number }>

  // Block Mining
  async mineBlock(): Promise<VDCBlock>

  // Querying
  async getLatestBlock(): Promise<VDCBlock>
  async getBlock(blockNumber: number): Promise<VDCBlock | null>
  async getTransaction(txId: string): Promise<VDCTransaction | null>
  async getStats(): Promise<any>

  // Verification
  async verifyTransaction(transaction: VDCTransaction): Promise<boolean>
  async verifyBlock(block: VDCBlock): Promise<boolean>
}
```

### Helper Functions

```typescript
// Initialize VDC blockchain
export async function initializeVDC(env: Environment): Promise<VDCBlockchain>

// Add user registration
export async function addUserToVDC(
  vdc: VDCBlockchain,
  userId: string,
  email: string,
  kyberPublicKey: string,
  dilithiumPublicKey: string,
  encryptedUserData: any,
  accountType: 'admin' | 'paid' | 'invited',
  userSignature: string
): Promise<string>

// Add document
export async function addDocumentToVDC(
  vdc: VDCBlockchain,
  documentId: string,
  documentHash: string,
  ipfsHash: string,
  metadata: any,
  userDilithiumPrivateKey: string,
  userDilithiumPublicKey: string
): Promise<string>

// Add asset transfer
export async function addAssetTransferToVDC(
  vdc: VDCBlockchain,
  assetId: string,
  fromUserId: string,
  toUserId: string,
  userDilithiumPrivateKey: string,
  userDilithiumPublicKey: string
): Promise<string>
```

---

## 🎯 Best Practices

### 1. Always Verify Signatures

```typescript
// Before processing any transaction
const isValid = await vdc.verifyTransaction(transaction);
if (!isValid) {
  throw new Error('Invalid transaction signature');
}
```

### 2. Mine Blocks Periodically

```typescript
// Check pending transaction count
const stats = await vdc.getStats();

if (stats.pendingTransactions >= 10) {
  // Mine a new block
  const newBlock = await vdc.mineBlock();
  console.log(`Mined block ${newBlock.blockNumber}`);
}
```

### 3. Backup Genesis Data

```typescript
// Store genesis data for recovery
const genesisData = await env.VERITAS_KV.get('vdc:genesis');
// Backup to secure offsite storage
```

### 4. Monitor Blockchain Health

```typescript
// Regular health checks
const stats = await vdc.getStats();
console.log(`Blocks: ${stats.totalBlocks}, Pending: ${stats.pendingTransactions}`);

// Verify chain integrity
const chainValid = await verifyEntireChain(vdc);
if (!chainValid) {
  console.error('⚠️  Blockchain verification failed!');
  // Alert admins
}
```

---

## 🔗 Related Documentation

- [**BLOCKCHAIN_ARCHITECTURE.md**](./BLOCKCHAIN_ARCHITECTURE.md) - VDC blockchain design principles
- [**ZERO_KNOWLEDGE_ARCHITECTURE.md**](./ZERO_KNOWLEDGE_ARCHITECTURE.md) - Zero-knowledge security model
- [**SECURITY_ARCHITECTURE.md**](./SECURITY_ARCHITECTURE.md) - Complete security design
- [**TECHNICAL_STATUS.md**](./TECHNICAL_STATUS.md) - Current implementation status

---

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production Ready  
**Deployment**: https://veritas-docs-production.rme-6e5.workers.dev
