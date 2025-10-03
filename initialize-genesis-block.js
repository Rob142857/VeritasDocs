/**
 * Initialize Genesis Block for Veritas Documents Chain (VDC)
 * 
 * This script creates the first block (Block 0) in the VDC blockchain.
 * 
 * Prerequisites:
 * - System master keys must be configured in Cloudflare Secrets
 * - Worker must be deployed to production
 * 
 * Usage:
 *   node initialize-genesis-block.js
 */

const DEFAULT_PRODUCTION_URL = 'https://veritas-docs-production.rme-6e5.workers.dev';

function parseArg(prefix) {
  const arg = process.argv.find((value) => value.startsWith(prefix));
  if (!arg) return undefined;
  const [, ...parts] = arg.split('=');
  if (parts.length === 0) return undefined;
  return parts.join('=');
}

function resolveBaseUrl() {
  const cliUrl = parseArg('--url=');
  const envUrl = process.env.VDC_API_BASE;
  const baseUrl = cliUrl || envUrl || DEFAULT_PRODUCTION_URL;
  return baseUrl.replace(/\/$/, '');
}

function resolveAdminSecret() {
  const cliSecret = parseArg('--secret=');
  const envSecret = process.env.ADMIN_SECRET_KEY || process.env.VERITAS_ADMIN_SECRET;
  const secret = (cliSecret || envSecret || '').trim();

  if (!secret) {
    console.error('❌ ADMIN SECRET REQUIRED');
    console.error('   Provide the admin secret via --secret="<value>" or set ADMIN_SECRET_KEY / VERITAS_ADMIN_SECRET environment variable.');
    process.exit(1);
  }

  return secret;
}

async function initializeGenesisBlock() {
  console.log('🎉 Initializing Veritas Documents Chain (VDC) Genesis Block\n');

  const baseUrl = resolveBaseUrl();
  const adminSecret = resolveAdminSecret();
  const endpoint = `${baseUrl}/api/vdc/initialize-genesis`;
  
  try {
    console.log('📡 Calling worker to create genesis block...');
    console.log(`   URL: ${endpoint}\n`);
    
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Admin-Secret': adminSecret
      },
      body: JSON.stringify({
        reason: 'initialize_genesis_block',
        requestedAt: new Date().toISOString()
      })
    });

    const contentType = response.headers.get('content-type') || '';
    const isJson = contentType.includes('application/json');
    const result = isJson ? await response.json() : await response.text();

    if (!response.ok || (isJson && result && result.success === false)) {
      const errorMessage = isJson
        ? (result?.error || result?.message || `HTTP ${response.status}`)
        : `HTTP ${response.status}: ${result}`;

      throw new Error(errorMessage);
    }

    const payload = isJson ? result : { data: null };
    const block = payload?.data?.block || payload?.data || null;

    if (payload?.success !== false) {
      console.log('✅ GENESIS BLOCK CREATED SUCCESSFULLY!\n');
      console.log('Genesis Block Details:');
      console.log('─────────────────────────────────────────────────────');
      console.log(`Block Number: ${block?.blockNumber ?? 'unknown'}`);
      console.log(`Block Hash: ${block?.hash ?? 'unknown'}`);
      console.log(`IPFS Hash: ${block?.ipfsHash || 'Not uploaded yet'}`);
      console.log(`Timestamp: ${block?.timestamp ? new Date(block.timestamp).toISOString() : 'n/a'}`);
      console.log(`Merkle Root: ${block?.merkleRoot ?? 'n/a'}`);
      console.log(`Transactions: ${Array.isArray(block?.transactions) ? block.transactions.length : 0}`);
      console.log('─────────────────────────────────────────────────────\n');
      
      console.log('📊 Chain Status:');
      console.log(`   Chain Name: VeritasByMaataraBlockChain (VDC)`);
      console.log(`   Total Blocks: 1 (genesis)`);
      console.log(`   Status: Initialized and ready for transactions\n`);
      
      console.log('🎯 NEXT STEPS:\n');
      console.log('1. Create user registrations (they will be added as transactions)');
      console.log('2. When enough transactions accumulate, mine Block 1');
      console.log('3. Continue adding transactions and mining blocks\n');
      
      console.log('📝 To check chain status:');
      console.log(`   curl ${baseUrl}/api/vdc/stats -H "X-Admin-Secret: <admin-secret>"\n`);
      
    } else {
      console.error('❌ Failed to create genesis block:');
      console.error(`   Error: ${payload?.error || payload?.message || 'Unknown error'}\n`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error initializing genesis block:');
    console.error(`   ${error.message}\n`);
    
    if (error.message.includes('Genesis block already exists')) {
      console.log('ℹ️  Genesis block has already been initialized.');
      console.log('   You can check the chain status with:');
      console.log(`   curl ${baseUrl}/api/vdc/stats -H "X-Admin-Secret: <admin-secret>"\n`);
    }
    
    process.exit(1);
  }
}

// Run the script
initializeGenesisBlock()
  .then(() => {
    console.log('✅ Genesis block initialization complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Fatal error:', error);
    process.exit(1);
  });
