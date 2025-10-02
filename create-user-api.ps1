# Create Production User via API
# This calls the actual API endpoints to create a real user account

param(
    [Parameter(Mandatory=$true)]
    [string]$Email,
    
    [string]$AccountType = "admin",
    
    [string]$BaseUrl = "https://your-app-url.workers.dev",  # Replace with your deployed URL
    
    [string]$AdminSecret  # Will prompt if not provided
)

if (-not $AdminSecret) {
    $AdminSecret = Read-Host "Enter admin secret key" -AsSecureString
    $AdminSecret = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($AdminSecret))
}

Write-Host "🔐 Creating user via API..." -ForegroundColor Cyan
Write-Host "Email: $Email" -ForegroundColor Yellow
Write-Host "Account Type: $AccountType" -ForegroundColor Yellow
Write-Host "API Base URL: $BaseUrl" -ForegroundColor Yellow
Write-Host ""

# Step 1: Create invitation link (admin only)
Write-Host "📧 Creating invitation link..." -ForegroundColor Green
$createLinkBody = @{
    email = $Email
    adminSecret = $AdminSecret
} | ConvertTo-Json

try {
    $createLinkResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/create-link" -Method POST -Body $createLinkBody -ContentType "application/json"
    
    if ($createLinkResponse.success) {
        $activationUrl = $createLinkResponse.data.activationUrl
        Write-Host "✅ Invitation link created!" -ForegroundColor Green
        Write-Host "Activation URL: $activationUrl" -ForegroundColor White
        
        # Extract token from URL
        $token = $activationUrl -replace ".*token=", ""
        Write-Host "Token: $token" -ForegroundColor Gray
    } else {
        Write-Host "❌ Failed to create invitation: $($createLinkResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ API call failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Step 2: Activate the account (simulate user activation)
Write-Host ""
Write-Host "🔓 Activating account..." -ForegroundColor Green

$personalDetails = @{
    fullName = "Admin User"
    company = "Veritas Documents"
    phone = "+1-555-0123"
    address = @{
        street = "123 Main St"
        city = "Anytown"
        state = "CA"
        zipCode = "12345"
        country = "USA"
    }
}

$activateBody = @{
    token = $token
    personalDetails = $personalDetails
} | ConvertTo-Json

try {
    $activateResponse = Invoke-RestMethod -Uri "$BaseUrl/api/auth/activate" -Method POST -Body $activateBody -ContentType "application/json"
    
    if ($activateResponse.success) {
        $userData = $activateResponse.data
        Write-Host "✅ Account activated successfully!" -ForegroundColor Green
        Write-Host ""
        Write-Host "🔑 LOGIN CREDENTIALS:" -ForegroundColor Cyan
        Write-Host "Email: $Email" -ForegroundColor White
        Write-Host "Private Key: $($userData.privateKey)" -ForegroundColor Red
        Write-Host ""
        Write-Host "⚠️  IMPORTANT: Save the private key securely!" -ForegroundColor Yellow
        Write-Host "   This is the only way to log into your account." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "�� To log in:" -ForegroundColor Green
        Write-Host "1. Go to $BaseUrl" -ForegroundColor White
        Write-Host "2. Click '"'"'Login'"'"'" -ForegroundColor White
        Write-Host "3. Enter the email and private key above" -ForegroundColor White
        Write-Host ""
        Write-Host "🎉 User account ready for login!" -ForegroundColor Green
    } else {
        Write-Host "❌ Failed to activate account: $($activateResponse.error)" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "❌ Activation failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
