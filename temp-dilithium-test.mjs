import path from 'path';
import { fileURLToPath } from 'url';
import { initWasm, dilithiumKeygen, dilithiumSign } from '@maatara/core-pqc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const wasmPath = path.join(__dirname, 'node_modules', '@maatara', 'core-pqc-wasm', 'core_pqc_wasm_bg.wasm');

const main = async () => {
  await initWasm(wasmPath);
  const keys = await dilithiumKeygen();
  console.log('keys', keys);
  const msg = 'SGVsbG8'; // base64url of Hello
  const sig = await dilithiumSign(msg, keys.secret_b64u);
  console.log('signature', sig);
};

main().catch(err => {
  console.error('error', err);
  process.exit(1);
});
