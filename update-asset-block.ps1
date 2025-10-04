# Update asset with VDC block number from block 5
# Usage: .\update-asset-block.ps1

$ADMIN_SECRET = "4da19f5ebd825ba8adf7f7deda8187acce3d750dce068a99036f1eb070b9abd7"
$PROD_URL = "https://veritas-docs-production.rme-6e5.workers.dev"

Write-Host "Fetching block 5 details..." -ForegroundColor Cyan
$block5Response = Invoke-RestMethod -Uri "$PROD_URL/api/vdc/block/5" -Method GET

if ($block5Response.success) {
    $block = $block5Response.data
    Write-Host "Block 5 found with $($block.transactions.Count) transactions" -ForegroundColor Green
    
    foreach ($tx in $block.transactions) {
        if ($tx.data.assetId) {
            $assetId = $tx.data.assetId
            Write-Host "`nFound asset in transaction: $assetId" -ForegroundColor Yellow
            
            # Update the asset via admin endpoint
            $updatePayload = @{
                assetId = $assetId
                vdcBlockNumber = 5
            } | ConvertTo-Json
            
            Write-Host "Updating asset $assetId with block number 5..." -ForegroundColor Cyan
            
            # We'll need to create an admin endpoint for this, or use KV CLI
            Write-Host "Asset ID to update: $assetId" -ForegroundColor Green
            Write-Host "Run this command:" -ForegroundColor Yellow
            Write-Host "npx wrangler kv:key get `"asset:$assetId`" --namespace-id 9f0ea31309cd44cab7bfe3569e16aa45 --remote" -ForegroundColor White
        }
    }
} else {
    Write-Host "Failed to fetch block 5: $($block5Response.error)" -ForegroundColor Red
}
