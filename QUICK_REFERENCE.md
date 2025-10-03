# Veritas Documents - Quick Reference Guide

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production

---

## 🚀 QUICK START

### Development Setup
```powershell
# Clone and setup
git clone <repository-url>
cd VeritasDocs
npm install

# Start development server
npm run dev
# Access: http://127.0.0.1:8787

# Build for production
npm run build

# Deploy to production
wrangler deploy
```

### Production Environment
- **URL**: https://veritas-docs-production.rme-6e5.workers.dev
- **KV Namespace**: 9f0ea31309cd44cab7bfe3569e16aa45
- **IPFS**: Pinata production pinning service
- **Blockchain**: VDC (Veritas Documents Chain) with dual signatures

### Key Endpoints
```
Landing Page:  /
Demo:          /demo
Health:        /health
Token Info:    /api/auth/token-info?token=<token>

VDC Stats:     /api/vdc/stats
VDC Blocks:    /api/vdc/blocks/{blockNumber}
VDC Verify:    /api/vdc/verify/{transactionId}
```

---

## 📡 API REFERENCE

### Authentication

#### Activate Account (Zero-Knowledge Flow)
```bash
POST /api/auth/activate
Content-Type: application/json

{
  "token": "activation_token_here",
  "fullName": "John Doe",
  "email": "john@example.com",
  "dateOfBirth": "1990-01-01",
  "address": "123 Main St",
  "phoneNumber": "+1-555-0100",
  "encryptedData": "base64url_encrypted_personal_data",
  "kyberPublicKey": "base64url_kyber_public_key",
  "dilithiumPublicKey": "base64url_dilithium_public_key",
  "userSignature": "base64url_dilithium_signature",
  "timestamp": 1735934400000
}
```

**Response**: `200 OK` with user data, or `401 Unauthorized` if signature invalid

#### Check Token Status
```bash
GET /api/auth/token-info?token=<activation_token>

Response:
{
  "valid": true,
  "email": "john@example.com",
  "expiresAt": 1736539200000,
  "daysRemaining": 6
}
```

#### Login (Zero-Knowledge Proof)
```bash
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "decryptedChallenge": "plaintext_challenge_here"
}
```

Server encrypts challenge with user's Kyber public key, user decrypts client-side to prove key possession.

---

### VDC Blockchain Operations

#### Get Blockchain Stats
```bash
GET /api/vdc/stats

Response:
{
  "blockHeight": 42,
  "totalTransactions": 156,
  "pendingTransactions": 3,
  "lastBlock": {...},
  "systemPublicKeys": {...}
}
```

#### Get Block by Number
```bash
GET /api/vdc/blocks/5

Response:
{
  "blockNumber": 5,
  "timestamp": 1735934400000,
  "transactions": [...],
  "previousHash": "...",
  "merkleRoot": "...",
  "ipfsHash": "Qm..."
}
```

#### Verify Transaction
```bash
GET /api/vdc/verify/{transactionId}

Response:
{
  "valid": true,
  "transaction": {...},
  "blockNumber": 5,
  "signatures": {
    "user": "verified",
    "system": "verified"
  }
}
```

#### Mine Pending Transactions (Admin Only)
```bash
POST /api/vdc/mine
X-Admin-Secret: <admin_secret>

Response:
{
  "blockNumber": 6,
  "transactionsProcessed": 5,
  "ipfsHash": "Qm..."
}
```

---

### Document Management

#### Create Document (Web3 + VDC)
```bash
POST /api/web3-assets/create-web3
Content-Type: application/json

{
  "userId": "user_123",
  "title": "Last Will and Testament",
  "documentType": "will",
  "documentData": {...},
  "privateKey": "-----BEGIN PRIVATE KEY-----..."
}
```

Creates document with:
1. Kyber encryption
2. Dilithium signature
3. IPFS storage via Pinata
4. VDC blockchain transaction (dual signed)
5. Ethereum anchoring (optional)

#### Get Document with Verification
```bash
GET /api/web3-assets/web3/{assetId}

Response:
{
  "id": "asset_123",
  "tokenId": "VD_001",
  "title": "...",
  "ipfsHash": "Qm...",
  "vdcTransactionId": "tx_456",
  "blockchainVerified": true,
  "signatures": {...}
}
```

#### Decrypt Document Content
```bash
POST /api/web3-assets/web3/{assetId}/decrypt
Content-Type: application/json

{
  "privateKey": "-----BEGIN PRIVATE KEY-----..."
}

Response:
{
  "decryptedData": {...},
  "metadata": {...}
}
```

---

### Search
```bash
# Search Public Documents
GET /api/search?q=will&type=will&limit=10

Response:
{
  "results": [
    {
      "id": "asset_123",
      "title": "...",
      "documentType": "will",
      "createdAt": 1735934400000
    }
  ],
  "total": 1
}
```

---

## 🔧 CONFIGURATION

### Environment Variables (Production)
```bash
# Stripe Payment Processing
STRIPE_SECRET_KEY=sk_live_...

# IPFS Storage (Pinata)
PINATA_JWT=eyJ...

# VDC Blockchain System Keys (Split Secret Architecture)
DILITHIUM_PRIVATE_KEY_PART1=base64url_part1...
DILITHIUM_PRIVATE_KEY_PART2=base64url_part2...
DILITHIUM_PUBLIC_KEY=base64url_public_key...
KYBER_PUBLIC_KEY=base64url_public_key...
KYBER_PRIVATE_KEY=base64url_private_key...
SYSTEM_KEY_VERSION=1.0.0
SYSTEM_KEY_ID=system_master_2025

# Ethereum Anchoring (Optional - Testnet Currently)
ETHEREUM_PRIVATE_KEY=0x...
ETHEREUM_RPC_URL=https://cloudflare-eth.com/v1/sepolia

# Admin Operations
ADMIN_SECRET_KEY=...
```

### System Key Management

**CRITICAL**: System Dilithium private key is split into two parts for security:
- `DILITHIUM_PRIVATE_KEY_PART1` + `DILITHIUM_PRIVATE_KEY_PART2` = Complete key
- Reconstructed only at runtime in worker memory
- Never persisted as complete key
- See [ZERO_KNOWLEDGE_ARCHITECTURE.md § Machine Identities](./ZERO_KNOWLEDGE_ARCHITECTURE.md#machine-identities--system-accounts)

Generate system keys with:
```powershell
node generate-system-keys.js
```

Configure secrets with:
```powershell
.\setup-production-secrets.ps1
```

---

## 💾 DATA MODELS

### User (Zero-Knowledge)
```typescript
{
  id: string;                    // Unique user ID
  email: string;                 // Email (unencrypted)
  fullName: string;              // Encrypted
  dateOfBirth: string;           // Encrypted
  address: string;               // Encrypted  
  phoneNumber: string;           // Encrypted
  encryptedData: string;         // Kyber-encrypted personal data
  kyberPublicKey: string;        // For encryption (server stores)
  dilithiumPublicKey: string;    // For signatures (server stores)
  createdAt: number;
  hasActivated: boolean;
  accountType: 'paid' | 'invited';
  vdcTransactionId?: string;     // Blockchain registration transaction
}
```

**Important**: Server never sees Kyber or Dilithium private keys.

### VDC Transaction
```typescript
{
  id: string;
  type: 'USER_REGISTRATION' | 'DOCUMENT_CREATED' | 'ASSET_TRANSFER' | 'ADMIN_ACTION';
  timestamp: number;
  payload: any;                  // Transaction-specific data
  userSignature: string;         // User's Dilithium signature
  systemSignature: string;       // System's Dilithium signature
  merkleProof?: string[];
  blockNumber?: number;
  ipfsHash?: string;
}
```

### VDC Block
```typescript
{
  blockNumber: number;
  timestamp: number;
  transactions: VDCTransaction[];
  previousHash: string;
  merkleRoot: string;
  systemSignature: string;       // System signs entire block
  ipfsHash: string;              // Stored in IPFS via Pinata
}
```

### Document Asset
```typescript
{
  id: string;
  tokenId: string;               // VD_001, VD_002, etc.
  userId: string;
  title: string;
  documentType: 'will' | 'deed' | 'certificate' | 'contract' | 'other';
  encryptedData: string;         // Kyber-encrypted document content
  ipfsHash: string;              // IPFS CID for encrypted data
  signature: string;             // User's Dilithium signature
  vdcTransactionId: string;      // VDC blockchain transaction
  ethereumTxHash?: string;       // Ethereum anchor (optional)
  createdAt: number;
  metadata: {
    // Public metadata (unencrypted)
  }
}
```

---

## 🔐 CRYPTOGRAPHY USAGE

### Ma'atara Protocol v0.2.3

#### Initialize WASM
```typescript
import { MaataraClient } from '@maatara/core-pqc';

const wasmResponse = await fetch('/core_pqc_wasm_bg.wasm');
const client = new MaataraClient({ wasmResponse });
await client.initialize();
```

**Important**: Must pass fetch Response object, not bytes.

#### Generate Key Pairs (Client-Side Only)
```typescript
// Kyber-768 (NIST FIPS 203 - Level 3)
const kyberKeyPair = await client.kyber.generateKeyPair();
// Returns: { publicKey: string, privateKey: string } (base64url)

// Dilithium-2 (NIST FIPS 204 - Level 2)
const dilithiumKeyPair = await client.dilithium.generateKeyPair();
// Returns: { publicKey: string, privateKey: string } (base64url)
```

**CRITICAL**: Keys NEVER sent to server. JSON download only.

#### Encrypt Data (Kyber-768)
```typescript
const plaintext = JSON.stringify({ sensitive: 'data' });
const encrypted = await client.kyber.encrypt(
  plaintext,
  recipientPublicKey  // base64url string
);
// Returns: base64url encrypted data
```

#### Decrypt Data (Kyber-768)
```typescript
const decrypted = await client.kyber.decrypt(
  encryptedData,      // base64url string
  privateKey          // base64url string
);
// Returns: original plaintext
```

#### Sign Data (Dilithium-2)
```typescript
const dataToSign = JSON.stringify({
  type: 'USER_REGISTRATION',
  email: 'user@example.com',
  timestamp: Date.now()
});

const signature = await client.dilithium.sign(
  dataToSign,
  privateKey          // base64url string
);
// Returns: base64url signature
```

**Important**: Always use base64url strings, NOT bytes.

#### Verify Signature (Dilithium-2)
```typescript
const isValid = await client.dilithium.verify(
  signature,          // base64url string
  dataToSign,         // original plaintext
  publicKey           // base64url string
);
// Returns: boolean
```

---

## 🌐 IPFS INTEGRATION (Pinata)

### Store Document
```typescript
import { IPFSClient } from './src/utils/ipfs';

const ipfs = new IPFSClient(env);
const result = await ipfs.pinJSON({
  encryptedData: '...',
  signature: '...',
  metadata: {...}
});

// result.IpfsHash: "Qm..."
// Access: https://gateway.pinata.cloud/ipfs/Qm...
```

### Retrieve Document
```typescript
const data = await ipfs.getJSON(ipfsHash);
// Returns: Original JSON object
```

### Pin Management
```typescript
// List pinned files
const pins = await ipfs.listPins();

// Unpin file (careful!)
await ipfs.unpin(ipfsHash);
```

---

## ⛓️ VDC BLOCKCHAIN

### System Key Reconstruction
```typescript
import { getSystemDilithiumPrivateKey } from './src/utils/blockchain';

// Reconstructs system private key from split parts
const systemPrivateKey = getSystemDilithiumPrivateKey(env);
// ONLY happens in worker memory, never persisted
```

### Add User to VDC Blockchain
```typescript
import { addUserToVDC } from './src/utils/blockchain';

await addUserToVDC(
  env,
  userId,
  email,
  kyberPublicKey,
  dilithiumPublicKey,
  userSignature,         // User signs registration data
  timestamp              // Must match signed timestamp
);
```

This creates a dual-signed transaction:
1. User signature (proves user controls private key)
2. System signature (provides blockchain consensus)

### Verify Transaction
```typescript
import { verifyTransaction } from './src/utils/blockchain';

const isValid = await verifyTransaction(
  env,
  transactionId
);
// Checks both user and system signatures
```

### Query Blockchain
```typescript
// Get current block height
const stats = await getVDCStats(env);
console.log(stats.blockHeight); // e.g., 42

// Get specific block
const block = await getBlockByNumber(env, 5);

// Get user's transactions
const userTxs = await getUserTransactions(env, userId);
```

---

## 🧪 TESTING

### Local Development Testing

#### Test Activation Flow
1. Start dev server: `npm run dev`
2. Generate activation token:
```powershell
.\create-production-user.ps1
```
3. Visit: `http://127.0.0.1:8787/activate?token=<token>`
4. Fill form (keys generated client-side)
5. Save JSON key file
6. Verify VDC transaction created

#### Test Document Creation
1. Login with saved keys
2. Visit demo: `http://127.0.0.1:8787/demo`
3. Create test document
4. Verify IPFS storage
5. Verify VDC blockchain transaction
6. Verify dual signatures

### Manual API Testing
```powershell
# Check activation token
curl "http://127.0.0.1:8787/api/auth/token-info?token=<token>"

# Check VDC stats
curl http://127.0.0.1:8787/api/vdc/stats

# Get block
curl http://127.0.0.1:8787/api/vdc/blocks/1

# Verify transaction
curl http://127.0.0.1:8787/api/vdc/verify/<transactionId>
```

### Production Smoke Tests
```powershell
# Health check
curl https://veritas-docs-production.rme-6e5.workers.dev/health

# VDC stats
curl https://veritas-docs-production.rme-6e5.workers.dev/api/vdc/stats

# Token validation
curl "https://veritas-docs-production.rme-6e5.workers.dev/api/auth/token-info?token=<token>"
```

---

## � TROUBLESHOOTING

### Common Issues

#### "WASM initialization failed"
```typescript
// ❌ WRONG - Don't use bytes
const wasmBytes = await wasmResponse.arrayBuffer();
const client = new MaataraClient({ wasmBytes });

// ✅ CORRECT - Use Response object
const wasmResponse = await fetch('/core_pqc_wasm_bg.wasm');
const client = new MaataraClient({ wasmResponse });
```

#### "Dilithium signature verification failed"
```typescript
// ❌ WRONG - Timestamps don't match
const data1 = { ...payload, timestamp: Date.now() };
const signature = await client.dilithium.sign(JSON.stringify(data1), key);
const data2 = { ...payload, timestamp: Date.now() };  // Different!
await client.dilithium.verify(signature, JSON.stringify(data2), pubKey);

// ✅ CORRECT - Same timestamp for sign and verify
const timestamp = Date.now();
const data = { ...payload, timestamp };
const signature = await client.dilithium.sign(JSON.stringify(data), key);
await client.dilithium.verify(signature, JSON.stringify(data), pubKey);
```

#### "Blockchain transaction rejected"
Check:
- User signature matches signed data exactly (including timestamp)
- System keys configured correctly (PART1 + PART2)
- Transaction data formatted correctly
- Both user and system public keys valid

#### "IPFS pinning failed"
```powershell
# Check Pinata JWT
echo $env:PINATA_JWT

# Test Pinata API
curl -X GET https://api.pinata.cloud/data/testAuthentication `
  -H "Authorization: Bearer $env:PINATA_JWT"
```

#### "Split secret reconstruction failed"
Verify both parts configured:
```powershell
wrangler secret list --env production
# Should show:
# - DILITHIUM_PRIVATE_KEY_PART1
# - DILITHIUM_PRIVATE_KEY_PART2
```

---

## 🚀 DEPLOYMENT

### Pre-Deployment Checklist
- [x] System keys generated and split
- [x] Cloudflare secrets configured
- [x] IPFS Pinata configured
- [x] Genesis block initialized
- [ ] Custom domain configured
- [ ] Ethereum mainnet (currently testnet)
- [x] WASM bundle uploaded to KV
- [x] Frontend bundle uploaded to KV

### Deploy to Production
```powershell
# Full deployment
wrangler deploy

# Check deployment
wrangler tail

# Verify VDC blockchain
curl https://veritas-docs-production.rme-6e5.workers.dev/api/vdc/stats
```

### Upload Assets
```powershell
# Upload WASM and frontend bundles
.\upload-assets.ps1
```

This uploads:
- `core_pqc_wasm_bg.wasm` → KV key `pqc-wasm`
- `public/app.bundle.js` → KV key `app-bundle`

### Initialize Genesis Block (One-Time)
```powershell
node initialize-genesis-block.js --secret=<admin_secret>
```

**CRITICAL**: Run ONCE per environment, creates block 0 with system public keys.

---

## 📊 MONITORING

### Health Checks
```powershell
# Application health
curl https://veritas-docs-production.rme-6e5.workers.dev/health

# VDC blockchain health
curl https://veritas-docs-production.rme-6e5.workers.dev/api/vdc/stats
```

### Key Metrics
- **Block Height**: Number of VDC blocks mined
- **Pending Transactions**: Transactions waiting for mining
- **Total Transactions**: All blockchain transactions
- **IPFS Pins**: Documents stored in IPFS

### Live Logs
```powershell
# Real-time production logs
wrangler tail --env production

# Filter for errors
wrangler tail --env production --format json | Select-String "ERROR"
```

### Performance Targets
- **Response Time**: <500ms (p95)
- **Uptime**: 99.9%
- **Error Rate**: <0.1%
- **Blockchain Sync**: <5s for transaction confirmation

---

## 📚 Related Documentation

- [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) - Comprehensive security design
- [ZERO_KNOWLEDGE_ARCHITECTURE.md](./ZERO_KNOWLEDGE_ARCHITECTURE.md) - Zero-knowledge principles and machine identities
- [VDC_INTEGRATION_GUIDE.md](./VDC_INTEGRATION_GUIDE.md) - Blockchain integration developer guide
- [BLOCKCHAIN_ARCHITECTURE.md](./BLOCKCHAIN_ARCHITECTURE.md) - VDC blockchain design
- [ACTIVATION_TOKEN_FLOW.md](./ACTIVATION_TOKEN_FLOW.md) - User activation process
- [SECURITY_GUARDRAILS.md](./SECURITY_GUARDRAILS.md) - Key management guardrails
- [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - Project roadmap and features
- [TECHNICAL_STATUS.md](./TECHNICAL_STATUS.md) - Current implementation status

---

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production  
**Production URL**: https://veritas-docs-production.rme-6e5.workers.dev