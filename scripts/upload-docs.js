#!/usr/bin/env node
/*
 Auto-upload markdown docs to KV and generate an index for auto-wiring.
 Requires WRANGLER to be authenticated and a KV namespace id.
*/
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const DOC_FILES = [
  'README.md',
  'SECURITY_GUARDRAILS.md',
  'SECURITY_ARCHITECTURE.md',
  'ZERO_KNOWLEDGE_ARCHITECTURE.md',
  'BLOCKCHAIN_ARCHITECTURE.md',
  'BLOCKCHAIN_USER_SYSTEM.md',
  'VDC_INTEGRATION_GUIDE.md',
  'DEVELOPMENT_PLAN.md',
  'TECHNICAL_STATUS.md',
  'ACTIVATION_TOKEN_FLOW.md',
  'QUICK_REFERENCE.md',
  // New user-facing documentation
  'VERITAS_DOCUMENTS_CHAIN.md',
  'ETHEREUM_ROOT.md',
  'MAATARA_CORE.md',
  'USER_HOW_TO.md',
  'TECHNICAL_INFORMATION.md',
].filter((f) => fs.existsSync(path.join(ROOT, f)));

// KV namespace id (production) — fallback to env var if provided
const KV_ID = process.env.VERITAS_KV_ID || '9f0ea31309cd44cab7bfe3569e16aa45';

function sh(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (res.status !== 0) {
    throw new Error(`${cmd} ${args.join(' ')} failed with code ${res.status}`);
  }
}

function extractMeta(md) {
  const get = (re, dflt = '') => (md.match(re)?.[1] || dflt).trim();
  return {
    version: get(/\*\*Version\*\*:\s*([^\n]+)/i, '1.1.0'),
    lastUpdated: get(/\*\*Last Updated\*\*:\s*([^\n]+)/i, 'October 3, 2025'),
    status: get(/\*\*Status\*\*:\s*([^\n]+)/i, 'Production'),
    audience: get(/\*\*Audience\*\*:\s*([^\n]+)/i, 'developers'),
    category: get(/\*\*Category\*\*:\s*([^\n]+)/i, 'Documentation'),
    priority: parseInt(get(/\*\*Priority\*\*:\s*([^\n]+)/i, '99'), 10),
    title: md.split(/\n/)[0].replace(/^#\s*/, ''),
    keywords: (get(/\*\*Keywords\*\*:\s*([^\n]+)/i, '') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  };
}

const index = [];
for (const file of DOC_FILES) {
  const abs = path.join(ROOT, file);
  const content = fs.readFileSync(abs, 'utf8');
  const meta = extractMeta(content);
  const slug = path.basename(file, '.md');

  console.log(`Uploading ${file} -> docs:${file}`);
  sh('npx', ['wrangler', 'kv', 'key', 'put', `docs:${file}`, '--path', file, '--namespace-id', KV_ID, '--remote']);

  index.push({ slug, file, ...meta });
}

// Upload an index for auto-wiring
fs.writeFileSync(path.join(ROOT, '.docs-index.json'), JSON.stringify(index, null, 2));
console.log('Uploading docs index -> docs:index');
sh('npx', ['wrangler', 'kv', 'key', 'put', 'docs:index', '--path', '.docs-index.json', '--namespace-id', KV_ID, '--remote']);
console.log('✓ Docs uploaded');
