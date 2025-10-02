# Clean up extra Cloudflare resources
# Run these commands to remove unnecessary workers and KV namespaces

# List your workers
wrangler whoami
wrangler deployments list

# Delete extra workers (replace with actual names if different)
# wrangler delete veritas-docs-production  # Only if you created extra ones

# List KV namespaces
wrangler kv:namespace list

# Delete extra KV namespaces (keep only the production one)
# wrangler kv:namespace delete --namespace-id <extra-namespace-id>
