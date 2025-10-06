# Download and verify all VDC blocks across KV, R2, and IPFS
# Saves blocks to ./blocks/ directory and reports consistency

$KV_NAMESPACE_ID = "9f0ea31309cd44cab7bfe3569e16aa45"
$R2_BUCKET_NAME = "veritas-docs-production-storage"
$OUTPUT_DIR = "blocks"

# Get Pinata credentials from secrets (you'll need to set these)
$PINATA_API_KEY = $env:PINATA_API_KEY
$PINATA_SECRET_KEY = $env:PINATA_SECRET_KEY

if (-not $PINATA_API_KEY -or -not $PINATA_SECRET_KEY) {
    Write-Host "⚠️  Warning: PINATA_API_KEY and PINATA_SECRET_KEY environment variables not set" -ForegroundColor Yellow
    Write-Host "   IPFS verification will be skipped" -ForegroundColor Yellow
    Write-Host ""
}

# Create output directory
if (-not (Test-Path $OUTPUT_DIR)) {
    New-Item -ItemType Directory -Path $OUTPUT_DIR | Out-Null
    Write-Host "📁 Created output directory: $OUTPUT_DIR" -ForegroundColor Green
} else {
    Write-Host "📁 Using existing directory: $OUTPUT_DIR" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "🚀 Starting block download and consistency check..." -ForegroundColor Green
Write-Host "📋 Configuration:" -ForegroundColor Cyan
Write-Host "   KV Namespace: $KV_NAMESPACE_ID"
Write-Host "   R2 Bucket: $R2_BUCKET_NAME"
Write-Host "   Output Dir: $OUTPUT_DIR"
Write-Host ""

# Check blocks 0-20 (adjust range as needed)
$blockRange = 0..20
$results = @()

foreach ($blockNumber in $blockRange) {
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host "📦 Block $blockNumber" -ForegroundColor Yellow
    Write-Host ""
    
    $result = @{
        BlockNumber = $blockNumber
        KV = $null
        R2 = $null
        IPFS = $null
        Consistent = $false
        Saved = $false
    }
    
    # 1. Check KV
    Write-Host "   🔍 Checking KV..." -ForegroundColor Cyan
    try {
        $kvData = npx wrangler kv key get "vdc:block:$blockNumber" --namespace-id $KV_NAMESPACE_ID 2>$null
        if ($LASTEXITCODE -eq 0 -and $kvData) {
            $kvBlock = $kvData | ConvertFrom-Json
            $result.KV = @{
                Found = $true
                Hash = $kvBlock.hash
                TxCount = $kvBlock.transactions.Count
                Timestamp = $kvBlock.timestamp
            }
            Write-Host "      ✅ Found in KV (hash: $($kvBlock.hash.Substring(0,12))..., $($kvBlock.transactions.Count) tx)" -ForegroundColor Green
        } else {
            $result.KV = @{ Found = $false }
            Write-Host "      ❌ Not found in KV" -ForegroundColor Red
        }
    } catch {
        $result.KV = @{ Found = $false }
        Write-Host "      ❌ KV error: $_" -ForegroundColor Red
    }
    
    # 2. Check R2
    Write-Host "   🔍 Checking R2..." -ForegroundColor Cyan
    try {
        $r2Data = npx wrangler r2 object get "$R2_BUCKET_NAME/blocks/$blockNumber.json" --remote --pipe 2>$null
        if ($LASTEXITCODE -eq 0 -and $r2Data) {
            $r2Stored = $r2Data | ConvertFrom-Json
            $r2Block = if ($r2Stored.data) { $r2Stored.data } else { $r2Stored }
            
            $result.R2 = @{
                Found = $true
                Hash = $r2Block.hash
                TxCount = $r2Block.transactions.Count
                Timestamp = $r2Block.timestamp
            }
            Write-Host "      ✅ Found in R2 (hash: $($r2Block.hash.Substring(0,12))..., $($r2Block.transactions.Count) tx)" -ForegroundColor Green
            
            # Save R2 version as authoritative source
            $outputFile = Join-Path $OUTPUT_DIR "block_$blockNumber.json"
            $r2Block | ConvertTo-Json -Depth 10 | Out-File -FilePath $outputFile -Encoding UTF8
            $result.Saved = $true
            Write-Host "      💾 Saved to: $outputFile" -ForegroundColor Gray
        } else {
            $result.R2 = @{ Found = $false }
            Write-Host "      ❌ Not found in R2" -ForegroundColor Red
        }
    } catch {
        $result.R2 = @{ Found = $false }
        Write-Host "      ❌ R2 error: $_" -ForegroundColor Red
    }
    
    # 3. Check IPFS (if credentials available and block has ipfsHash)
    if ($PINATA_API_KEY -and $result.R2.Found -and $r2Block.ipfsHash) {
        Write-Host "   🔍 Checking IPFS..." -ForegroundColor Cyan
        try {
            $ipfsHash = $r2Block.ipfsHash
            $ipfsUrl = "https://gateway.pinata.cloud/ipfs/$ipfsHash"
            
            $ipfsResponse = Invoke-WebRequest -Uri $ipfsUrl -UseBasicParsing -TimeoutSec 10
            if ($ipfsResponse.StatusCode -eq 200) {
                $ipfsStored = $ipfsResponse.Content | ConvertFrom-Json
                $ipfsBlock = if ($ipfsStored.data) { $ipfsStored.data } else { $ipfsStored }
                
                $result.IPFS = @{
                    Found = $true
                    Hash = $ipfsBlock.hash
                    TxCount = $ipfsBlock.transactions.Count
                    Timestamp = $ipfsBlock.timestamp
                    IpfsHash = $ipfsHash
                }
                Write-Host "      ✅ Found in IPFS (hash: $($ipfsBlock.hash.Substring(0,12))..., $($ipfsBlock.transactions.Count) tx)" -ForegroundColor Green
                Write-Host "         IPFS: $($ipfsHash.Substring(0,20))..." -ForegroundColor Gray
            }
        } catch {
            $result.IPFS = @{ Found = $false; Error = $_.Exception.Message }
            Write-Host "      ❌ IPFS error: $($_.Exception.Message)" -ForegroundColor Red
        }
    } elseif ($result.R2.Found -and -not $r2Block.ipfsHash) {
        Write-Host "   ⚠️  Skipping IPFS (no ipfsHash in block metadata)" -ForegroundColor Yellow
    }
    
    # 4. Consistency check
    Write-Host ""
    Write-Host "   📊 Consistency Check:" -ForegroundColor Cyan
    
    $foundIn = @()
    if ($result.KV.Found) { $foundIn += "KV" }
    if ($result.R2.Found) { $foundIn += "R2" }
    if ($result.IPFS.Found) { $foundIn += "IPFS" }
    
    if ($foundIn.Count -eq 0) {
        Write-Host "      ⚠️  Block not found in any storage tier" -ForegroundColor Yellow
    } else {
        Write-Host "      📍 Found in: $($foundIn -join ', ')" -ForegroundColor White
        
        # Compare hashes
        $hashes = @()
        if ($result.KV.Found) { $hashes += $result.KV.Hash }
        if ($result.R2.Found) { $hashes += $result.R2.Hash }
        if ($result.IPFS.Found) { $hashes += $result.IPFS.Hash }
        
        $uniqueHashes = $hashes | Select-Object -Unique
        
        if ($uniqueHashes.Count -eq 1) {
            Write-Host "      ✅ All sources have matching hash" -ForegroundColor Green
            $result.Consistent = $true
        } else {
            Write-Host "      ❌ Hash mismatch detected!" -ForegroundColor Red
            if ($result.KV.Found) { Write-Host "         KV:   $($result.KV.Hash)" -ForegroundColor Yellow }
            if ($result.R2.Found) { Write-Host "         R2:   $($result.R2.Hash)" -ForegroundColor Yellow }
            if ($result.IPFS.Found) { Write-Host "         IPFS: $($result.IPFS.Hash)" -ForegroundColor Yellow }
        }
    }
    
    $results += $result
    Write-Host ""
}

# Summary report
Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host "📊 SUMMARY REPORT" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

$foundBlocks = $results | Where-Object { $_.R2.Found -or $_.KV.Found -or $_.IPFS.Found }
$consistentBlocks = $results | Where-Object { $_.Consistent -eq $true }
$savedBlocks = $results | Where-Object { $_.Saved -eq $true }

Write-Host "Total blocks checked: $($blockRange.Count)" -ForegroundColor White
Write-Host "Blocks found: $($foundBlocks.Count)" -ForegroundColor Green
Write-Host "Consistent blocks: $($consistentBlocks.Count)" -ForegroundColor Green
Write-Host "Blocks saved: $($savedBlocks.Count)" -ForegroundColor Green
Write-Host ""

# Storage tier summary
$kvCount = ($results | Where-Object { $_.KV.Found }).Count
$r2Count = ($results | Where-Object { $_.R2.Found }).Count
$ipfsCount = ($results | Where-Object { $_.IPFS.Found }).Count

Write-Host "Storage Tier Coverage:" -ForegroundColor Cyan
Write-Host "  KV:   $kvCount blocks" -ForegroundColor White
Write-Host "  R2:   $r2Count blocks" -ForegroundColor White
Write-Host "  IPFS: $ipfsCount blocks" -ForegroundColor White
Write-Host ""

# List inconsistent blocks
$inconsistent = $results | Where-Object { $_.KV.Found -or $_.R2.Found -or $_.IPFS.Found } | Where-Object { $_.Consistent -eq $false }
if ($inconsistent.Count -gt 0) {
    Write-Host "⚠️  Inconsistent blocks:" -ForegroundColor Yellow
    foreach ($block in $inconsistent) {
        Write-Host "   Block $($block.BlockNumber)" -ForegroundColor Red
    }
} else {
    Write-Host "✅ All found blocks are consistent!" -ForegroundColor Green
}

Write-Host ""
Write-Host "📁 Downloaded blocks saved to: $OUTPUT_DIR" -ForegroundColor Cyan
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
