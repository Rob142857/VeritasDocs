#!/usr/bin/env pwsh
# Setup Stripe API keys in Cloudflare Secrets for production

Write-Host "=== Stripe API Keys Setup ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "This script will help you configure Stripe API keys for Veritas Documents." -ForegroundColor Yellow
Write-Host ""
Write-Host "You need to obtain these keys from your Stripe Dashboard:" -ForegroundColor Yellow
Write-Host "1. Go to https://dashboard.stripe.com/apikeys" -ForegroundColor White
Write-Host "2. Copy your Secret Key (starts with sk_test_ or sk_live_)" -ForegroundColor White
Write-Host "3. Go to https://dashboard.stripe.com/webhooks" -ForegroundColor White
Write-Host "4. Create a webhook endpoint: https://veritas-docs-production.rme-6e5.workers.dev/api/stripe/webhook" -ForegroundColor White
Write-Host "5. Select event: checkout.session.completed" -ForegroundColor White
Write-Host "6. Copy the Webhook Signing Secret (starts with whsec_)" -ForegroundColor White
Write-Host ""

# Get Stripe Secret Key
Write-Host "Enter your Stripe Secret Key (sk_test_... or sk_live_...):" -ForegroundColor Green
$stripeSecretKey = Read-Host -AsSecureString
$stripeSecretKeyPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stripeSecretKey)
)

if (-not $stripeSecretKeyPlain.StartsWith("sk_")) {
    Write-Host "Error: Stripe Secret Key must start with 'sk_'" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Get Stripe Webhook Secret
Write-Host "Enter your Stripe Webhook Secret (whsec_...):" -ForegroundColor Green
$webhookSecret = Read-Host -AsSecureString
$webhookSecretPlain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
    [Runtime.InteropServices.Marshal]::SecureStringToBSTR($webhookSecret)
)

if (-not $webhookSecretPlain.StartsWith("whsec_")) {
    Write-Host "Error: Webhook Secret must start with 'whsec_'" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Setting up Stripe secrets in Cloudflare..." -ForegroundColor Cyan

# Set STRIPE_SECRET_KEY
Write-Host "Setting STRIPE_SECRET_KEY..." -ForegroundColor Yellow
$stripeSecretKeyPlain | npx wrangler secret put STRIPE_SECRET_KEY --env production

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to set STRIPE_SECRET_KEY" -ForegroundColor Red
    exit 1
}

# Set STRIPE_WEBHOOK_SECRET
Write-Host "Setting STRIPE_WEBHOOK_SECRET..." -ForegroundColor Yellow
$webhookSecretPlain | npx wrangler secret put STRIPE_WEBHOOK_SECRET --env production

if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Failed to set STRIPE_WEBHOOK_SECRET" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "✅ Stripe secrets configured successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "1. Deploy your worker: npm run deploy" -ForegroundColor White
Write-Host "2. Configure webhook in Stripe Dashboard:" -ForegroundColor White
Write-Host "   - URL: https://veritas-docs-production.rme-6e5.workers.dev/api/stripe/webhook" -ForegroundColor White
Write-Host "   - Event: checkout.session.completed" -ForegroundColor White
Write-Host "3. Test asset creation with real payment" -ForegroundColor White
Write-Host ""
