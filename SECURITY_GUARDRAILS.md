# Security Guardrails - Account Activation & Key Management

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production

---

## Overview

Comprehensive security warnings and guardrails protect users during account activation, ensuring they understand the critical importance of key management in our **zero-knowledge architecture**. Users cannot proceed to login without explicitly acknowledging that private key loss means permanent loss of access.

---

## Core Security Principles

### Zero-Knowledge Architecture
- **Server never sees private keys**: All key generation happens client-side in browser
- **No password recovery**: Server cannot decrypt user data or reset access
- **Client-side encryption**: All personal data encrypted with Kyber-768 before transmission
- **Immutable audit trail**: VDC blockchain records all actions with dual signatures

### Machine Identities (System Accounts)
- **System master account**: Required for VDC blockchain consensus and dual signatures
- **Split secret storage**: Dilithium private key split into PART1 + PART2 stored separately
- **Runtime reconstruction**: System key reassembled only in worker memory, never persisted whole
- **Limited capabilities**: System account can only co-sign user-initiated transactions

For detailed machine identity security architecture, see [ZERO_KNOWLEDGE_ARCHITECTURE.md § Machine Identities](./ZERO_KNOWLEDGE_ARCHITECTURE.md#machine-identities--system-accounts).

---

## What's New in v1.0.1

### 1. Enhanced Key Display (Activation Success Page)
When users complete account activation, they now see:

- **Color-coded importance indicators**:
  - 🔴 Private Key: Red border, yellow background - **REQUIRED FOR LOGIN**
  - 🟢 Public Key: Normal display - Can be shared
  - 🔵 Recovery Phrase: Optional but recommended

- **Clear explanations** for each key:
  - Private Key: "REQUIRED FOR LOGIN - SAVE THIS!"
  - Public Key: "Used for encryption - can be shared"
  - Recovery Phrase: "Optional backup - recommended"

- **Storage recommendations** with friendly guidance:
  - Password managers (1Password, Bitwarden, LastPass)
  - Secret management tools (AWS Secrets Manager, Azure Key Vault)
  - Encrypted USB drives in safe/lockbox
  - Printed copies in fireproof safe
  - Written notes stored securely (even under your pillow... but a safe is better! 😊)

### 2. Security Warning Modal (Before Login)
When users click "Continue to Login", they must:

✅ **Read and acknowledge 4 critical warnings**:
1. ✓ I have saved my Private Key in a secure location
2. ✓ I understand that losing my Private Key means permanent loss of access
3. ✓ I understand there is no password reset and no recovery process
4. ✓ I understand that if I lose access, I will need to create a new account

The "Proceed to Login" button is **disabled until all checkboxes are checked**.

### 3. Legal Compliance Notice
The modal includes an official legal notice:

> Documents stored in Veritas are encrypted using NIST-standardized post-quantum cryptographic algorithms (Kyber-768 and Dilithium-2), stored on IPFS with Ethereum blockchain anchoring, and timestamped with cryptographic proofs. This ensures compliance with legal standards for digital evidence in jurisdictions that recognize blockchain-based document authentication, including courts in the United States, European Union, United Kingdom, Australia, and other countries with established digital evidence frameworks.

## User Experience Flow

### Step 1: Activation Success
```
┌─────────────────────────────────────────┐
│ ✓ Account activated successfully!      │
│                                         │
│ 🔐 Your Cryptographic Keys             │
│ Post-Quantum Cryptography (Kyber-768)  │
│                                         │
│ ⚠️ Critical: Save These Keys Now!      │
│ You will need the Private Key to login │
│                                         │
│ Private Key ⚠️ (yellow box, red text)  │
│ [████████████████████████████████████]  │
│                                         │
│ Public Key (can be shared)             │
│ [████████████████████████████████████]  │
│                                         │
│ Recovery Phrase (optional backup)      │
│ [████████████████████████████████████]  │
│                                         │
│ 📝 Where to Store Your Keys:           │
│ • Password Manager                      │
│ • Secret Management Tool                │
│ • Encrypted USB drive                   │
│ • Printed copy in safe                  │
│ • Written note (even under pillow 😊)  │
│                                         │
│ Pro tip: Store in at least 2 locations │
│                                         │
│ [Continue to Login]                     │
└─────────────────────────────────────────┘
```

### Step 2: Security Warning Modal
```
┌─────────────────────────────────────────┐
│ 🔒 Important Security Information       │
│                                         │
│ ⚠️ Zero-Knowledge Architecture         │
│ Your documents are encrypted with       │
│ post-quantum cryptography. Only you     │
│ can decrypt them.                       │
│                                         │
│ Before you continue, please confirm:    │
│                                         │
│ ☐ I have saved my Private Key in a     │
│   secure location                       │
│                                         │
│ ☐ I understand that losing my Private  │
│   Key means permanent loss of access    │
│                                         │
│ ☐ I understand there is no password    │
│   reset and no recovery process         │
│                                         │
│ ☐ I understand that if I lose access,  │
│   I will need to create a new account   │
│                                         │
│ 📜 Legal Compliance Note                │
│ Documents stored in Veritas are         │
│ encrypted using NIST-standardized...    │
│                                         │
│ [Go Back] [Proceed to Login] (disabled) │
└─────────────────────────────────────────┘
```

### Step 3: All Confirmed
```
┌─────────────────────────────────────────┐
│ 🔒 Important Security Information       │
│                                         │
│ ⚠️ Zero-Knowledge Architecture         │
│                                         │
│ Before you continue, please confirm:    │
│                                         │
│ ☑ I have saved my Private Key in a     │
│   secure location                       │
│                                         │
│ ☑ I understand that losing my Private  │
│   Key means permanent loss of access    │
│                                         │
│ ☑ I understand there is no password    │
│   reset and no recovery process         │
│                                         │
│ ☑ I understand that if I lose access,  │
│   I will need to create a new account   │
│                                         │
│ 📜 Legal Compliance Note                │
│ Documents stored in Veritas are...      │
│                                         │
│ [Go Back] [I Understand - Proceed ✓]   │
└─────────────────────────────────────────┘
```

## Technical Implementation

### CSS Additions
- `.modal` - Full-screen overlay with dark background
- `.modal-content` - Centered card with max-width
- `.modal-header` - Header with title and close button
- `.modal-body` - Content area with padding
- `.modal-footer` - Action buttons
- `.checkbox-group` - Styled checkbox with label

### JavaScript Functions
- `showSecurityWarningModal()` - Creates and displays the warning modal
- Dynamic checkbox validation - Enables confirm button only when all checked
- Event listeners for cancel/confirm actions

## Key Management Guidance

### What Users Must Save:
1. **Private Key** (REQUIRED) - Needed for every login
2. **Recovery Phrase** (RECOMMENDED) - Backup recovery option

### What Users Don't Need to Save:
- **Public Key** - Stored on server, used for encryption

### Recommended Storage Methods:
1. **Primary**: Password manager (encrypted, backed up)
2. **Backup**: Physical copy in safe/lockbox
3. **Optional**: Secret management service (enterprise users)

## Legal & Compliance

### Cryptographic Standards
- **Kyber-768**: NIST-standardized post-quantum key encapsulation
- **Dilithium-2**: NIST-standardized post-quantum digital signatures
- **AES-256-GCM**: Authenticated encryption

### Blockchain Anchoring
- IPFS distributed storage
- Ethereum mainnet timestamping
- Immutable proof of existence

### Court Admissibility
Documents meet digital evidence standards in:
- 🇺🇸 United States (Federal Rules of Evidence 901, 902)
- 🇪🇺 European Union (eIDAS Regulation)
- 🇬🇧 United Kingdom (Civil Evidence Act)
- 🇦🇺 Australia (Evidence Act)
- And other jurisdictions with blockchain evidence frameworks

## Deployment

✅ **Deployed to Production**: https://veritas-docs-production.rme-6e5.workers.dev

### Production Environment
- **KV Namespace**: 9f0ea31309cd44cab7bfe3569e16aa45
- **System Keys**: Split across DILITHIUM_PRIVATE_KEY_PART1 + PART2 Cloudflare Secrets
- **IPFS**: Pinata production pinning service
- **Blockchain**: VDC blockchain with dual signatures

### Test the Flow:
1. Request activation token from admin
2. Visit activation link: `/activate?token=<your-token>`
3. Fill personal details (encrypted client-side before submission)
4. See enhanced key display with color-coded warnings
5. **Save private key** (required for all future logins)
6. Click "Continue to Login"
7. Read and check all 4 security confirmations
8. Proceed to login only after understanding risks

---

## User Education

The implementation balances:
- **Serious warnings** about key loss consequences (permanent access loss)
- **Friendly guidance** with light touches of humor ("under your pillow")
- **Professional legal compliance** messaging (NIST standards, court admissibility)
- **Clear action items** (checkboxes must all be checked to proceed)
- **Zero-knowledge transparency** (explains why server cannot help with key recovery)

This ensures users cannot proceed without actively acknowledging the zero-knowledge architecture implications while maintaining a pleasant user experience.

---

## Security Architecture References

For comprehensive security details, see:
- [SECURITY_ARCHITECTURE.md](./SECURITY_ARCHITECTURE.md) - Complete security design and threat model
- [ZERO_KNOWLEDGE_ARCHITECTURE.md](./ZERO_KNOWLEDGE_ARCHITECTURE.md) - Zero-knowledge principles and machine identities
- [VDC_INTEGRATION_GUIDE.md](./VDC_INTEGRATION_GUIDE.md) - Blockchain integration and dual signatures
- [ACTIVATION_TOKEN_FLOW.md](./ACTIVATION_TOKEN_FLOW.md) - Activation process technical details

---

**Version**: 1.0.1  
**Last Updated**: January 3, 2025  
**Status**: Production  
**Production URL**: https://veritas-docs-production.rme-6e5.workers.dev
