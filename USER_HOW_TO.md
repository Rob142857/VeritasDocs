# How to Use Veritas Documents - Complete User Guide

**Version**: 1.1.0  
**Last Updated**: October 3, 2025  
**Audience**: New Users, Standard Users  
**Category**: User Guide  
**Summary**: Step-by-step guide for new users from activation link to asset creation, checking, and future ownership assignment.  
**Keywords**: user-guide, how-to, activation, documents, assets

---

## 🎯 Welcome to Veritas Documents!

**Veritas Documents** is a secure platform for storing deeds and legal documents using post-quantum cryptography. This guide will walk you through every step, from receiving your invitation to managing your documents.

**Important Security Notes:**
- 🔐 Your private keys are generated in your browser and never sent to our servers
- 📱 Everything works on mobile devices and computers
- ⚡ The process is designed to be simple but secure
- 💾 Always download and save your private keys when prompted

---

## 📧 Step 1: Receive Your Activation Link

### How You Get Started

You'll receive an **activation link** via email from an administrator:

```
Subject: Your Veritas Documents Account Invitation

Dear [Your Name],

You've been invited to join Veritas Documents for secure legal document storage.

Click here to activate: https://veritas-docs-production.rme-6e5.workers.dev/activate?token=abc123...

This link expires in 7 days.
```

### What This Link Contains
- ✅ **Your email address** (pre-filled for convenience)
- ✅ **Account type** (admin or standard user)
- ✅ **Expiration date** (7 days from creation)
- ✅ **Unique token** (one-time use only)

**Security Note:** Never share this link with others - it's tied to your email and account type.

---

## 🔐 Step 2: Account Activation

### Visit the Activation Link

1. **Click the link** in your email
2. **You'll see the activation page** with a form

### Fill Out Personal Details

Complete the required information:

```
📝 Personal Information Form:
• Full Name: [Your full legal name]
• Date of Birth: [MM/DD/YYYY]
• Address: [Your complete address]
• Phone Number: [Your phone number]
• Email: [Pre-filled from invitation]
```

**Privacy Protection:** This information is encrypted with your own keys before leaving your device.

### Client-Side Key Generation

**This happens automatically in your browser:**

1. **Kyber-768 Keypair Generated**
   - **Public Key**: For encrypting your documents
   - **Private Key**: For decrypting your documents (keep secret!)

2. **Dilithium-2 Keypair Generated**
   - **Public Key**: For verifying your signatures
   - **Private Key**: For signing transactions (keep secret!)

3. **Recovery Phrase Generated**
   - **12-word mnemonic** for backing up your keys
   - **BIP39 standard** (works with many wallet apps)

**What you see:**
```
🔄 Generating your cryptographic keys...
This may take 1-2 seconds...
✅ Keys generated successfully!
```

### Data Encryption

**Your personal information gets encrypted:**

1. **Data collected** from the form
2. **Encrypted with your Kyber public key**
3. **Only you can decrypt it** (using your Kyber private key)

### Blockchain Registration

**Your account gets registered on the VDC blockchain:**

1. **Transaction created** with your encrypted data
2. **Signed with your Dilithium private key**
3. **Verified by the system**
4. **Added to the blockchain** (permanent record)

### Download Your Keys

**CRITICAL STEP - Save your keys immediately!**

You'll see a screen with your keys:

```
🎉 Account Activated Successfully!

⚠️  IMPORTANT: Save these keys immediately!

📄 Recovery Phrase (write this down):
witch collapse practice feed shame open despair creek road again ice least

🔑 Kyber Private Key:
base64url-encoded-key-here...

🔑 Dilithium Private Key:
base64url-encoded-key-here...

💾 Download JSON File (recommended)
[Download Keys] button
```

**What to do:**
1. **Write down the recovery phrase** on paper and store securely
2. **Click "Download Keys"** to save a JSON file
3. **Store the JSON file** in a password manager (1Password, Bitwarden, etc.)
4. **Delete the email** containing this information

**Security Warning:**
- 🔴 **Never share these keys** with anyone
- 🔴 **Never send them via email** (use secure storage only)
- 🔴 **If you lose them**, you lose access to your account
- 🟢 **Recovery phrase** can restore your keys if needed

### Confirmation

After saving your keys, check the confirmation box and continue to login.

---

## 🔑 Step 3: Login to Your Account

### Access the Login Page

1. **Go to the main site**: https://veritas-docs-production.rme-6e5.workers.dev
2. **Click "Login"** or go to `/login`

### Zero-Knowledge Login

**This is different from regular logins:**

```
Traditional Login:
Username: your@email.com
Password: ********

Veritas Login:
Email: your@email.com
Private Key: [paste Kyber private key]
```

### How It Works

1. **Enter your email** and **Kyber private key**
2. **Server retrieves** your encrypted data from blockchain
3. **Your browser attempts** to decrypt the data
4. **If decryption succeeds** → Login successful
5. **If decryption fails** → Invalid key, access denied

**Why this is secure:**
- ✅ Server never sees your unencrypted data
- ✅ Server never learns your private key
- ✅ You prove ownership through cryptography
- ✅ No passwords to steal or forget

### Successful Login

After successful login, you'll see:
- ✅ Your account dashboard
- ✅ Account type (admin or standard user)
- ✅ Access to document management
- ✅ Your blockchain transaction details

---

## 📄 Step 4: Create Your First Asset (Document)

### Access Document Creation

1. **From dashboard**, click "Create Asset" or "Upload Document"
2. **Select document type** (will, contract, agreement, etc.)

### Document Upload Process

1. **Select File**
   ```
   Choose file: [Browse files...]
   Supported: PDF, DOC, DOCX, TXT, images
   ```

2. **Add Metadata**
   ```
   Title: [Document title]
   Description: [Optional description]
   Tags: [Keywords for searching]
   ```

3. **Payment Processing**
   ```
   Document storage fee: $25.00
   Payment method: [Stripe integration]
   ```

### Client-Side Encryption

**Your document gets encrypted before upload:**

1. **Document read** into memory
2. **Encrypted with Kyber-768** using your public key
3. **Only you can decrypt** it later
4. **Server never sees** the unencrypted content

### IPFS Storage

**Encrypted document gets stored permanently:**

1. **Uploaded to IPFS** network
2. **Gets a content address** (like a permanent URL)
3. **Pinned via Pinata** to ensure availability
4. **IPFS hash recorded** in blockchain

### Blockchain Transaction

**Document creation gets recorded:**

1. **VDC transaction created** with document details
2. **Signed with your Dilithium private key**
3. **System signature added** for validation
4. **Added to blockchain** with IPFS reference

### Ethereum Anchoring (Optional)

**For additional security:**

1. **Merkle super root** calculated
2. **Anchored to Ethereum** blockchain
3. **Permanent timestamp** recorded
4. **Ultimate tamper protection**

### Completion

**Success message:**
```
✅ Document uploaded successfully!
📄 IPFS Hash: QmXxxx...
⛓️  Blockchain TX: tx_20251003_123456
🌍 Ethereum Anchor: 0x8f4e2c9a...
💾 Download receipt: [Download]
```

---

## 🔍 Step 5: Check Your Assets

### View Your Documents

1. **Go to "My Assets"** or "My Documents"
2. **See list of all your documents**

### Document Details

For each document, you'll see:
```
📄 Legal Contract - October 3, 2025
Status: ✅ Active
IPFS Hash: QmXxxx... [View on IPFS]
Blockchain TX: tx_20251003_123456 [View on VDC]
Ethereum Anchor: 0x8f4e2c9a... [View on Etherscan]
Size: 2.3 MB
Encrypted: ✅ Yes
```

### Verify Document Integrity

**Check that your document hasn't changed:**

1. **Click "Verify"** on any document
2. **System recalculates** document hash
3. **Compares with blockchain record**
4. **Confirms integrity** ✅

### Download Document

**Access your document:**

1. **Click "Download"** or "Decrypt"**
2. **Enter your Kyber private key** (if prompted)
3. **Document decrypted** in your browser
4. **Download starts** automatically

**Security Note:** Decryption happens in your browser - the server never sees the unencrypted content.

---

## 🔄 Step 6: Asset Ownership (Future Feature)

*Note: This feature is planned for future implementation*

### How Ownership Transfer Will Work

**When available, you'll be able to:**

1. **Select a document** you own
2. **Choose recipient** by email address
3. **Create transfer transaction**
4. **Sign with your Dilithium key**
5. **Recipient accepts** the transfer
6. **Ownership updated** in blockchain

### Security Features

- ✅ **Cryptographic proof** of ownership transfer
- ✅ **Complete audit trail** in blockchain
- ✅ **Recipient verification** required
- ✅ **No document content** exposure during transfer

### Legal Implications

- ✅ **Clear chain of custody**
- ✅ **Court-admissible** transfer records
- ✅ **Timestamped** transfer events
- ✅ **Non-repudiation** (cannot deny transfer)

---

## 🛡️ Security Best Practices

### Key Management

**Store your keys securely:**
- ✅ **Password manager** (1Password, Bitwarden, LastPass)
- ✅ **Hardware security key** (YubiKey, etc.)
- ✅ **Offline backup** (printed recovery phrase)
- ❌ **Email storage** (not secure)
- ❌ **Unencrypted files** (vulnerable)

### Recovery Planning

**If you lose your keys:**
1. **Use recovery phrase** to regenerate keys
2. **Contact support** for account recovery
3. **Provide identity verification**
4. **New keys issued** (old ones deactivated)

### Regular Verification

**Check your documents regularly:**
- ✅ **Verify integrity** monthly
- ✅ **Download and check** important documents
- ✅ **Review access logs** (when available)
- ✅ **Update contact information** if needed

---

## 🆘 Troubleshooting

### Common Issues

#### "Invalid Private Key" on Login
- ✅ **Check for typos** in the key
- ✅ **Ensure correct key type** (use Kyber private key for login)
- ✅ **Try recovery phrase** if keys are lost

#### "Document Decryption Failed"
- ✅ **Use correct Kyber private key**
- ✅ **Check key format** (should be base64url)
- ✅ **Try different browser** if WASM fails

#### "Upload Failed"
- ✅ **Check file size** (under limits)
- ✅ **Verify file type** (supported formats)
- ✅ **Check internet connection**
- ✅ **Try again** (temporary network issues)

#### "Payment Failed"
- ✅ **Check card details**
- ✅ **Verify sufficient funds**
- ✅ **Contact bank** if declined
- ✅ **Try different payment method**

### Getting Help

**Support Options:**
- 📧 **Email support** (available in dashboard)
- 📖 **Documentation** (this guide)
- 🔍 **FAQ section** (common questions)
- 💬 **Community forums** (peer support)

---

## 📊 Understanding Your Account

### Account Types

**Standard User (You):**
- ✅ Create and manage your own documents
- ✅ Search public documents
- ✅ Full cryptographic security
- ❌ Cannot invite other users

**Admin User:**
- ✅ All standard user features
- ✅ Invite new users to the platform
- ✅ Manage platform settings
- ✅ View system statistics

### Account Security

**Your account is protected by:**
- 🔐 **Post-quantum cryptography** (Kyber + Dilithium)
- 🌍 **Multi-layer storage** (KV + IPFS + Ethereum)
- ⛓️ **Blockchain verification** (VDC + Ethereum anchoring)
- 🔒 **Zero-knowledge architecture** (server never sees secrets)

### Cost Structure

**Current pricing:**
- 💰 **Account creation**: Free
- 💰 **Document storage**: $25 per document
- 💰 **Verification**: Free
- 💰 **Downloads**: Free

---

## 🚀 Advanced Features

### Public Document Search

1. **Go to "Search"** or "Public Documents"**
2. **Enter keywords** (contract, will, agreement, etc.)
3. **Filter by type** and date
4. **View public documents** (metadata only)

### Document Sharing (Future)

*Planned feature for secure document sharing without full transfer*

### API Access (Admin)

*Admin users can access platform APIs for integration*

---

## 📋 Quick Reference

### Important URLs
- **Main Site**: https://veritas-docs-production.rme-6e5.workers.dev
- **Login**: `/login`
- **Dashboard**: `/dashboard`
- **Create Asset**: `/assets/create`

### Key Actions
- **Login**: Email + Kyber private key
- **Create Document**: Upload → Encrypt → Pay → Store
- **Check Document**: View details → Verify → Download
- **Backup Keys**: Download JSON + Write recovery phrase

### Security Reminders
- 🔑 **Never share private keys**
- 💾 **Always backup recovery phrase**
- 🔍 **Verify documents regularly**
- ⚡ **Use strong, unique passwords** for email

---

## 🎯 Next Steps

### After Activation
1. ✅ **Save your keys securely**
2. ✅ **Login to your account**
3. ✅ **Upload your first document**
4. ✅ **Verify document integrity**
5. ✅ **Set up regular backups**

### Ongoing Usage
- 📄 **Upload important documents** as needed
- 🔍 **Check documents** periodically
- 💾 **Backup keys** if you change devices
- 📧 **Keep email updated** for notifications

---

**🎉 You're Now Ready to Use Veritas Documents!**

*Secure, private, and future-proof legal document storage*

**Need Help?** Contact support or refer to this guide.

**Version**: 1.1.0  
**Last Updated**: October 3, 2025