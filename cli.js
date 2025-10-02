#!/usr/bin/env node

/**
 * Veritas Documents - Admin CLI Tool
 * Command-line interface for admin account management and system bootstrap
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// CLI Colors
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m'
};

function log(message, color = 'white') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ Error: ${message}`, 'red');
  process.exit(1);
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function warning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// Generate secure random string
function generateSecret(length = 32) {
  return crypto.randomBytes(length).toString('hex');
}

// Generate admin account data
function generateAdminAccount(email = 'admin@veritas-documents.com') {
  const adminSecret = generateSecret(32);
  const adminId = `admin_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  return {
    id: adminId,
    email,
    secret: adminSecret,
    createdAt: new Date().toISOString(),
    role: 'admin'
  };
}

// Create a user account directly (for testing/admin purposes)
function createUserAccount(email, accountType = 'admin') {
  const userId = `user_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const privateKey = generateSecret(32); // Mock private key for testing
  const publicKey = generateSecret(32);  // Mock public key for testing
  
  return {
    id: userId,
    email,
    privateKey,
    publicKey,
    accountType,
    createdAt: new Date().toISOString()
  };
}

// Generate environment variables template
function generateEnvTemplate(adminSecret) {
  return `# Veritas Documents - Production Environment Variables
# Copy this to your Cloudflare Workers environment or wrangler.toml

# Stripe Configuration
STRIPE_SECRET_KEY=sk_live_your_stripe_secret_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Maatara Protocol Configuration
MAATARA_CHAIN_PRIVATE_KEY=${generateSecret(64)}

# IPFS Configuration (Cloudflare Gateway)
IPFS_API_KEY=your_cloudflare_ipfs_api_key
IPFS_GATEWAY_URL=https://cloudflare-ipfs.com

# Ethereum Configuration (Cloudflare Web3)
ETHEREUM_RPC_URL=https://cloudflare-eth.com/v1/mainnet
ETHEREUM_PRIVATE_KEY=0x_your_ethereum_private_key
VERITAS_CONTRACT_ADDRESS=0x_your_contract_address

# Admin Configuration
ADMIN_SECRET_KEY=${adminSecret}

# Optional: Pinata for enhanced IPFS pinning
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret_key

# System Configuration
ENVIRONMENT=production
MAATARA_API_BASE=https://maatara-core-worker.rme-6e5.workers.dev
`;
}

// Generate PowerShell commands for setting secrets
function generatePowerShellCommands(adminSecret) {
  const secrets = {
    'STRIPE_SECRET_KEY': 'sk_live_your_stripe_secret_key_here',
    'STRIPE_WEBHOOK_SECRET': 'whsec_your_webhook_secret_here',
    'MAATARA_CHAIN_PRIVATE_KEY': generateSecret(64),
    'IPFS_API_KEY': 'your_cloudflare_ipfs_api_key',
    'ADMIN_SECRET_KEY': adminSecret,
    'ETHEREUM_PRIVATE_KEY': '0x_your_ethereum_private_key',
    'VERITAS_CONTRACT_ADDRESS': '0x_your_contract_address',
    'PINATA_API_KEY': 'your_pinata_api_key',
    'PINATA_SECRET_KEY': 'your_pinata_secret_key'
  };

  let commands = '# Veritas Documents - PowerShell Commands for Cloudflare Secrets\n';
  commands += '# Run these commands in PowerShell to set up your production secrets\n\n';

  for (const [key, value] of Object.entries(secrets)) {
    commands += `wrangler secret put ${key} --env production\n`;
    commands += `# When prompted, enter: ${value}\n\n`;
  }

  return commands;
}

// Main CLI logic
function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  log('🔐 Veritas Documents - Admin CLI Tool', 'cyan');
  log('=====================================', 'cyan');

  switch (command) {
    case 'generate-admin':
      const email = args[1] || 'admin@veritas-documents.com';
      info(`Generating admin account for: ${email}`);

      const adminAccount = generateAdminAccount(email);

      success('Admin account generated successfully!');
      log('\n📋 Admin Account Details:', 'yellow');
      log(`ID: ${adminAccount.id}`);
      log(`Email: ${adminAccount.email}`);
      log(`Secret Key: ${adminAccount.secret}`);
      log(`Created: ${adminAccount.createdAt}`);

      warning('\n⚠️  IMPORTANT: Save this secret key securely!');
      warning('This key is required for admin operations and cannot be recovered.');

      // Generate environment template
      const envTemplate = generateEnvTemplate(adminAccount.secret);
      const envFile = 'production-env-template.txt';

      try {
        writeFileSync(envFile, envTemplate);
        success(`\n📄 Environment template saved to: ${envFile}`);
      } catch (err) {
        error(`Failed to save environment template: ${err.message}`);
      }

      // Generate PowerShell commands
      const psCommands = generatePowerShellCommands(adminAccount.secret);
      const psFile = 'setup-secrets.ps1';

      try {
        writeFileSync(psFile, psCommands);
        success(`📄 PowerShell setup script saved to: ${psFile}`);
        info('\n💡 Next Steps:');
        info('1. Save the admin secret key in a secure location');
        info('2. Run the PowerShell script to configure Cloudflare secrets');
        info('3. Update the template with your real API keys');
        info('4. Deploy to production: wrangler deploy --env production');
      } catch (err) {
        error(`Failed to save PowerShell script: ${err.message}`);
      }
      break;

    case 'generate-secrets':
      info('Generating production secrets template...');

      const templateSecret = generateSecret(32);
      const envTemplate2 = generateEnvTemplate(templateSecret);
      const psCommands2 = generatePowerShellCommands(templateSecret);

      try {
        writeFileSync('production-env-template.txt', envTemplate2);
        writeFileSync('setup-secrets.ps1', psCommands2);

        success('✅ Production secrets template generated!');
        success('📄 Files created: production-env-template.txt, setup-secrets.ps1');
        info('\n💡 Usage:');
        info('1. Edit production-env-template.txt with your real credentials');
        info('2. Run setup-secrets.ps1 in PowerShell to configure Cloudflare');
        info('3. Deploy: wrangler deploy --env production');
      } catch (err) {
        error(`Failed to generate secrets: ${err.message}`);
      }
      break;

    case 'create-user':
      const userEmail = args[1] || 'admin@veritas-documents.com';
      const accountType = args[2] || 'admin';
      
      info(`Creating ${accountType} user account for: ${userEmail}`);
      
      const userAccount = createUserAccount(userEmail, accountType);
      
      success('User account data generated!');
      log('\n👤 User Account Details:', 'yellow');
      log(`ID: ${userAccount.id}`);
      log(`Email: ${userAccount.email}`);
      log(`Account Type: ${userAccount.accountType}`);
      log(`Private Key: ${userAccount.privateKey}`);
      log(`Public Key: ${userAccount.publicKey}`);
      log(`Created: ${userAccount.createdAt}`);
      
      warning('\n⚠️  IMPORTANT: This generates data but does not create the user in KV store!');
      warning('To create a real user account that can log in, use the PowerShell script:');
      
      log('\n� Production User Creation:', 'cyan');
      log(`.\\create-production-user.ps1 -Email "${userAccount.email}" -AccountType ${userAccount.accountType}`);
      
      log('\n🔗 Or manually create with wrangler:', 'cyan');
      log(`wrangler kv:key put "user:email:${userAccount.email}" "${userAccount.id}" --binding VERITAS_KV --env production`);
      log(`wrangler kv:key put "user:${userAccount.id}" '<user-json>' --binding VERITAS_KV --env production`);
      
      success(`\n✅ Use the private key "${userAccount.privateKey}" to log into the platform after creating the account!`);
      break;
      info('Validating project configuration...');

      // Check if required files exist
      const requiredFiles = [
        'package.json',
        'wrangler.toml',
        'src/index.ts',
        'src/utils/crypto.ts',
        'src/utils/ipfs.ts',
        'src/utils/ethereum.ts'
      ];

      let allFilesExist = true;
      for (const file of requiredFiles) {
        try {
          readFileSync(join(process.cwd(), file));
          log(`✅ ${file}`, 'green');
        } catch (err) {
          log(`❌ ${file} - Missing`, 'red');
          allFilesExist = false;
        }
      }

      if (allFilesExist) {
        success('\n🎉 Project configuration is valid!');
        info('Ready for production deployment.');
      } else {
        error('\n❌ Project configuration is incomplete.');
        info('Please ensure all required files are present.');
      }
      break;

    case 'help':
    default:
      log('\n📖 Available Commands:', 'yellow');
      log('  generate-admin [email]    Generate admin account and setup files');
      log('  create-user [email] [type] Create user account for platform login');
      log('  generate-secrets          Generate production secrets template');
      log('  validate-config           Validate project configuration');
      log('  help                      Show this help message');

      log('\n📝 Examples:', 'cyan');
      log('  node cli.js generate-admin admin@company.com');
      log('  node cli.js create-user admin@company.com admin    # Generate user data');
      log('  .\\create-production-user.ps1 -Email admin@company.com  # Create real user');
      log('  .\\create-user-api.ps1 -Email admin@company.com -BaseUrl https://app.workers.dev  # Via API');
      log('  node cli.js generate-secrets');
      log('  node cli.js validate-config');

      log('\n🔗 Learn More:', 'blue');
      log('  See README.md and TECHNICAL_STATUS.md for detailed documentation');
      break;
  }
}

// Run CLI
main();