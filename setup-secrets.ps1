# Veritas Documents - PowerShell Commands for Cloudflare Secrets
# Run these commands in PowerShell to set up your production secrets

wrangler secret put STRIPE_SECRET_KEY --env production
# When prompted, enter: sk_live_your_stripe_secret_key_here

wrangler secret put STRIPE_WEBHOOK_SECRET --env production
# When prompted, enter: whsec_your_webhook_secret_here

wrangler secret put MAATARA_CHAIN_PRIVATE_KEY --env production
# When prompted, enter: 50ce69d4ec909cfa83efb312314bfd1fbeec0584457342c15114386b74d58351c6ca1412bc744e4595626e2f4a289b74b78ac9a374add30be95c50f39fbc1caf

wrangler secret put IPFS_API_KEY --env production
# When prompted, enter: your_cloudflare_ipfs_api_key

wrangler secret put ADMIN_SECRET_KEY --env production
# When prompted, enter: 4da19f5ebd825ba8adf7f7deda8187acce3d750dce068a99036f1eb070b9abd7

wrangler secret put ETHEREUM_PRIVATE_KEY --env production
# When prompted, enter: 0x_your_ethereum_private_key

wrangler secret put VERITAS_CONTRACT_ADDRESS --env production
# When prompted, enter: 0x_your_contract_address

wrangler secret put PINATA_API_KEY --env production
# When prompted, enter: your_pinata_api_key

wrangler secret put PINATA_SECRET_KEY --env production
# When prompted, enter: your_pinata_secret_key

