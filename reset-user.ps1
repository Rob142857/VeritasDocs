# Delete old user and create new admin invite with real Kyber-768 keys
param(
    [Parameter(Mandatory=$true)]
    [string]$Email = "robert.evans@rmesolutions.com.au"
)

$KV_NAMESPACE_ID = "9f0ea31309cd44cab7bfe3569e16aa45"

Write-Host "🔐 Veritas Documents - User Reset Tool" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Get user ID from email
Write-Host "📧 Looking up user: $Email" -ForegroundColor Yellow
try {
    $userId = npx wrangler kv key get "user:email:$Email" --namespace-id $KV_NAMESPACE_ID --remote 2>$null
    
    if ($userId) {
        Write-Host "   Found user ID: $userId" -ForegroundColor Green
        
        # Delete user data
        Write-Host "🗑️  Deleting user data..." -ForegroundColor Yellow
        npx wrangler kv key delete "user:$userId" --namespace-id $KV_NAMESPACE_ID --remote 2>$null
        Write-Host "   ✓ Deleted user:$userId" -ForegroundColor Green
        
        # Delete email mapping
        npx wrangler kv key delete "user:email:$Email" --namespace-id $KV_NAMESPACE_ID --remote 2>$null
        Write-Host "   ✓ Deleted user:email:$Email" -ForegroundColor Green
        
        Write-Host ""
        Write-Host "✅ User deleted successfully" -ForegroundColor Green
    } else {
        Write-Host "   No existing user found" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   No existing user found" -ForegroundColor Yellow
}

Write-Host ""

# Step 2: Create new admin invitation
Write-Host "📝 Creating new admin invitation..." -ForegroundColor Yellow

$token = "admin_" + [DateTimeOffset]::Now.ToUnixTimeMilliseconds() + "_" + [System.Guid]::NewGuid().ToString().Substring(0,8)
$expiresAt = [DateTimeOffset]::Now.AddDays(7).ToUnixTimeMilliseconds()

$oneTimeLink = @{
    token = $token
    email = $Email
    inviteType = "admin"
    createdBy = "powershell-cli"
    createdAt = [DateTimeOffset]::Now.ToUnixTimeMilliseconds()
    expiresAt = $expiresAt
    used = $false
} | ConvertTo-Json -Compress

# Save to temporary file
$tempFile = "temp_invite_$token.json"
$oneTimeLink | Out-File -FilePath $tempFile -Encoding utf8 -NoNewline

# Upload to KV
npx wrangler kv key put "link:$token" --path $tempFile --namespace-id $KV_NAMESPACE_ID --remote 2>$null

# Clean up temp file
Remove-Item $tempFile

$activationUrl = "https://veritas-docs-production.rme-6e5.workers.dev/activate?token=$token"
$expiresDate = [DateTimeOffset]::FromUnixTimeMilliseconds($expiresAt).ToString("yyyy-MM-dd HH:mm:ss")

Write-Host ""
Write-Host "✅ Admin invitation created successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "📎 Activation URL:" -ForegroundColor Cyan
Write-Host "   $activationUrl" -ForegroundColor White
Write-Host ""
Write-Host "⏰ Expires: $expiresDate" -ForegroundColor Yellow
Write-Host ""
Write-Host "🔐 This will create an account with real Kyber-768 post-quantum keys!" -ForegroundColor Magenta
Write-Host "   Keys will be generated in your browser during activation." -ForegroundColor Magenta
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Open the activation URL in your browser" -ForegroundColor White
Write-Host "2. Fill in your personal details" -ForegroundColor White
Write-Host "3. Save the generated Kyber-768 keys securely" -ForegroundColor White
Write-Host "4. Use your private key to login" -ForegroundColor White
