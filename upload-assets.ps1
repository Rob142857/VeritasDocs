# Upload frontend bundle and WASM to KV storage
Write-Host "Uploading frontend assets to KV storage..." -ForegroundColor Cyan

# Get the KV namespace ID
$KV_ID = "9f0ea31309cd44cab7bfe3569e16aa45"

# Upload JavaScript bundle
Write-Host "Uploading app.bundle.js..."
npx wrangler kv key put "frontend-bundle" --path "public/app.bundle.js" --namespace-id $KV_ID

# Upload WASM file  
Write-Host "Uploading WASM file..."
npx wrangler kv key put "pqc-wasm" --path "public/core_pqc_wasm_bg.wasm" --namespace-id $KV_ID

Write-Host "✓ Frontend assets uploaded successfully" -ForegroundColor Green
