/**
 * Migrate VDC Chain Blocks from KV to R2 + IPFS
 * 
 * This script:
 * 1. Scans KV for all chain blocks (vdc:block:*)
 * 2. Duplicates each block to R2 and IPFS
 * 3. Preserves dual signatures and metadata
 * 4. Updates block records with storage metadata
 * 
 * Safe to re-run (idempotent)
 */

const WORKER_URL = process.env.WORKER_URL || 'https://veritas-docs-production.rme-6e5.workers.dev';

async function migrateBlocks() {
  console.log('🚀 VDC Block Migration Script');
  console.log(`📍 Target: ${WORKER_URL}`);
  console.log('');

  try {
    // Step 1: Get blockchain stats
    console.log('📊 Fetching blockchain statistics...');
    const statsResponse = await fetch(`${WORKER_URL}/api/vdc/stats`);
    const statsResult = await statsResponse.json();

    if (!statsResult.success) {
      throw new Error('Failed to fetch blockchain stats');
    }

    const { totalBlocks, latestBlock } = statsResult.data;
    console.log(`✓ Found ${totalBlocks} blocks (latest: #${latestBlock.number})`);
    console.log('');

    // Step 2: Migrate each block
    console.log('🔄 Starting block migration...');
    let migrated = 0;
    let skipped = 0;
    let errors = 0;

    for (let blockNumber = 0; blockNumber < totalBlocks; blockNumber++) {
      try {
        // Fetch block details
        const blockResponse = await fetch(`${WORKER_URL}/api/vdc/block/${blockNumber}`);
        const blockResult = await blockResponse.json();

        if (!blockResult.success) {
          console.error(`❌ Block #${blockNumber}: Failed to fetch`);
          errors++;
          continue;
        }

        const block = blockResult.data;

        // Check if already migrated
        if (block.storage?.r2Key && block.ipfsHash) {
          console.log(`⏭️  Block #${blockNumber}: Already migrated (R2: ${block.storage.r2Key}, IPFS: ${block.ipfsHash})`);
          skipped++;
          continue;
        }

        // Migrate block
        console.log(`🔄 Block #${blockNumber}: Migrating to R2 + IPFS...`);
        const migrateResponse = await fetch(`${WORKER_URL}/api/vdc/migrate-block/${blockNumber}`, {
          method: 'POST'
        });

        const migrateResult = await migrateResponse.json();

        if (migrateResult.success) {
          console.log(`✅ Block #${blockNumber}: Migrated successfully`);
          console.log(`   R2: ${migrateResult.data.r2Key}`);
          console.log(`   IPFS: ${migrateResult.data.ipfsHash || 'pending'}`);
          console.log(`   Gateway: ${migrateResult.data.ipfsGatewayUrl || 'N/A'}`);
          migrated++;
        } else {
          console.error(`❌ Block #${blockNumber}: Migration failed - ${migrateResult.error}`);
          errors++;
        }
      } catch (error) {
        console.error(`❌ Block #${blockNumber}: Unexpected error - ${error.message}`);
        errors++;
      }

      // Brief pause to avoid rate limiting
      if (blockNumber < totalBlocks - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Summary
    console.log('');
    console.log('📊 Migration Summary:');
    console.log(`   Total blocks: ${totalBlocks}`);
    console.log(`   ✅ Migrated: ${migrated}`);
    console.log(`   ⏭️  Skipped (already migrated): ${skipped}`);
    console.log(`   ❌ Errors: ${errors}`);
    console.log('');

    if (errors > 0) {
      console.log('⚠️  Some blocks failed to migrate. Review errors above.');
      process.exit(1);
    } else {
      console.log('🎉 Migration completed successfully!');
    }
  } catch (error) {
    console.error('💥 Fatal error:', error.message);
    process.exit(1);
  }
}

// Run migration
migrateBlocks().catch(error => {
  console.error('💥 Unhandled error:', error);
  process.exit(1);
});
