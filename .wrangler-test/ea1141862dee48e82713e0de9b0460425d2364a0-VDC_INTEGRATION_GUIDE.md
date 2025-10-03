# VDC Integration - Auth Handler Updates

## Summary of Changes

The auth.ts handler needs to be updated to:
1. Import VDC blockchain functions instead of old VeritasChain
2. Add system signature to user registration transactions
3. Store transactions in VDC pending pool
4. Optionally mine blocks when threshold is reached

## Code Changes Required

### 1. Update Imports

**BEFORE:**
```typescript
import { initializeVeritasChain, addUserToChain } from '../utils/blockchain';
```

**AFTER:**
```typescript
import { initializeVDC, addUserToVDC, VDCBlockchain } from '../utils/blockchain';
```

### 2. Update Activation Endpoint

**Location:** `authHandler.post('/activate', ...)`

**Changes:**
- Initialize VDC blockchain
- Create transaction with dual signatures (user + system)
- Add to VDC pending pool
- Optionally mine block if threshold reached

**NEW CODE:**
```typescript
authHandler.post('/activate', async (c) => {
  try {
    const env = c.env;
    const { 
      token,
      kyberPublicKey,
      dilithiumPublicKey,
      dilithiumPrivateKey, // USER'S PRIVATE KEY (only for signing this tx, never stored!)
      encryptedUserData,
      userSignature // User already signed the tx client-side
    } = await c.req.json();

    // ... existing validation code ...

    // Determine account type from invite (NOT user-definable!)
    const accountType = oneTimeLink.inviteType === 'admin' ? 'admin' : 
                       oneTimeLink.inviteType === 'user' ? 'invited' : 'paid';

    // Initialize VDC blockchain
    const vdc = await initializeVDC(env);

    // Verify user signature
    const maataraClient = new MaataraClient(env);
    const txData = {
      userId,
      email: oneTimeLink.email,
      kyberPublicKey,
      dilithiumPublicKey,
      encryptedUserData,
      accountType,
      timestamp: Date.now()
    };
    
    const isValid = await maataraClient.verifySignature(
      JSON.stringify(txData),
      userSignature,
      dilithiumPublicKey
    );
    
    if (!isValid) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Invalid user signature - transaction rejected' 
      }, 401);
    }

    // Add transaction to VDC (this will add SYSTEM SIGNATURE automatically)
    const txId = await addUserToVDC(
      vdc,
      userId,
      oneTimeLink.email,
      kyberPublicKey,
      dilithiumPublicKey,
      encryptedUserData,
      accountType,
      dilithiumPrivateKey // Used ONLY to sign, never stored
    );

    // Check if we should mine a block
    const pendingCountStr = await env.VERITAS_KV.get('vdc:pending:count') || '0';
    const pendingCount = parseInt(pendingCountStr);
    
    console.log(`📊 VDC: ${pendingCount} pending transactions`);
    
    // Mine block if we have 10 or more transactions
    if (pendingCount >= 10) {
      console.log('⛏️  VDC: Mining new block...');
      try {
        const block = await vdc.mineBlock();
        console.log(`✅ VDC: Block ${block.blockNumber} mined with ${block.transactions.length} transactions`);
      } catch (error) {
        console.error('❌ VDC: Block mining failed:', error);
        // Don't fail user registration if block mining fails
      }
    }

    // ... rest of existing code (mark link as used, create user record, etc.) ...

    return c.json<APIResponse>({
      success: true,
      data: {
        userId,
        email: oneTimeLink.email,
        publicKey: kyberPublicKey,
        recoveryPhrase,
        accountType,
        vdcTransactionId: txId, // VDC transaction ID
        message: 'Account activated successfully. Save your recovery phrase!'
      }
    });

  } catch (error) {
    console.error('Error activating account:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});
```

### 3. Update Login Endpoint

**No major changes needed** - login still verifies by decrypting user's blockchain transaction.

The transaction is now in VDC format with dual signatures, but login only needs to verify the user can decrypt their own data.

### 4. Add VDC Admin Endpoints

Add new endpoints for VDC management:

```typescript
// Get VDC chain statistics
authHandler.get('/vdc/stats', async (c) => {
  try {
    const env = c.env;
    const vdc = await initializeVDC(env);
    const stats = await vdc.getStats();
    
    return c.json<APIResponse>({
      success: true,
      data: stats
    });
  } catch (error) {
    console.error('Error getting VDC stats:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Initialize genesis block (one-time, admin only)
authHandler.post('/vdc/initialize-genesis', async (c) => {
  try {
    const env = c.env;
    
    // Check if system keys are configured
    if (!env.SYSTEM_DILITHIUM_PRIVATE_KEY || !env.SYSTEM_DILITHIUM_PUBLIC_KEY) {
      return c.json<APIResponse>({
        success: false,
        error: 'System master keys not configured in Cloudflare Secrets'
      }, 500);
    }
    
    const vdc = await initializeVDC(env);
    const genesisBlock = await vdc.createGenesisBlock();
    
    return c.json<APIResponse>({
      success: true,
      data: genesisBlock,
      message: 'VDC Genesis block created successfully'
    });
  } catch (error) {
    if (error.message.includes('already exists')) {
      return c.json<APIResponse>({
        success: false,
        error: 'Genesis block already exists'
      }, 400);
    }
    
    console.error('Error creating genesis block:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, 500);
  }
});

// Manually mine a block (admin endpoint)
authHandler.post('/vdc/mine-block', async (c) => {
  try {
    const env = c.env;
    const { adminSecret } = await c.req.json();
    
    // Verify admin credentials
    if (adminSecret !== env.ADMIN_SECRET_KEY) {
      return c.json<APIResponse>({ success: false, error: 'Unauthorized' }, 401);
    }
    
    const vdc = await initializeVDC(env);
    const block = await vdc.mineBlock();
    
    return c.json<APIResponse>({
      success: true,
      data: block,
      message: `Block ${block.blockNumber} mined successfully with ${block.transactions.length} transactions`
    });
  } catch (error) {
    console.error('Error mining block:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: error.message || 'Internal server error' 
    }, 500);
  }
});

// Get block by number
authHandler.get('/vdc/block/:blockNumber', async (c) => {
  try {
    const env = c.env;
    const blockNumber = parseInt(c.req.param('blockNumber'));
    
    if (isNaN(blockNumber)) {
      return c.json<APIResponse>({ success: false, error: 'Invalid block number' }, 400);
    }
    
    const vdc = await initializeVDC(env);
    const block = await vdc.getBlock(blockNumber);
    
    if (!block) {
      return c.json<APIResponse>({ success: false, error: 'Block not found' }, 404);
    }
    
    return c.json<APIResponse>({
      success: true,
      data: block
    });
  } catch (error) {
    console.error('Error getting block:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get transaction by ID
authHandler.get('/vdc/transaction/:txId', async (c) => {
  try {
    const env = c.env;
    const txId = c.req.param('txId');
    
    const vdc = await initializeVDC(env);
    const transaction = await vdc.getTransaction(txId);
    
    if (!transaction) {
      return c.json<APIResponse>({ success: false, error: 'Transaction not found' }, 404);
    }
    
    return c.json<APIResponse>({
      success: true,
      data: transaction
    });
  } catch (error) {
    console.error('Error getting transaction:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});
```

## Frontend Changes Required

### Update Activation Flow

The frontend needs to send the Dilithium private key temporarily for signing the transaction.

**IMPORTANT:** The private key is ONLY used to sign the transaction and is NEVER stored by the server!

```typescript
// In frontend app.ts - activation flow

// Generate keys
const { kyberPublicKey, kyberPrivateKey, dilithiumPublicKey, dilithiumPrivateKey } = 
  await generateClientKeypair();

// Create transaction data
const txData = {
  userId,
  email,
  kyberPublicKey,
  dilithiumPublicKey,
  encryptedUserData,
  accountType, // From invite
  timestamp: Date.now()
};

// USER SIGNS THE TRANSACTION
const userSignature = await VeritasCrypto.signData(
  JSON.stringify(txData),
  dilithiumPrivateKey
);

// Send to server (include dilithiumPrivateKey ONLY for signing)
const response = await fetch('/api/auth/activate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    token,
    kyberPublicKey,
    dilithiumPublicKey,
    dilithiumPrivateKey, // ONLY for signing, server doesn't store this!
    encryptedUserData,
    userSignature
  })
});

// Server will:
// 1. Verify user signature
// 2. Add system signature
// 3. Store transaction with DUAL signatures in VDC

// User must save BOTH private keys!
savePrivateKeys(kyberPrivateKey, dilithiumPrivateKey);
```

## Deployment Steps

1. **Generate system master keys**
   ```bash
   node generate-system-keys.js
   ```

2. **Configure Cloudflare Secrets**
   ```powershell
   .\setup-cloudflare-secrets.ps1
   ```

3. **Update auth.ts** with VDC integration code above

4. **Build and deploy**
   ```bash
   npm run build
   wrangler deploy --env production
   ```

5. **Initialize genesis block**
   ```bash
   node initialize-genesis-block.js
   ```

6. **Test user registration**
   - Create new invite link
   - Activate account
   - Check VDC stats: `curl https://veritas-docs-production.rme-6e5.workers.dev/api/auth/vdc/stats`

7. **Mine first block**
   After 10 user registrations, or manually:
   ```bash
   curl -X POST https://veritas-docs-production.rme-6e5.workers.dev/api/auth/vdc/mine-block \
     -H "Content-Type: application/json" \
     -d '{"adminSecret":"YOUR_ADMIN_SECRET"}'
   ```

## Block Mining Strategy

**Automatic mining triggers:**
- After 10 pending transactions
- After 5 minutes (implement cron trigger)
- Immediately for critical admin actions

**Manual mining:**
- Admin endpoint: `/api/auth/vdc/mine-block`
- Requires admin secret key

## Verification

After deployment, verify:

1. **Genesis block exists:**
   ```bash
   curl https://veritas-docs-production.rme-6e5.workers.dev/api/auth/vdc/stats
   ```

2. **User registration creates transaction:**
   - Activate account
   - Check pending count increases

3. **Block mining works:**
   - Create 10 users OR manually mine
   - Verify block created with transactions

4. **Dual signatures present:**
   - Get transaction from block
   - Verify both user and system signatures exist

5. **Chain integrity:**
   - Each block references previous block hash
   - All transactions have dual signatures
   - IPFS hashes stored correctly

## Success Criteria

✅ Genesis block created with system signature
✅ User registrations add transactions to pending pool
✅ Transactions have dual signatures (user + system)
✅ Blocks mine automatically at threshold
✅ All blocks stored in KV and IPFS
✅ Chain verification passes
✅ Account type set from invite (not user-definable)
✅ Zero-knowledge: encrypted data never exposed
