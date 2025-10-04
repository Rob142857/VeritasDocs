# VDC Block Mining Flow & Storage Architecture

## Overview
Complete data flow from pending transaction creation through block mining, with **KV as source of truth** and R2+IPFS as secondary/archival storage.

---

## Storage Architecture

### Storage Tiers
1. **KV (Cloudflare Key-Value)**
   - **Role**: Source of truth, primary read path
   - **Speed**: Sub-millisecond lookups
   - **Use**: All active blockchain data, transaction indexes, user lookups
   
2. **R2 (Cloudflare Object Storage)**
   - **Role**: Durable cloud backup, archival storage
   - **Speed**: ~100ms reads
   - **Use**: Long-term storage, disaster recovery, bulk operations
   
3. **IPFS (Pinata)**
   - **Role**: Decentralized verification, content-addressed storage
   - **Speed**: Variable (1-5s typical)
   - **Use**: Public verifiability, immutable proof, external validation

### Storage Policies

| Data Type | KV | R2 | IPFS | Encryption | Purpose |
|-----------|----|----|------|------------|---------|
| **Chain Blocks** | ✅ Primary | ✅ Backup | ✅ Proof | None (public) | Blockchain integrity |
| **Pending Transactions** | ❌ Legacy only | ✅ Primary | ❌ | System Kyber | Pre-mining queue |
| **Documents** | ❌ | ✅ | ✅ | User Kyber | User data storage |
| **Activation Tokens** | ❌ | ✅ | ❌ | System Kyber | Account setup |
| **User Metadata** | ✅ | ❌ | ❌ | User Kyber | Fast lookups |

---

## Block Mining Flow (Step-by-Step)

### Phase 1: Pending Transaction Creation
```
User Action (e.g., payment completed)
    ↓
🔒 Encrypt transaction with System Kyber key
    ↓
📦 Store in R2: pending/{txId}.json
    ↓
📝 Update KV: vdc:pending:count
    ↓
✅ Transaction pending mining
```

**Key Points:**
- Pending transactions are **encrypted** (contains payment info, user IDs)
- Stored **only in R2** (not KV, not IPFS yet)
- System automatically decrypts when fetching for mining

### Phase 2: Mining Trigger
```
Admin clicks "Approve (Sign and Mine Block)"
    OR
Automated mining cron job
    ↓
Call POST /api/vdc/mine
```

### Phase 3: Block Construction
```
1. 📥 Fetch Pending Transactions
   └── Read all files from R2: pending/*.json
   └── Decrypt each with System Kyber private key
   └── Sort by timestamp (oldest first)
   
2. 🔗 Get Previous Block
   └── Read KV: vdc:latest
   └── Get previous block hash
   
3. 🏗️ Build Block Structure
   {
     blockNumber: N,
     timestamp: now,
     previousHash: "...",
     hash: "", // calculated next
     transactions: [...],
     merkleRoot: "...",
     blockSignature: {...}
   }
   
4. 🔐 Calculate Block Hash
   └── SHA-256 of block data
   
5. ✍️ Sign Block
   └── Dilithium-2 signature with System master key
```

### Phase 4: **CRITICAL - Block Persistence** ⚠️
```
🚨 PERSIST BLOCK FIRST (before clearing pending!)
    ↓
Call storeChainBlock(env, blockNumber, block)
    ↓
┌─────────────────────────────────────┐
│  Unified Storage Layer (store.ts)   │
├─────────────────────────────────────┤
│  1. Store in R2                     │
│     └── blocks/{blockNumber}.json  │
│  2. Store in IPFS (Pinata)          │
│     └── Pin + get CID hash          │
│  3. Store in KV                     │
│     └── vdc:block:{blockNumber}    │
└─────────────────────────────────────┘
    ↓
✅ Block durably stored in ALL tiers
    ↓
⚠️ IF ANY STORAGE FAILS → THROW ERROR
   └── Pending transactions remain intact
   └── User can retry mining safely
```

**Why This Order Matters:**
- ✅ **Safe**: If IPFS fails, pending transactions are NOT deleted
- ✅ **Atomic**: Either full success or full rollback
- ❌ **Old Way**: Deleted pending → IPFS failed → DATA LOSS! 

### Phase 5: Post-Mining Cleanup
```
✅ Block successfully persisted in KV + R2 + IPFS
    ↓
📝 Update KV: vdc:latest
   {
     blockNumber: N,
     hash: "...",
     ipfsHash: "QmXXX...",
     timestamp: ...
   }
    ↓
🏷️ Index Transactions in KV
   └── For each tx: vdc:tx:{txId} → { blockNumber, ... }
   └── Update assets: asset:{assetId} → vdcBlockNumber = N
    ↓
🧹 Clear Pending Transactions from R2
   └── Delete all pending/*.json files
   └── Set KV: vdc:pending:count = 0
    ↓
🎉 Block mined successfully!
```

---

## Data Flow Diagram

```
┌─────────────────────┐
│   Payment Event     │
│  (Stripe Webhook)   │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │  Create Tx   │
    │ (encrypted)  │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │  R2 Storage  │  pending/{txId}.json
    │ (System Key) │  🔒 Encrypted
    └──────────────┘
           │
           │ (Mining triggered)
           ▼
    ┌──────────────┐
    │ Fetch & Decrypt │
    └──────┬───────┘
           │
           ▼
    ┌──────────────┐
    │ Build Block  │
    │ + Sign       │
    └──────┬───────┘
           │
           ▼
    ┌──────────────────────────────┐
    │   PERSIST BLOCK (Critical!)  │
    ├──────────────────────────────┤
    │  KV:   vdc:block:N           │
    │  R2:   blocks/N.json         │
    │  IPFS: QmXXX... (pinned)     │
    └──────┬───────────────────────┘
           │
           ▼ (Only after success!)
    ┌──────────────┐
    │  Clear R2    │
    │  Pending Tx  │
    └──────────────┘
```

---

## Storage Verification & Rehydration

### New Admin Endpoints

#### 1. **Quick Status Check** (Fast)
```bash
GET /api/storage-verify/status
Headers: x-admin-secret: YOUR_SECRET

# Response:
{
  "totalBlocks": 8,
  "blocks": [
    {
      "blockNumber": 0,
      "kv": true,
      "r2": true,
      "ipfs": "QmQG1StkEe3sg4a4yph19ryswseTTJ1i5GGCiwrkqTpZBP",
      "complete": true
    },
    ...
  ],
  "summary": {
    "complete": 8,
    "incomplete": 0
  }
}
```

**Use**: Quick dashboard overview, no rehydration

#### 2. **Verify Single Block** (With Rehydration)
```bash
POST /api/storage-verify/verify/3
Headers: x-admin-secret: YOUR_SECRET

# Response:
{
  "blockNumber": 3,
  "kv": { "present": true, "hash": "abc123..." },
  "r2": { "present": true, "hash": "abc123..." },
  "ipfs": { "present": true, "hash": "abc123..." },
  "rehydrated": {},
  "status": "ok",
  "message": "Block present in all storage tiers"
}
```

**Rehydration Logic:**
1. Check all 3 tiers
2. If any missing → use KV as source (or R2, or IPFS if available)
3. Rehydrate missing tiers from available source
4. Return what was fixed

#### 3. **Verify All Blocks** (Full System Scan)
```bash
POST /api/storage-verify/verify-all
Headers: x-admin-secret: YOUR_SECRET

# Response:
{
  "totalBlocks": 8,
  "verified": 7,      # All 3 tiers present
  "rehydrated": 1,    # Fixed missing tier(s)
  "failed": 0,        # No source available
  "results": [...],   # Per-block details
  "duration": 15432   # ms
}
```

**Use**: Full integrity check, auto-fix missing data

---

## Verification States

| Status | Meaning | KV | R2 | IPFS | Action |
|--------|---------|----|----|------|--------|
| **ok** | Perfect | ✅ | ✅ | ✅ | None |
| **partial** | Some missing | ✅ | ❌ | ✅ | None (optional) |
| **rehydrated** | Auto-fixed | ✅ | ✅* | ✅* | Restored from source |
| **failed** | Data lost | ❌ | ❌ | ❌ | Manual recovery needed |

*\* Rehydrated tier restored from another tier*

---

## Rehydration Priority

When a block is missing from one or more tiers:

1. **Source Priority**: KV → R2 → IPFS
   - Always prefer KV (source of truth)
   - Fall back to R2 if KV missing
   - Last resort: IPFS

2. **Restoration Order**:
   1. **KV** (critical - source of truth)
   2. **R2** (backup, fast access)
   3. **IPFS** (public proof, content-addressed)

3. **IPFS Special Handling**:
   - If missing → re-pin using `storeChainBlock()`
   - Updates KV block with new IPFS hash
   - Ensures block has `ipfsHash` and `ipfsGatewayUrl`

---

## Mining Safety Guarantees

### ✅ What's Safe
- Mining can be retried if it fails
- Pending transactions never lost (persisted in R2)
- Block storage is atomic (all-or-nothing)
- IPFS failures block mining (no silent data loss)

### ❌ What's NOT Safe (Old Implementation)
- ~~Deleting pending before confirming block storage~~
- ~~Soft-fail IPFS (mock hashes)~~
- ~~No verification of storage success~~

### 🔒 Current Protections
1. **Persist block FIRST** (KV + R2 + IPFS)
2. **Throw error if any tier fails** (critical enforcement)
3. **Clear pending LAST** (only after success)
4. **Detailed logging** (can trace every step)
5. **Idempotent mining** (safe to retry)

---

## Example: Complete Mining Cycle

```typescript
// 1. User pays for document
POST /api/stripe/webhook
  → Creates encrypted pending transaction in R2

// 2. Admin approves
POST /api/vdc/mine
  ⛏️  Mining block with 3 pending transactions...
  💾 Persisting block #8 to all storage tiers...
  
  // CRITICAL SECTION (atomic)
  ✅ Stored in R2: blocks/8.json
  ✅ Pinned to IPFS: QmY5hKmZ...
  ✅ Stored in KV: vdc:block:8
  
  ✅ Block #8 persisted successfully, now safe to clear pending
  🧹 Clearing 3 pending transactions from R2...
  
  🎉 VDC: Block #8 mined successfully!
     Hash: a23a665c...
     IPFS: QmY5hKmZ...
     R2: blocks/8.json
     Transactions: 3

// 3. Verify integrity
POST /api/storage-verify/verify/8
  {
    "blockNumber": 8,
    "kv": { "present": true },
    "r2": { "present": true },
    "ipfs": { "present": true, "hash": "QmY5hKmZ..." },
    "status": "ok"
  }
```

---

## Monitoring & Maintenance

### Daily Health Checks
```bash
# Quick status
curl -H "x-admin-secret: SECRET" \
  https://veritas-docs-production.rme-6e5.workers.dev/api/storage-verify/status

# Full verification (weekly)
curl -X POST -H "x-admin-secret: SECRET" \
  https://veritas-docs-production.rme-6e5.workers.dev/api/storage-verify/verify-all
```

### Metrics to Track
- **Block count**: Should match across all tiers
- **IPFS hashes**: All should start with `Qm` (no mock hashes)
- **Pending count**: Should be low (< 10 normally)
- **Mining failures**: Should be zero
- **Rehydration events**: Investigate if frequent

### Disaster Recovery
1. **KV lost**: Restore from R2 or IPFS
2. **R2 lost**: Restore from KV (source of truth)
3. **IPFS lost**: Re-pin all blocks from KV
4. **All lost**: CATASTROPHIC - restore from Cloudflare backups

---

## Best Practices

### For Developers
1. ✅ Always use `storeChainBlock()` for block storage
2. ✅ Never delete pending transactions before block persists
3. ✅ Check `storageResult.success` before continuing
4. ✅ Log all storage operations
5. ✅ Use verification endpoints regularly

### For Operations
1. 🔍 Run weekly full verification
2. 📊 Monitor IPFS pin count in Pinata dashboard
3. 🔄 Set up automated rehydration if needed
4. 📝 Review mining logs for failures
5. 💾 Backup KV namespace regularly

### For Auditors
1. 🔐 All blocks have dual signatures (user + system)
2. 🌐 All blocks publicly verifiable via IPFS
3. 🔗 Chain integrity: previousHash links all blocks
4. 📦 Storage redundancy: 3 independent copies
5. 🔍 Verification API for compliance checks

---

## Implementation Date
**October 4, 2025**

**Version**: 16162c85-f2cc-49e7-bc9d-22e79ec450bf

**Status**: ✅ Production Ready

- [x] Unified storage layer implemented
- [x] Critical IPFS enforcement enabled
- [x] Mining flow uses atomic persistence
- [x] Verification endpoints deployed
- [x] Rehydration system operational
- [x] All 8 existing blocks migrated to IPFS
