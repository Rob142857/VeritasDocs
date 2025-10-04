# Create activation link using admin endpoint
# Requires ADMIN_SECRET_KEY to be passed as parameter

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,
    
    [Parameter(Mandatory=$true)]
    [string]$AdminKey,
    
    [string]$Url = "https://veritas-docs-production.rme-6e5.workers.dev"
)

$body = @{
    email = $Email
    adminKey = $AdminKey
} | ConvertTo-Json

Write-Host "🔐 Creating activation link for: $Email" -ForegroundColor Cyan

try {
    $response = Invoke-RestMethod -Uri "$Url/api/auth/create-link-admin" -Method Post -Body $body -ContentType "application/json"
    
    if ($response.success) {
        Write-Host "`n✅ SUCCESS!" -ForegroundColor Green
        Write-Host "`nActivation URL:" -ForegroundColor Yellow
        Write-Host $response.data.activationUrl -ForegroundColor White
        Write-Host "`nToken: $($response.data.token)" -ForegroundColor Gray
        Write-Host "Expires: $(Get-Date -UnixTimeMilliseconds $response.data.expiresAt)" -ForegroundColor Gray
        
        # Copy URL to clipboard
        Set-Clipboard -Value $response.data.activationUrl
        Write-Host "`n📋 URL copied to clipboard!" -ForegroundColor Green
    } else {
        Write-Host "`n❌ ERROR: $($response.error)" -ForegroundColor Red
    }
} catch {
    Write-Host "`n❌ REQUEST FAILED:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails) {
        Write-Host $_.ErrorDetails.Message -ForegroundColor Red
    }
}
