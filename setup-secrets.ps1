# Veritas Documents - PowerShell Commands for Cloudflare Secrets
# Run these commands in PowerShell to set up your production secrets

wrangler secret put STRIPE_SECRET_KEY --env production
# When prompted, enter: sk_live_your_stripe_secret_key_here

wrangler secret put STRIPE_WEBHOOK_SECRET --env production
# When prompted, enter: whsec_your_webhook_secret_here

wrangler secret put MAATARA_CHAIN_PRIVATE_KEY --env production
# When prompted, enter: edaaa8774896953d9db5952b690228c5575c8f4bbcb1d98e6f5f306f25edbfe70df645325896e1ee88e9017119f63bf5d31a6a7470a7a0be4952f0506c8a3881

wrangler secret put IPFS_API_KEY --env production
# When prompted, enter: your_cloudflare_ipfs_api_key

wrangler secret put ADMIN_SECRET_KEY --env production
# When prompted, enter: 06e88356a928fd9077806f44a4142a83594afa09b8d5af90ae2fb3f31b3f4b33

wrangler secret put ETHEREUM_PRIVATE_KEY --env production
# When prompted, enter: 0x_your_ethereum_private_key

wrangler secret put VERITAS_CONTRACT_ADDRESS --env production
# When prompted, enter: 0x_your_contract_address

wrangler secret put PINATA_API_KEY --env production
# When prompted, enter: your_pinata_api_key

wrangler secret put PINATA_SECRET_KEY --env production
# When prompted, enter: your_pinata_secret_key

