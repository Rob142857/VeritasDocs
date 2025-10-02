# Veritas Documents - Minimal Production Setup
# For basic functionality without full Web3 integration

# Essential secrets only (skip the optional ones)
wrangler secret put STRIPE_SECRET_KEY --env production
wrangler secret put STRIPE_WEBHOOK_SECRET --env production  
wrangler secret put IPFS_API_KEY --env production

# Skip these for now (system works without them):
# - ETHEREUM_PRIVATE_KEY (only needed for blockchain anchoring)
# - VERITAS_CONTRACT_ADDRESS (only needed for smart contract calls)

# Deploy
wrangler deploy --env production
