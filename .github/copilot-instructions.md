<!-- Use this file to provide workspace-specific custom instructions to Copilot. -->

## Veritas Documents Project

This is a Cloudflare Worker project for NFT-based legal document storage using post-quantum cryptography with a **zero-knowledge architecture**.

### Core Security Principles
- **Zero-Knowledge**: Server never sees private keys or unencrypted data
- **Client-Side Crypto**: All key generation and encryption happens in browser
- **Post-Quantum**: NIST-standardized Kyber-768 and Dilithium-2
- **Multi-Layer Verification**: VDC blockchain + IPFS + Ethereum anchoring

### Project Structure
- **Backend**: Cloudflare Workers + Hono framework (TypeScript)
- **Crypto**: Ma'atara Protocol v0.2.3 (WASM-based PQC)
- **Storage**: Cloudflare KV + IPFS (Pinata)
- **Blockchain**: Custom VDC blockchain with dual signatures
- **Payments**: Stripe integration ($25 per document)
- **Frontend**: TypeScript SPA with WASM crypto

### Key Architecture Decisions
- Private keys NEVER sent to server (zero-knowledge proof via decryption)
- All personal data encrypted client-side with Kyber-768
- Dilithium-2 signatures for all blockchain transactions
- JSON key download instead of email delivery
- Activation tokens expire after 7 days
- Dual signatures on every VDC transaction (user + system)

### Completed Implementation ✅
- [x] Zero-knowledge activation flow
- [x] Client-side key generation (Kyber + Dilithium)
- [x] WASM initialization (fetch Response object)
- [x] Dilithium base64url string handling
- [x] JSON key download
- [x] Token-info endpoint
- [x] VDC blockchain with genesis block
- [x] System key generation and split storage
- [x] Production deployment

### Documentation
- `README.md` - Project overview and quick start
- `SECURITY_ARCHITECTURE.md` - Comprehensive zero-knowledge security design
- `ACTIVATION_TOKEN_FLOW.md` - User activation process
- `TECHNICAL_STATUS.md` - Current implementation status
- `BLOCKCHAIN_ARCHITECTURE.md` - VDC blockchain design
- `ZERO_KNOWLEDGE_ARCHITECTURE.md` - Security model details
- `VDC_INTEGRATION_GUIDE.md` - VDC blockchain usage

### Production Environment
- **URL**: https://veritas-docs-production.rme-6e5.workers.dev
- **KV Namespace**: 9f0ea31309cd44cab7bfe3569e16aa45
- **System Keys**: Split across Cloudflare Secrets
- **WASM/Bundle**: Stored in KV (`app-bundle`, `pqc-wasm`)

### Critical Guidelines
1. **NEVER** send private keys to server
2. **ALWAYS** use base64url strings for PQC operations (not bytes)
3. **ALWAYS** initialize WASM with fetch Response object
4. **ALWAYS** verify Dilithium signatures on server
5. **ALWAYS** encrypt personal data before transmission
6. **ALWAYS** use dual signatures for VDC transactions