# Create Activation Link for Veritas Documents
# This script calls the production API which uses the stored ADMIN_SECRET_KEY

param(
    [Parameter(Mandatory=$true)]
    [string]$Email
)

Write-Host "🔗 Creating activation link for: $Email" -ForegroundColor Cyan

# The API endpoint will use the ADMIN_SECRET_KEY from Cloudflare secrets
# So we just need to provide the email
$body = @{
    email = $Email
} | ConvertTo-Json

try {
    $response = Invoke-RestMethod -Uri "https://veritas-docs-production.rme-6e5.workers.dev/api/auth/create-link-admin" -Method Post -Body $body -ContentType "application/json"
    
    if ($response.success) {
        Write-Host "`n✅ Activation link created successfully!" -ForegroundColor Green
        Write-Host "`nActivation URL:" -ForegroundColor Yellow
        Write-Host $response.data.activationUrl -ForegroundColor White
        Write-Host "`nExpires at: $(Get-Date $([DateTimeOffset]::FromUnixTimeMilliseconds($response.data.expiresAt)))" -ForegroundColor Gray
        
        # Copy to clipboard
        Set-Clipboard -Value $response.data.activationUrl
        Write-Host "`n📋 URL copied to clipboard!" -ForegroundColor Green
    } else {
        Write-Host "`n❌ Error: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "`n❌ Failed to create activation link" -ForegroundColor Red
    Write-Host "Error: $_" -ForegroundColor Red
}
