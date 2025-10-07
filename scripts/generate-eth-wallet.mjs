#!/usr/bin/env node
// Simple local generator for an Ethereum private key and address (no network calls)
// Usage: node scripts/generate-eth-wallet.mjs
// DO NOT commit the output to source control.

import { randomBytes } from 'crypto';
import { privateKeyToAccount } from 'viem/accounts';

function generatePrivateKeyHex() {
  // 32 random bytes -> 64 hex chars; prefix with 0x
  const buf = randomBytes(32);
  return '0x' + buf.toString('hex');
}

function main() {
  const pk = generatePrivateKeyHex();
  const account = privateKeyToAccount(pk);

  // Optional: produce two-part split to store as separate Worker secrets
  const pkNo0x = pk.slice(2);
  const half = Math.ceil(pkNo0x.length / 2);
  const part1 = '0x' + pkNo0x.slice(0, half);
  const part2 = '0x' + pkNo0x.slice(half);

  console.log('===========================================');
  console.log(' Veritas ETH Wallet (local generation only)');
  console.log('===========================================');
  console.log('\n[WARN] Treat the following values as SECRETS.');
  console.log('[WARN] Do NOT commit or paste them into chats.');
  console.log('\nSYSTEM_ETH_PRIVATE_KEY:');
  console.log(pk);
  console.log('\nSYSTEM_ETH_PRIVATE_KEY_PART1 (optional split):');
  console.log(part1);
  console.log('\nSYSTEM_ETH_PRIVATE_KEY_PART2 (optional split):');
  console.log(part2);
  console.log('\nSYSTEM_ETH_FROM_ADDRESS:');
  console.log(account.address);
  console.log('\nNext steps:');
  console.log(' - Store as Cloudflare Worker secrets:');
  console.log('   wrangler secret put SYSTEM_ETH_PRIVATE_KEY');
  console.log('   wrangler secret put SYSTEM_ETH_FROM_ADDRESS');
  console.log('   (or use PART1/PART2 instead of PRIVATE_KEY)');
  console.log(' - Fund the address with a small amount of ETH for gas.');
}

main();
