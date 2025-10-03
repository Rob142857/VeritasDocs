# Veritas Documents - Quick Reference Guide

## 🚀 QUICK START

### Development Setup
```bash
# Clone and setup
git clone <repository-url>
cd VeritasDocs
npm install

# Start development server
npm run dev
# Access: http://127.0.0.1:8787

# Build for production
npm run build
```

### Key Endpoints
```
Main App:     http://127.0.0.1:8787/
Web3 Demo:    http://127.0.0.1:8787/demo
Health Check: http://127.0.0.1:8787/health
VDC Stats:    http://127.0.0.1:8787/api/vdc/stats
VDC Blocks:   http://127.0.0.1:8787/api/vdc/blocks/{blockNumber}
```

---

## 📡 API REFERENCE

### Authentication
```bash
# Login
POST /api/auth/login
{
  "email": "user@example.com",
  "privateKey": "-----BEGIN PRIVATE KEY-----..."
}

# Activate Account
POST /api/auth/activate
{
  "token": "activation_token",
  "userData": {...}
}
```

### Web3 Assets (Recommended)
```bash
# Create Web3 Asset
POST /api/web3-assets/create-web3
{
  "userId": "user_123",
  "title": "Document Title",
  "documentData": {...},
  "privateKey": "-----BEGIN PRIVATE KEY-----..."
}

# Get Web3 Asset with Verification
GET /api/web3-assets/web3/{assetId}

# Decrypt Content from IPFS
POST /api/web3-assets/web3/{assetId}/decrypt
{
  "privateKey": "-----BEGIN PRIVATE KEY-----..."
}
```

### Search
```bash
# Search Public Documents
GET /api/search?q=term&type=will&limit=10
```

### VDC Blockchain Admin
```bash
# Initialize Genesis Block (requires admin secret)
curl -X POST http://127.0.0.1:8787/api/vdc/initialize-genesis \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: <admin-secret>"

# Queue Admin Action
curl -X POST http://127.0.0.1:8787/api/vdc/admin/actions \
  -H "Content-Type: application/json" \
  -H "X-Admin-Secret: <admin-secret>" \
  -d '{"action":"anchor_merkle_root","payload":{"root":"0xabc"}}'

# Mine Pending Transactions
curl -X POST http://127.0.0.1:8787/api/vdc/mine \
  -H "X-Admin-Secret: <admin-secret>"
```

---

## 🔧 CONFIGURATION

### Environment Variables
```bash
# Required for Production
STRIPE_SECRET_KEY=sk_live_...
ETHEREUM_PRIVATE_KEY=0x...
IPFS_API_KEY=...
VERITAS_CONTRACT_ADDRESS=0x...
ADMIN_SECRET_KEY=...
SYSTEM_DILITHIUM_PUBLIC_KEY=...
SYSTEM_DILITHIUM_PRIVATE_KEY_PART1=...
SYSTEM_DILITHIUM_PRIVATE_KEY_PART2=...
SYSTEM_KYBER_PUBLIC_KEY=...
SYSTEM_KYBER_PRIVATE_KEY=...
SYSTEM_KEY_VERSION=...
SYSTEM_KEY_ID=...

# Optional
PINATA_API_KEY=...
PINATA_SECRET_KEY=...
```

### wrangler.toml
```toml
name = "veritas-documents"
main = "src/index.ts"
compatibility_date = "2024-01-01"

[env.production.vars]
ENVIRONMENT = "production"
MAATARA_API_BASE = "https://maatara-core-worker.rme-6e5.workers.dev"
ETHEREUM_RPC_URL = "https://cloudflare-eth.com/v1/mainnet"
IPFS_GATEWAY_URL = "https://cloudflare-ipfs.com"
```

---

## 💾 DATA MODELS

### User
```typescript
{
  id: string;
  email: string;
  publicKey: string;
  encryptedPrivateData: string;
  createdAt: number;
  hasActivated: boolean;
  accountType: 'paid' | 'invited';
}
```

### Asset (Web3 Enhanced)
```typescript
{
  id: string;
  tokenId: string;
  title: string;
  documentType: 'will' | 'deed' | 'certificate' | 'contract' | 'other';
  ipfsHash: string;
  ipfsMetadataHash?: string;
  merkleRoot?: string;
  ethereumTxHash?: string;
  encryptedData: string;
  signature: string;
  createdAt: number;
}
```

---

## 🔐 CRYPTOGRAPHY USAGE

### Key Generation
```typescript
import { MaataraClient } from './src/utils/crypto';

const maatara = new MaataraClient(env);
const keyPair = await maatara.generateKeyPair("12-word mnemonic phrase");
```

### Document Encryption
```typescript
const encrypted = await maatara.encryptData(
  JSON.stringify(documentData),
  user.publicKey
);
```

### Digital Signatures
```typescript
const signature = await maatara.signData(
  JSON.stringify(assetMetadata),
  privateKey
);
```

---

## 🌐 WEB3 INTEGRATION

### IPFS Storage
```typescript
import { IPFSClient, createIPFSRecord } from './src/utils/ipfs';

const ipfs = new IPFSClient(env);
const record = await createIPFSRecord(
  ipfs,
  encryptedData,
  'application/json'
);
// Access via: record.gatewayUrl
```

### Ethereum Anchoring
```typescript
import { EthereumAnchoringClient } from './src/utils/ethereum';

const ethereum = new EthereumAnchoringClient(env);
const anchor = await ethereum.createEthereumAnchor(
  userId,
  privateKey,
  [ipfsHash, metadataHash]
);
```

---

## 🧪 TESTING

### Manual Testing with Demo
1. Visit `http://127.0.0.1:8787/demo`
2. Fill in test user ID and document data
3. Create Web3 asset and verify IPFS + Ethereum integration
4. Test asset retrieval and decryption

### API Testing with curl
```bash
# Health Check
curl http://127.0.0.1:8787/health

# Search Test
curl "http://127.0.0.1:8787/api/search?q=test"

# Create Asset Test (requires valid user data)
curl -X POST http://127.0.0.1:8787/api/web3-assets/create-web3 \
  -H "Content-Type: application/json" \
  -d '{"userId":"test_user","title":"Test Doc","documentData":{},"privateKey":"test_key"}'
```

---

## 📊 MONITORING

### Health Check Response
```json
{
  "status": "ok",
  "timestamp": 1727337600000
}
```

### Performance Monitoring
- Monitor response times on all endpoints
- Track IPFS upload/retrieval success rates
- Monitor Ethereum anchoring success rates
- Watch for crypto operation failures

### Error Patterns to Watch
- Maatara SDK initialization failures
- IPFS gateway timeouts
- Ethereum network connectivity issues
- Stripe payment processing errors

---

## 🔧 TROUBLESHOOTING

### Common Issues

#### "Cannot find module @maatara/core-pqc"
```bash
# Reinstall dependencies
npm install
# Or specifically install Maatara packages
npm install @maatara/core-pqc@0.2.3 @maatara/core-pqc-wasm@0.2.0
```

#### "IPFS Gateway timeout"
```bash
# Check IPFS_GATEWAY_URL in environment
# Verify Cloudflare Web3 gateway access
# Test with curl: curl https://cloudflare-ipfs.com/ipfs/QmTest...
```

#### "Ethereum anchoring failed"
```bash
# Verify ETHEREUM_RPC_URL is accessible
# Check ETHEREUM_PRIVATE_KEY is valid
# Ensure sufficient ETH balance for gas
```

#### "Stripe payment failed"
```bash
# Verify STRIPE_SECRET_KEY is correct
# Check webhook endpoint configuration
# Review Stripe dashboard for error details
```

### Debug Mode
```bash
# Enable debug logging
export DEBUG=veritas:*
npm run dev
```

---

## 🚀 DEPLOYMENT

### Pre-deployment Checklist
- [ ] All environment variables configured
- [ ] Domain and SSL certificates ready
- [ ] Cloudflare Web3 gateway access configured
- [ ] Stripe webhooks configured
- [ ] Error monitoring set up
- [ ] Performance monitoring configured
- [ ] Genesis block initialized (run `node initialize-genesis-block.js --secret=<admin-secret>` once per environment)

### Deployment Commands
```bash
# Deploy to production
wrangler deploy --env production

# Deploy with specific version
wrangler deploy --env production --name veritas-documents-v1

# Check deployment status
wrangler tail --env production
```

### Post-deployment Verification
```bash
# Test health endpoint
curl https://your-domain.com/health

# Test Web3 demo
curl https://your-domain.com/demo

# Verify API functionality
curl https://your-domain.com/api/search
```

---

## 📞 SUPPORT & MAINTENANCE

### Log Monitoring
```bash
# View live logs
wrangler tail --env production

# Filter for errors
wrangler tail --env production --format json | grep ERROR
```

### Performance Metrics
- **Target Response Time**: <200ms
- **Target Uptime**: 99.9%
- **Target Error Rate**: <0.1%

### Backup Strategy
- KV data is automatically replicated by Cloudflare
- IPFS provides distributed redundancy
- Ethereum anchors provide immutable backup
- Regular export of critical user data recommended

---

*Quick Reference Guide - Version 1.0*  
*Last Updated: September 26, 2025*  
*For technical support, refer to TECHNICAL_STATUS.md*