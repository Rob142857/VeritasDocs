# Reset User and Create New Invite
# This script deletes the existing user and creates a fresh admin invite link

param(
    [string]$Email = "robert.evans@rmesolutions.com.au",
    [string]$NamespaceId = "9f0ea31309cd44cab7bfe3569e16aa45"
)

Write-Host "🔄 Resetting user account for: $Email" -ForegroundColor Cyan
Write-Host ""

# Step 1: List and delete existing user
Write-Host "Step 1: Finding existing user..." -ForegroundColor Yellow
$userKeys = npx wrangler kv key list --namespace-id $NamespaceId --remote | ConvertFrom-Json

$userIdKey = $userKeys | Where-Object { $_.name -eq "user:email:$Email" }

if ($userIdKey) {
    $userId = npx wrangler kv key get "user:email:$Email" --namespace-id $NamespaceId --remote
    Write-Host "✓ Found user ID: $userId" -ForegroundColor Green
    
    # Delete user data
    Write-Host "  Deleting user:$userId..." -ForegroundColor Gray
    npx wrangler kv key delete "user:$userId" --namespace-id $NamespaceId --remote
    
    # Delete email mapping
    Write-Host "  Deleting user:email:$Email..." -ForegroundColor Gray
    npx wrangler kv key delete "user:email:$Email" --namespace-id $NamespaceId --remote
    
    # Delete blockchain transaction if exists
    $userDataRaw = npx wrangler kv key get "user:$userId" --namespace-id $NamespaceId --remote 2>$null
    if ($userDataRaw) {
        $userData = $userDataRaw | ConvertFrom-Json
        $privateData = $userData.encryptedPrivateData | ConvertFrom-Json
        if ($privateData.blockchainTxId) {
            Write-Host "  Deleting blockchain:tx:$($privateData.blockchainTxId)..." -ForegroundColor Gray
            npx wrangler kv key delete "blockchain:tx:$($privateData.blockchainTxId)" --namespace-id $NamespaceId --remote
            npx wrangler kv key delete "blockchain:user:$userId" --namespace-id $NamespaceId --remote
        }
    }
    
    Write-Host "✓ User deleted successfully" -ForegroundColor Green
} else {
    Write-Host "ℹ No existing user found" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Delete old invite links for this email
Write-Host "Step 2: Cleaning up old invite links..." -ForegroundColor Yellow
$allKeys = $userKeys | Where-Object { $_.name -like "link:*" }
foreach ($key in $allKeys) {
    $linkData = npx wrangler kv key get $key.name --namespace-id $NamespaceId --remote | ConvertFrom-Json
    if ($linkData.email -eq $Email) {
        Write-Host "  Deleting old link: $($key.name)..." -ForegroundColor Gray
        npx wrangler kv key delete $key.name --namespace-id $NamespaceId --remote
    }
}
Write-Host "✓ Old links cleaned up" -ForegroundColor Green

Write-Host ""

# Step 3: Create new admin invite link
Write-Host "Step 3: Creating new admin invite link..." -ForegroundColor Yellow

# Get admin secret (you'll need to set this)
$AdminSecret = $env:ADMIN_SECRET_KEY
if (-not $AdminSecret) {
    Write-Host "⚠️  ADMIN_SECRET_KEY not found in environment" -ForegroundColor Red
    $AdminSecret = Read-Host "Enter ADMIN_SECRET_KEY"
}

# Create invite via API
$body = @{
    email = $Email
    adminSecret = $AdminSecret
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "https://veritas-docs-production.rme-6e5.workers.dev/api/auth/create-link" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body

if ($response.success) {
    Write-Host "✓ New invite link created!" -ForegroundColor Green
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host "📧 Email: $Email" -ForegroundColor White
    Write-Host "🔗 Activation URL:" -ForegroundColor White
    Write-Host "   $($response.data.activationUrl)" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "⏰ Expires: $(Get-Date -Date ([DateTimeOffset]::FromUnixTimeMilliseconds($response.data.expiresAt)).DateTime -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Gray
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "✅ Ready to activate!" -ForegroundColor Green
    Write-Host "   Visit the activation URL to create your account with:" -ForegroundColor White
    Write-Host "   • Kyber-768 encryption keys" -ForegroundColor White
    Write-Host "   • Dilithium-2 signing keys" -ForegroundColor White
    Write-Host "   • Blockchain identity verification" -ForegroundColor White
    Write-Host ""
} else {
    Write-Host "❌ Failed to create invite link" -ForegroundColor Red
    Write-Host "Error: $($response.error)" -ForegroundColor Red
}
