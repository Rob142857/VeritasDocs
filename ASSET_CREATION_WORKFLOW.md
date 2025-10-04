# Asset Creation Workflow - Veritas Documents

## Overview
Complete end-to-end workflow for creating and registering legal document assets with post-quantum cryptography and blockchain verification.

## System Status ✅

- **Production URL**: https://veritas-docs-production.rme-6e5.workers.dev
- **Deployment**: v`a6b49eba-e1aa-408b-92f7-81191396f5f3`
- **VDC Blockchain**: Block 4 (user registration complete)
- **Stripe Integration**: Fully configured with webhook
- **Zero-Knowledge PQC**: Kyber-768 + Dilithium-2 active

## Complete Asset Creation Flow

### 1. Client-Side Preparation
```
User fills asset form (title, description, document type, file)
  ↓
JavaScript encrypts document with user's Kyber-768 public key
  ↓
Creates SHA-256 hash of encrypted document
  ↓
Signs hash with user's Dilithium-2 private key
  ↓
Packages: {encryptedData, signature, signaturePayload}
```

### 2. Server-Side Validation
```
POST /api/web3-assets/create-web3
  ↓
Verify user exists and get public keys
  ↓
Verify Dilithium signature matches document hash
  ↓
Upload encrypted data to IPFS (via Pinata)
  ↓
Create asset metadata and upload to IPFS
  ↓
Generate Ethereum anchor (placeholder)
  ↓
Store asset in KV with paymentStatus: 'pending'
```

### 3. Payment Processing
```
Create Stripe checkout session ($25)
  ↓
Return checkout URL to client
  ↓
User completes payment on Stripe
  ↓
Stripe sends webhook: checkout.session.completed
```

### 4. Webhook Processing (NEW!)
```
POST /api/stripe/webhook
  ↓
Verify Stripe signature with STRIPE_WEBHOOK_SECRET
  ↓
Extract assetId and userId from session metadata
  ↓
Update asset: paymentStatus = 'completed'
  ↓
Move asset from pending to owned list
  ↓
CREATE VDC TRANSACTION:
  - Transaction ID: vdc_tx_{timestamp}_{random}
  - Type: asset_creation
  - Data: {assetId, tokenId, ownerId, ipfsHash, etc.}
  - Signatures: {user: original, system: pending}
  ↓
Store as vdc_pending_tx:{txId}
  ↓
Add to vdc_pending_transactions list
```

### 5. VDC Mining (Admin Action)
```
Admin calls: POST /api/vdc/mine
  with: x-admin-secret: {ADMIN_SECRET_KEY}
  ↓
VDC system retrieves all pending transactions
  ↓
Creates new block with system Dilithium signature
  ↓
Mines block and adds to blockchain
  ↓
Updates asset with vdcBlockNumber
  ↓
Asset now permanently registered! 🎉
```

### 6. User Notification
After mining completes:
- User receives email: "Asset registered on blockchain"
- Dashboard shows: vdcBlockNumber and transaction details
- Asset can be verified via VDC block explorer

## API Endpoints

### Asset Creation
```bash
POST /api/web3-assets/create-web3
Content-Type: application/json

{
  "userId": "user-id",
  "title": "My Legal Document",
  "description": "Last Will and Testament",
  "documentType": "will",
  "documentData": "{encrypted-json}",
  "signature": "dilithium-signature-base64url",
  "signaturePayload": "{documentHash, timestamp, userId}",
  "isPubliclySearchable": false
}

Response:
{
  "success": true,
  "message": "Asset created - redirecting to payment",
  "data": {
    "stripeUrl": "https://checkout.stripe.com/c/pay/cs_...",
    "sessionId": "cs_...",
    "asset": {
      "id": "asset_...",
      "tokenId": "VRT_...",
      "paymentStatus": "pending",
      ...
    }
  }
}
```

### Check Pending VDC Transactions
```bash
GET /api/vdc/pending

Response:
{
  "success": true,
  "data": {
    "count": 1,
    "transactions": [
      {
        "id": "vdc_tx_...",
        "type": "asset_creation",
        "timestamp": 1759530161662,
        "data": {...}
      }
    ]
  }
}
```

### Mine VDC Block
```bash
POST /api/vdc/mine
x-admin-secret: {ADMIN_SECRET_KEY}

Response:
{
  "success": true,
  "data": {
    "block": {
      "blockNumber": 5,
      "hash": "...",
      "transactions": [...]
    },
    "pendingTransactions": 0
  }
}
```

## Stripe Configuration

### Webhook Setup
1. Dashboard: https://dashboard.stripe.com/webhooks
2. Endpoint URL: `https://veritas-docs-production.rme-6e5.workers.dev/api/stripe/webhook`
3. Events: `checkout.session.completed`
4. Signing Secret: Stored in `STRIPE_WEBHOOK_SECRET`

### Required Secrets
```bash
STRIPE_SECRET_KEY         # sk_test_... or sk_live_...
STRIPE_WEBHOOK_SECRET     # whsec_...
```

## KV Storage Structure

### Assets
```
asset:{assetId}           → Full asset object with metadata
user_pending_assets:{userId} → Array of asset IDs pending payment
user_assets:{userId}      → Array of owned asset IDs after payment
```

### VDC Transactions
```
vdc_pending_tx:{txId}     → Pending VDC transaction awaiting mining
vdc_pending_transactions  → Array of pending transaction IDs
```

### Stripe Sessions
```
stripe_session:{sessionId} → Maps Stripe session to asset ID
```

## Security Features

### Zero-Knowledge Architecture
- Client generates Kyber-768 + Dilithium-2 keypairs in browser
- Private keys NEVER sent to server
- All document data encrypted before transmission
- Server only sees encrypted blobs and signatures

### Post-Quantum Cryptography
- **Kyber-768**: NIST-standardized KEM for encryption
- **Dilithium-2**: NIST-standardized signatures
- **WASM**: Ma'atara SDK v0.2.3 compiled to WebAssembly

### Dual Signature System
Every VDC transaction has TWO signatures:
1. **User Signature**: Created when asset is submitted
2. **System Signature**: Added by VDC when mining block

This ensures both user authorization AND system verification.

## User Experience Timeline

### Immediate (0-5 seconds)
- Asset encrypted locally
- Signature created
- Uploaded to server
- IPFS storage initiated

### Payment (5-30 seconds)
- Stripe checkout opens
- User completes payment
- Success page shows: "Processing - allow 24 hours"

### Webhook Processing (30-60 seconds)
- Stripe webhook received
- Asset marked as paid
- VDC transaction created and queued

### Mining (0-24 hours)
- Admin triggers mining manually or via cron
- VDC block mined with all pending transactions
- Asset permanently registered on blockchain

### Confirmation (24-48 hours)
- Email notification sent
- Dashboard updated with block number
- Asset verifiable via blockchain explorer

## Testing Checklist

- [ ] Login with real Dilithium signature works
- [ ] Asset creation form encrypts data client-side
- [ ] Stripe checkout session created (real URL)
- [ ] Payment completes successfully
- [ ] Webhook creates VDC transaction
- [ ] Pending transaction appears in /api/vdc/pending
- [ ] Mining creates block 5 with asset
- [ ] Asset shows vdcBlockNumber in dashboard
- [ ] Success page shows "24-hour processing" message

## Troubleshooting

### Asset not appearing in pending transactions
- Check Stripe webhook logs in Cloudflare Worker
- Verify STRIPE_WEBHOOK_SECRET is set correctly
- Test webhook endpoint: `POST /api/stripe/webhook` (should return "Missing signature")

### Mining fails
- Ensure ADMIN_SECRET_KEY is provided in request
- Check pending transactions count: `GET /api/vdc/pending`
- Review VDC system keys are properly configured

### Payment succeeds but no VDC transaction
- Check Stripe webhook is configured for `checkout.session.completed`
- Verify webhook endpoint URL is correct
- Check Cloudflare Worker logs during payment

## Next Steps

1. **Test Complete Flow**: Create new asset with real payment
2. **Verify VDC Transaction**: Check `/api/vdc/pending` after payment
3. **Mine Block**: Call `/api/vdc/mine` to create block 5
4. **Verify on Chain**: Check block 5 contains asset transaction
5. **Email Integration**: Add email notifications post-mining

## Production Readiness

✅ Zero-knowledge authentication working
✅ Real PQC (Kyber-768 + Dilithium-2) active
✅ Stripe integration complete with webhooks
✅ VDC blockchain operational (block 4)
✅ IPFS storage configured
✅ Ethereum anchoring (placeholder)
⏳ Waiting for first paid asset to test end-to-end

**Status**: Ready for production testing with real payments! 🚀
