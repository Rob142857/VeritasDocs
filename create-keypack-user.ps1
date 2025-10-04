# Create activation link for keypack flow
$adminSecret = "4da19f5ebd825ba8adf7f7deda8187acce3d750dce068a99036f1eb070b9abd7"
$email = "test.keypack@example.com"

$body = @{
    email = $email
    adminKey = $adminSecret
} | ConvertTo-Json

Write-Host "Creating activation link for: $email" -ForegroundColor Cyan

$response = Invoke-RestMethod -Method Post -Uri "https://veritas-docs-production.rme-6e5.workers.dev/api/auth/create-link-admin" -Body $body -ContentType "application/json"

if ($response.success) {
    $token = $response.data.token
    $keypackUrl = "https://veritas-docs-production.rme-6e5.workers.dev/activate-keypack.html?token=$token"
    
    Write-Host "`n✅ Activation link created successfully!`n" -ForegroundColor Green
    Write-Host "Keypack Activation URL:" -ForegroundColor Yellow
    Write-Host $keypackUrl -ForegroundColor White
    Write-Host "`nExpires:" ($response.data.expiresAt | Get-Date -Format "yyyy-MM-dd HH:mm:ss") -ForegroundColor Cyan
    Write-Host "`nThis link uses the NEW keypack flow with:" -ForegroundColor Magenta
    Write-Host "  - 12-word passphrase generation" -ForegroundColor White
    Write-Host "  - Encrypted .keypack file download" -ForegroundColor White
    Write-Host "  - Login at: https://veritas-docs-production.rme-6e5.workers.dev/login-keypack.html" -ForegroundColor White
} else {
    Write-Host "❌ Error: $($response.error)" -ForegroundColor Red
}
