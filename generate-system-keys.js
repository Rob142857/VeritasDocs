/**
 * Generate System Master Keys for Veritas Documents Chain (VDC)
 * 
 * This script generates the master Dilithium and Kyber keypairs that will be used
 * to sign all blocks and validate all transactions on the VDC blockchain.
 * 
 * SECURITY CRITICAL:
 * - Run this ONCE in a secure environment
 * - Store private keys in Cloudflare Secrets ONLY
 * - Never commit private keys to git
 * - Public keys can be safely committed to code
 * 
 * Usage:
 *   node generate-system-keys.js
 */

import { initWasm, kyberKeygen, dilithiumKeygen } from '@maatara/core-pqc';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadWasmBytes() {
  const wasmPath = path.join(__dirname, 'node_modules', '@maatara', 'core-pqc-wasm', 'core_pqc_wasm_bg.wasm');
  return fs.readFileSync(wasmPath);
}

async function generateSystemMasterKeys() {
  console.log('🔐 Veritas Documents Chain (VDC) - System Master Key Generation\n');
  
  // Initialize Maatara WASM
  console.log('📦 Initializing Maatara PQC library...');
  await initWasm(loadWasmBytes());
  console.log('✅ Maatara initialized\n');
  
  // Generate Dilithium keypair for signing
  console.log('🔑 Generating Dilithium-2 keypair (for signing blocks & transactions)...');
  const dilithiumKeypair = await dilithiumKeygen();
  const dilithiumPublicKey = dilithiumKeypair.public_b64u;
  const dilithiumPrivateKey = dilithiumKeypair.secret_b64u;
  const dilithiumPrivatePart1 = dilithiumPrivateKey.slice(0, Math.ceil(dilithiumPrivateKey.length / 2));
  const dilithiumPrivatePart2 = dilithiumPrivateKey.slice(Math.ceil(dilithiumPrivateKey.length / 2));
  console.log('✅ Dilithium keypair generated');
  console.log(`   Public Key Length: ${dilithiumPublicKey.length} chars`);
  console.log(`   Private Key Length: ${dilithiumPrivateKey.length} chars\n`);
  
  // Generate Kyber keypair for encryption
  console.log('🔑 Generating Kyber-768 keypair (for encrypting system data)...');
  const kyberKeypair = await kyberKeygen();
  const kyberPublicKey = kyberKeypair.public_b64u;
  const kyberPrivateKey = kyberKeypair.secret_b64u;
  console.log('✅ Kyber keypair generated');
  console.log(`   Public Key Length: ${kyberPublicKey.length} chars`);
  console.log(`   Private Key Length: ${kyberPrivateKey.length} chars\n`);
  
  // Generate key version ID
  const keyVersion = 1;
  const keyId = `vdc-master-v${keyVersion}-${Date.now()}`;
  
  // Prepare output
  const systemKeys = {
    keyVersion,
    keyId,
    generatedAt: new Date().toISOString(),
    dilithium: {
      publicKey: dilithiumPublicKey,
      privateKey: dilithiumPrivateKey,
      privateKeyPart1: dilithiumPrivatePart1,
      privateKeyPart2: dilithiumPrivatePart2,
      algorithm: 'Dilithium-2'
    },
    kyber: {
      publicKey: kyberPublicKey,
      privateKey: kyberPrivateKey,
      algorithm: 'Kyber-768'
    }
  };
  
  // Save to file (temporarily, for setup)
  const outputFile = 'system-master-keys.json';
  fs.writeFileSync(outputFile, JSON.stringify(systemKeys, null, 2));
  console.log(`💾 Keys saved to: ${outputFile}`);
  console.log('⚠️  WARNING: This file contains PRIVATE KEYS - handle with extreme care!\n');
  
  // Generate .env file for local development
  const envContent = `# Veritas Documents Chain (VDC) - System Master Keys
# Generated: ${new Date().toISOString()}
# Key Version: ${keyVersion}

# Dilithium-2 (Signing)
SYSTEM_DILITHIUM_PUBLIC_KEY="${dilithiumPublicKey}"
SYSTEM_DILITHIUM_PRIVATE_KEY="${dilithiumPrivateKey}"
SYSTEM_DILITHIUM_PRIVATE_KEY_PART1="${dilithiumPrivatePart1}"
SYSTEM_DILITHIUM_PRIVATE_KEY_PART2="${dilithiumPrivatePart2}"

# Kyber-768 (Encryption)
SYSTEM_KYBER_PUBLIC_KEY="${kyberPublicKey}"
SYSTEM_KYBER_PRIVATE_KEY="${kyberPrivateKey}"

# Key Metadata
SYSTEM_KEY_VERSION="${keyVersion}"
SYSTEM_KEY_ID="${keyId}"
`;
  
  fs.writeFileSync('.env.system-keys', envContent);
  console.log(`💾 Environment variables saved to: .env.system-keys\n`);
  
  // Generate Cloudflare secrets setup script
  const secretsScript = `# Cloudflare Secrets Setup Script
# Run these commands to store system master keys in Cloudflare Workers

# Dilithium Private Key (for signing blocks and transactions)
wrangler secret put SYSTEM_DILITHIUM_PRIVATE_KEY --env production
# When prompted, paste: ${dilithiumPrivateKey}

# Dilithium Private Key Parts (Cloudflare secret limit workaround)
wrangler secret put SYSTEM_DILITHIUM_PRIVATE_KEY_PART1 --env production
# When prompted, paste: ${dilithiumPrivatePart1}

wrangler secret put SYSTEM_DILITHIUM_PRIVATE_KEY_PART2 --env production
# When prompted, paste: ${dilithiumPrivatePart2}

# Kyber Private Key (for encrypting system data)
wrangler secret put SYSTEM_KYBER_PRIVATE_KEY --env production
# When prompted, paste: ${kyberPrivateKey}

# Key Version
wrangler secret put SYSTEM_KEY_VERSION --env production
# When prompted, paste: ${keyVersion}

# Key ID
wrangler secret put SYSTEM_KEY_ID --env production
# When prompted, paste: ${keyId}

# Verify secrets are set
wrangler secret list --env production
`;
  
  fs.writeFileSync('setup-cloudflare-secrets.sh', secretsScript);
  console.log(`💾 Cloudflare setup script saved to: setup-cloudflare-secrets.sh\n`);
  
  // Generate PowerShell version
  const psScriptLines = [
    '# Cloudflare Secrets Setup Script (PowerShell)',
    '# Run these commands to store system master keys in Cloudflare Workers',
    '',
    'Write-Host "Setting up Veritas Documents Chain (VDC) System Master Keys..." -ForegroundColor Cyan',
    '',
    '# Dilithium Private Key',
  'Write-Host "Setting SYSTEM_DILITHIUM_PRIVATE_KEY..." -ForegroundColor Yellow',
  `"${dilithiumPrivateKey}" | wrangler secret put SYSTEM_DILITHIUM_PRIVATE_KEY --env production`,
  '',
  'Write-Host "Setting SYSTEM_DILITHIUM_PRIVATE_KEY_PART1..." -ForegroundColor Yellow',
  `"${dilithiumPrivatePart1}" | wrangler secret put SYSTEM_DILITHIUM_PRIVATE_KEY_PART1 --env production`,
  '',
  'Write-Host "Setting SYSTEM_DILITHIUM_PRIVATE_KEY_PART2..." -ForegroundColor Yellow',
  `"${dilithiumPrivatePart2}" | wrangler secret put SYSTEM_DILITHIUM_PRIVATE_KEY_PART2 --env production`,
    '',
    '# Kyber Private Key',
  'Write-Host "Setting SYSTEM_KYBER_PRIVATE_KEY..." -ForegroundColor Yellow',
  `"${kyberPrivateKey}" | wrangler secret put SYSTEM_KYBER_PRIVATE_KEY --env production`,
    '',
    '# Key Version',
    'Write-Host "Setting SYSTEM_KEY_VERSION..." -ForegroundColor Yellow',
    `"${keyVersion}" | wrangler secret put SYSTEM_KEY_VERSION --env production`,
    '',
    '# Key ID',
    'Write-Host "Setting SYSTEM_KEY_ID..." -ForegroundColor Yellow',
    `"${keyId}" | wrangler secret put SYSTEM_KEY_ID --env production`,
    '',
    '# Dilithium Public Key',
  'Write-Host "Setting SYSTEM_DILITHIUM_PUBLIC_KEY..." -ForegroundColor Yellow',
  `"${dilithiumPublicKey}" | wrangler secret put SYSTEM_DILITHIUM_PUBLIC_KEY --env production`,
    '',
    '# Kyber Public Key',
  'Write-Host "Setting SYSTEM_KYBER_PUBLIC_KEY..." -ForegroundColor Yellow',
  `"${kyberPublicKey}" | wrangler secret put SYSTEM_KYBER_PUBLIC_KEY --env production`,
    '',
    'Write-Host "All secrets configured!" -ForegroundColor Green',
    'Write-Host "Verifying secrets..." -ForegroundColor Cyan',
    'wrangler secret list --env production'
  ];
  
  fs.writeFileSync('setup-cloudflare-secrets.ps1', psScriptLines.join('\n'));
  console.log(`💾 PowerShell setup script saved to: setup-cloudflare-secrets.ps1\n`);
  
  // Generate public keys file (safe to commit)
  const publicKeys = {
    keyVersion,
    keyId,
    generatedAt: new Date().toISOString(),
    dilithium: {
      publicKey: dilithiumPublicKey,
      algorithm: 'Dilithium-2'
    },
    kyber: {
      publicKey: kyberPublicKey,
      algorithm: 'Kyber-768'
    }
  };
  
  fs.writeFileSync('system-public-keys.json', JSON.stringify(publicKeys, null, 2));
  console.log(`💾 Public keys saved to: system-public-keys.json (safe to commit)\n`);
  
  // Generate TypeScript constants file
  const tsConstants = `/**
 * Veritas Documents Chain (VDC) - System Master Public Keys
 * 
 * These public keys are used to verify block signatures and system signatures.
 * The corresponding private keys are stored securely in Cloudflare Secrets.
 * 
 * Generated: ${new Date().toISOString()}
 * Key Version: ${keyVersion}
 */

export const VDC_SYSTEM_KEYS = {
  VERSION: ${keyVersion},
  KEY_ID: '${keyId}',
  
  // Dilithium-2 Public Key (for verifying signatures)
  DILITHIUM_PUBLIC_KEY: '${dilithiumPublicKey}',
  
  // Kyber-768 Public Key (for encryption)
  KYBER_PUBLIC_KEY: '${kyberPublicKey}',
  
  GENERATED_AT: '${new Date().toISOString()}'
} as const;

export type VDCSystemKeys = typeof VDC_SYSTEM_KEYS;
`;
  
  fs.writeFileSync('src/vdc-system-keys.ts', tsConstants);
  console.log(`💾 TypeScript constants saved to: src/vdc-system-keys.ts (safe to commit)\n`);
  
  // Print setup instructions
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🎉 SYSTEM MASTER KEYS GENERATED SUCCESSFULLY!');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('📋 NEXT STEPS:\n');
  
  console.log('1️⃣  SECURE THE PRIVATE KEYS:');
  console.log('   ⚠️  system-master-keys.json contains PRIVATE KEYS!');
  console.log('   ⚠️  .env.system-keys contains PRIVATE KEYS!');
  console.log('   → Store these in a password manager or secure vault');
  console.log('   → NEVER commit these files to git');
  console.log('   → Delete after storing in Cloudflare Secrets\n');
  
  console.log('2️⃣  CONFIGURE CLOUDFLARE SECRETS:');
  console.log('   Run the PowerShell script:');
  console.log('   → .\\setup-cloudflare-secrets.ps1\n');
  
  console.log('3️⃣  COMMIT PUBLIC KEYS:');
  console.log('   These files are SAFE to commit:');
  console.log('   → system-public-keys.json');
  console.log('   → src/vdc-system-keys.ts\n');
  
  console.log('4️⃣  UPDATE .gitignore:');
  console.log('   Add these lines to .gitignore:');
  console.log('   → system-master-keys.json');
  console.log('   → .env.system-keys');
  console.log('   → setup-cloudflare-secrets.sh');
  console.log('   → setup-cloudflare-secrets.ps1\n');
  
  console.log('5️⃣  INITIALIZE GENESIS BLOCK:');
  console.log('   After deploying with secrets, run:');
  console.log('   → node initialize-genesis-block.js\n');
  
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('🔒 SECURITY REMINDERS:');
  console.log('   • Private keys grant FULL CONTROL of the VDC blockchain');
  console.log('   • If lost, you CANNOT sign new blocks');
  console.log('   • If compromised, attacker can forge blocks');
  console.log('   • Store securely and create encrypted backups');
  console.log('   • Consider multi-signature or hardware security modules for production\n');
  
  return systemKeys;
}

// Run the generator
generateSystemMasterKeys()
  .then(() => {
    console.log('✅ Key generation complete!\n');
    process.exit(0);
  })
  .catch((error) => {
    console.error('❌ Error generating keys:', error);
    process.exit(1);
  });
