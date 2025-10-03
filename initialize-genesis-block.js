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

const PRODUCTION_URL = 'https://veritas-docs-production.rme-6e5.workers.dev';

async function initializeGenesisBlock() {
  console.log('🎉 Initializing Veritas Documents Chain (VDC) Genesis Block\n');
  
  try {
    console.log('📡 Calling worker to create genesis block...');
    console.log(`   URL: ${PRODUCTION_URL}/api/vdc/initialize-genesis\n`);
    
    const response = await fetch(`${PRODUCTION_URL}/api/vdc/initialize-genesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();

    if (result.success) {
      console.log('✅ GENESIS BLOCK CREATED SUCCESSFULLY!\n');
      console.log('Genesis Block Details:');
      console.log('─────────────────────────────────────────────────────');
      console.log(`Block Number: ${result.data.blockNumber}`);
      console.log(`Block Hash: ${result.data.hash}`);
      console.log(`IPFS Hash: ${result.data.ipfsHash || 'Not uploaded yet'}`);
      console.log(`Timestamp: ${new Date(result.data.timestamp).toISOString()}`);
      console.log(`Merkle Root: ${result.data.merkleRoot}`);
      console.log(`Transactions: ${result.data.transactions.length}`);
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
      console.log(`   curl ${PRODUCTION_URL}/api/vdc/stats\n`);
      
    } else {
      console.error('❌ Failed to create genesis block:');
      console.error(`   Error: ${result.error || result.message}\n`);
      process.exit(1);
    }
    
  } catch (error) {
    console.error('❌ Error initializing genesis block:');
    console.error(`   ${error.message}\n`);
    
    if (error.message.includes('Genesis block already exists')) {
      console.log('ℹ️  Genesis block has already been initialized.');
      console.log('   You can check the chain status with:');
      console.log(`   curl ${PRODUCTION_URL}/api/vdc/stats\n`);
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
