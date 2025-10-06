#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const PUBLIC_DIR = path.join(ROOT, 'public');
const BUCKET = process.env.R2_BUCKET_NAME || 'veritas-docs-production-storage';

const files = [
  'activate-keypack.html',
  'login-keypack.html',
];

function sh(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with code ${res.status}`);
  }
}

for (const file of files) {
  const abs = path.join(PUBLIC_DIR, file);
  if (!fs.existsSync(abs)) {
    console.warn(`Skipping missing file: ${abs}`);
    continue;
  }
  const key = `static/${file}`;
  console.log(`Uploading ${file} -> r2://${BUCKET}/${key}`);
  sh('npx', ['wrangler', 'r2', 'object', 'put', `${BUCKET}/${key}`, '--file', abs]);
}

console.log('✓ Static HTML uploaded to R2');
