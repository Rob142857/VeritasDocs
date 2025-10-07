# IPFS Privacy Quick Reference

## Privacy-Aware Metadata Architecture

```
┌──────────────────────────────────────────────────────────┐
│           USER CREATES DOCUMENT                          │
│                                                          │
│  Privacy Choice:                                         │
│  ┌──────────────────┐        ┌──────────────────┐      │
│  │ ☐ Keep Private   │   OR   │ ☑ Make Public    │      │
│  │   (Default)      │        │                  │      │
│  └──────────────────┘        └──────────────────┘      │
└──────────────────────────────────────────────────────────┘
                     ↓                    ↓
        ┌────────────────────┐  ┌────────────────────┐
        │  PRIVATE METADATA  │  │  PUBLIC METADATA   │
        │                    │  │                    │
        │  IPFS Contains:    │  │  IPFS Contains:    │
        │  • Asset ID        │  │  • Asset ID        │
        │  • IPFS Hash       │  │  • IPFS Hash       │
        │  • Timestamp       │  │  • Timestamp       │
        │  • Public Keys     │  │  • Public Keys     │
        │                    │  │  • Title           │
        │  IPFS Excludes:    │  │  • Description     │
        │  • Title           │  │  • Document Type   │
        │  • Description     │  │  • User IDs        │
        │  • Document Type   │  │  • Filename        │
        │  • User IDs        │  │                    │
        │  • Filename        │  │  Privacy: USER     │
        │                    │  │  CHOICE 🌐         │
        │  Privacy: MAXIMUM  │  │                    │
        │  🔒                │  │                    │
        └────────────────────┘  └────────────────────┘
```

## At-a-Glance Comparison

### Private Document (Default)
```
☐ Make Publicly Searchable: OFF

IPFS Metadata Contains:
✅ Asset ID
✅ IPFS Hash
✅ Timestamp
✅ Public Keys
❌ NO Title
❌ NO Description
❌ NO User IDs
❌ NO Filename

Privacy Level: MAXIMUM 🔒
```

### Public Document
```
☑ Make Publicly Searchable: ON

IPFS Metadata Contains:
✅ Asset ID
✅ IPFS Hash
✅ Timestamp
✅ Public Keys
✅ Title
✅ Description
✅ User IDs
✅ Filename

Privacy Level: USER CHOICE 🌐
```

## Storage Locations

| Data Type | IPFS (Public) | KV (Private) | R2 (Private) | VDC (Blockchain) |
|-----------|---------------|--------------|--------------|------------------|
| Document Content | Encrypted ✅ | No | Encrypted ✅ | Hash only |
| Title | Conditional* | Yes ✅ | No | Yes ✅ |
| Description | Conditional* | Yes ✅ | No | Yes ✅ |
| User IDs | Conditional* | Yes ✅ | Yes ✅ | Yes ✅ |
| Filename | Conditional* | Yes ✅ | Yes ✅ | No |
| Public Keys | Yes ✅ | Yes ✅ | No | Yes ✅ |

*Conditional = Only if `isPubliclySearchable: true`

## Verification Steps

### Verify Private Document Privacy
```bash
# 1. Get metadata hash
curl https://veritas-docs.example/api/web3-assets/web3/{assetId}

# 2. Check IPFS metadata
curl https://ipfs.io/ipfs/{metadataHash}

# 3. Verify output contains ONLY:
# - id
# - ipfsHash
# - createdAt
# - isPubliclySearchable: false
# - ownerPublicKey
# - creatorPublicKey
```

## Privacy Guarantees

✅ **Document Content**: Always encrypted with Kyber-768  
✅ **Private Keys**: Never leave the browser  
✅ **Private Metadata**: No identifying info in IPFS  
✅ **Access Control**: Authentication required for full details  
✅ **GDPR Compliant**: Minimal data processing  
✅ **Quantum Resistant**: NIST-standardized PQC  

## Legal Compliance

| Requirement | Implementation |
|-------------|----------------|
| GDPR Art. 5 (Data Minimization) | ✅ Minimal IPFS metadata for private docs |
| GDPR Art. 6 (Lawful Basis) | ✅ User consent for public disclosure |
| GDPR Art. 25 (Privacy by Design) | ✅ Private mode is default |
| eIDAS (Electronic Signatures) | ✅ Dilithium-2 signatures |
| UETA/ESIGN (US) | ✅ Compliant digital signatures |

---

**For full documentation, see**: [IPFS_STORAGE_ARCHITECTURE.md](./IPFS_STORAGE_ARCHITECTURE.md)
