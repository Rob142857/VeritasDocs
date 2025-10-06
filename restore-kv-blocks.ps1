# Restore missing KV block pointers by reading from R2
# This script reads blocks from R2 and restores them to KV

$KV_NAMESPACE_ID = "9f0ea31309cd44cab7bfe3569e16aa45"
$R2_BUCKET_NAME = "veritas-docs-production-storage"

Write-Host "📋 Configuration:" -ForegroundColor Cyan
Write-Host "   KV Namespace: $KV_NAMESPACE_ID"
Write-Host "   R2 Bucket: $R2_BUCKET_NAME"
Write-Host ""

Write-Host "🚀 Starting KV restoration process..." -ForegroundColor Green
Write-Host ""

# Array of known block numbers to restore (from user's IPFS listing)
# We'll try blocks 0-15 to be safe
$blockNumbers = 0..15

$restoredCount = 0
$latestBlock = $null

foreach ($blockNumber in $blockNumbers) {
    Write-Host "📦 Processing block $blockNumber..." -ForegroundColor Yellow
    
    # Try to get block from R2
    $r2Key = "blocks/$blockNumber.json"
    
    try {
        # Get block from R2 (use --remote to access production storage)
        $blockJson = npx wrangler r2 object get "$R2_BUCKET_NAME/$r2Key" --remote --pipe 2>$null
        
        if ($LASTEXITCODE -eq 0 -and $blockJson) {
            $blockData = $blockJson | ConvertFrom-Json
            
            # Handle StoredObject wrapper
            if ($blockData.data) {
                $block = $blockData.data
            } else {
                $block = $blockData
            }
            
            Write-Host "   ✅ Found block $blockNumber in R2" -ForegroundColor Green
            
            # 1. Store the block in KV using a temp file to avoid command-line escaping issues
            $kvKey = "vdc:block:$blockNumber"
            $tempFile = "temp_block_$blockNumber.json"
            
            $block | ConvertTo-Json -Depth 10 | Out-File -FilePath $tempFile -Encoding UTF8 -NoNewline
            
            Write-Host "   💾 Writing $kvKey to KV..." -ForegroundColor Cyan
            npx wrangler kv key put $kvKey --path $tempFile --namespace-id $KV_NAMESPACE_ID 2>&1 | Out-Null
            
            Remove-Item $tempFile -ErrorAction SilentlyContinue
            
            if ($LASTEXITCODE -eq 0) {
                Write-Host "   ✅ Block $blockNumber stored in KV" -ForegroundColor Green
                $restoredCount++
                
                # Track latest block
                if (-not $latestBlock -or $block.blockNumber -gt $latestBlock.blockNumber) {
                    $latestBlock = $block
                }
                
                # 2. Index all transactions
                if ($block.transactions) {
                    Write-Host "   🔖 Indexing $($block.transactions.Count) transactions..." -ForegroundColor Cyan
                    
                    foreach ($tx in $block.transactions) {
                        $txKey = "vdc:tx:$($tx.id)"
                        $txIndex = @{
                            blockNumber = $block.blockNumber
                            blockHash = $block.hash
                            txId = $tx.id
                            type = $tx.type
                            timestamp = $tx.timestamp
                        }
                        
                        $tempTxFile = "temp_tx_$($tx.id).json"
                        $txIndex | ConvertTo-Json -Compress | Out-File -FilePath $tempTxFile -Encoding UTF8 -NoNewline
                        
                        npx wrangler kv key put $txKey --path $tempTxFile --namespace-id $KV_NAMESPACE_ID 2>&1 | Out-Null
                        Remove-Item $tempTxFile -ErrorAction SilentlyContinue
                        
                        if ($LASTEXITCODE -eq 0) {
                            Write-Host "      ✅ Indexed tx: $($tx.id)" -ForegroundColor Gray
                        }
                    }
                }
            } else {
                Write-Host "   ❌ Failed to write block to KV" -ForegroundColor Red
            }
            
            Write-Host ""
        } else {
            Write-Host "   ⚠️  Block $blockNumber not found in R2 (skipping)" -ForegroundColor Gray
        }
    }
    catch {
        Write-Host "   ⚠️  Error processing block ${blockNumber}: $_" -ForegroundColor Gray
    }
}

# Update vdc:latest pointer
if ($latestBlock) {
    Write-Host "🔖 Updating vdc:latest pointer to block $($latestBlock.blockNumber)..." -ForegroundColor Yellow
    
    $latestPointer = @{
        blockNumber = $latestBlock.blockNumber
        hash = $latestBlock.hash
        ipfsHash = $latestBlock.ipfsHash
        timestamp = $latestBlock.timestamp
    }
    
    $tempLatestFile = "temp_latest.json"
    $latestPointer | ConvertTo-Json -Compress | Out-File -FilePath $tempLatestFile -Encoding UTF8 -NoNewline
    
    npx wrangler kv key put "vdc:latest" --path $tempLatestFile --namespace-id $KV_NAMESPACE_ID 2>&1 | Out-Null
    Remove-Item $tempLatestFile -ErrorAction SilentlyContinue
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   ✅ vdc:latest updated successfully" -ForegroundColor Green
    }
}

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "✅ Restoration complete!" -ForegroundColor Green
Write-Host "   Blocks restored: $restoredCount" -ForegroundColor White
if ($latestBlock) {
    Write-Host "   Latest block: $($latestBlock.blockNumber)" -ForegroundColor White
}
Write-Host "============================================================" -ForegroundColor Cyan
