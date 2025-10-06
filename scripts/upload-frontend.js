#!/usr/bin/env node
/**
 * Uploads the frontend bundle (app.bundle.js) and PQC WASM to KV so the Worker can serve them at /static/*.
 *
 * Keys expected by the Worker:
 * - app-bundle  -> JS bundle built at public/app.bundle.js
 * - pqc-wasm    -> WASM file at public/core_pqc_wasm_bg.wasm
 *
 * Requires Wrangler login and the KV namespace id. Uses VERITAS_KV_ID if set, else defaults to production id.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const KV_ID = process.env.VERITAS_KV_ID || '9f0ea31309cd44cab7bfe3569e16aa45';

const FILES = [
  { key: 'app-bundle', file: path.join(ROOT, 'public', 'app.bundle.js') },
  { key: 'pqc-wasm', file: path.join(ROOT, 'public', 'core_pqc_wasm_bg.wasm') },
];

function sh(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with code ${res.status}`);
  }
}

for (const { key, file } of FILES) {
  if (!fs.existsSync(file)) {
    console.error(`Missing file: ${file}. Did you run the frontend build? (npm run build:frontend)`);
    process.exit(1);
  }
  console.log(`Uploading ${file} -> kv:${key}`);
  sh('npx', ['wrangler', 'kv', 'key', 'put', key, '--path', file, '--namespace-id', KV_ID, '--remote']);
}

console.log('✓ Frontend bundle uploaded to KV');
