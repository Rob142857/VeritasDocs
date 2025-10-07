// Crypto utilities using Maatara API
import {
  initWasm,
  kyberKeygen,
  kyberEncaps,
  kyberDecaps,
  hkdfSha256,
  aesGcmWrap,
  aesGcmUnwrap,
  dilithiumSign,
  dilithiumVerify,
  b64uEncode,
  b64uDecode,
} from '@maatara/core-pqc';
import { Environment } from '../types';
// Import the WASM module directly for Cloudflare Workers (ES module)
// This avoids runtime Wasm code generation restrictions by using a precompiled module
// Wrangler/esbuild will bundle this correctly for the Worker environment
// Note: path is relative to this file (src/utils) going up to project root then into public/
// If bundling fails, we'll fall back to fetching the static endpoint
// @ts-ignore - wasm module type provided by wrangler/esbuild
import pqcWasmModule from '../../public/core_pqc_wasm_bg.wasm';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const INFO_B64U = b64uEncode(encoder.encode('veritas-aes'));
const AAD_B64U = b64uEncode(encoder.encode('veritas-documents'));

export class MaataraClient {
  private env: Environment;
  private static wasmInitPromise: Promise<void> | null = null;

  constructor(env: Environment) {
    this.env = env;
  }

  private async ensureWasm(): Promise<void> {
    if (!MaataraClient.wasmInitPromise) {
      MaataraClient.wasmInitPromise = (async () => {
        // Prefer precompiled WASM module import (avoids runtime code generation restrictions)
        if (pqcWasmModule) {
          // @maatara/core-pqc initWasm accepts either a Response or a WebAssembly.Module in Workers
          // If your version only supports Response, fall back to fetching the static endpoint below
          // Types may not reflect Module support; try-catch and fallback
          try {
            // @ts-ignore: allow passing precompiled module if supported
            await initWasm(pqcWasmModule);
            return;
          } catch (_e) {
            // Fallback to Response-based init via internal fetch of our static endpoint
          }
        }

        // Fallback: fetch the WASM from our own static endpoint to get a Response object
        const resp = await fetch('https://veritas-docs-production.rme-6e5.workers.dev/static/core_pqc_wasm_bg.wasm');
        if (!resp.ok) {
          // As a last resort, load bytes from KV and construct a Response
          const wasmBytes = await this.env.VERITAS_KV.get('pqc-wasm', 'arrayBuffer');
          if (!wasmBytes) {
            throw new Error('PQC WASM not available via binding, static route, or KV (key: pqc-wasm).');
          }
          const kvResp = new Response(wasmBytes, { headers: { 'Content-Type': 'application/wasm' } });
          await initWasm(kvResp);
          return;
        }
        await initWasm(resp);
      })().catch((error) => {
        MaataraClient.wasmInitPromise = null;
        throw error;
      });
    }

    await MaataraClient.wasmInitPromise;
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    await this.ensureWasm();
    const kyberKeys = await kyberKeygen();
    return {
      publicKey: kyberKeys.public_b64u,
      privateKey: kyberKeys.secret_b64u,
    };
  }

  async encryptData(data: string, publicKey: string): Promise<string> {
    await this.ensureWasm();

    const encaps = await kyberEncaps(publicKey);
    const sharedSecret = encaps.shared_b64u;
    const kemCt = encaps.kem_ct_b64u;

    const kdf = await hkdfSha256(sharedSecret, INFO_B64U, '', 32);
    const aesKey = kdf.key_b64u;

    const dekB64u = b64uEncode(encoder.encode(data));

    const aes = await aesGcmWrap(aesKey, dekB64u, AAD_B64U);

    return JSON.stringify({
      version: '1.0',
      algorithm: 'kyber768-aes256gcm',
      kem_ct: kemCt,
      iv: aes.iv_b64u,
      ciphertext: aes.ct_b64u,
    });
  }

  async decryptData(encryptedData: string, privateKey: string): Promise<string> {
    await this.ensureWasm();

    const encData = JSON.parse(encryptedData);

    const decaps = await kyberDecaps(privateKey, encData.kem_ct);
    const sharedSecret = decaps.shared_b64u;

    const kdf = await hkdfSha256(sharedSecret, INFO_B64U, '', 32);
    const aesKey = kdf.key_b64u;

    const aes = await aesGcmUnwrap(aesKey, encData.iv, encData.ciphertext, AAD_B64U);

    return decoder.decode(b64uDecode(aes.dek_b64u));
  }

  async signData(data: string, privateKey: string): Promise<string> {
    await this.ensureWasm();
    const messageB64u = b64uEncode(encoder.encode(data));
    const signature = await dilithiumSign(messageB64u, privateKey);
    return signature.signature_b64u;
  }

  async verifySignature(data: string, signature: string, publicKey: string): Promise<boolean> {
    try {
      await this.ensureWasm();
      const messageB64u = b64uEncode(encoder.encode(data));
      const result = await dilithiumVerify(messageB64u, signature, publicKey);
      return result.is_valid === true;
    } catch (error: any) {
      // BAD_SIGNATURE errors from Maatara should be treated as invalid signatures, not exceptions
      console.error('Signature verification error:', error?.message || error);
      return false;
    }
  }

  async addToChain(transactionData: any): Promise<string> {
    // This method is now deprecated - use VeritasBlockchain class instead
    // For backward compatibility, return a mock transaction ID
    const transactionId = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    console.warn('addToChain is deprecated. Use VeritasBlockchain.addTransaction() instead.');
    return transactionId;
  }

  async getChainBlock(blockNumber: number): Promise<any> {
    // This method is now deprecated - use VeritasBlockchain class instead
    // For backward compatibility, return a mock block structure
    console.warn('getChainBlock is deprecated. Use VeritasBlockchain.getBlock() instead.');
    return {
      index: blockNumber,
      timestamp: Date.now(),
      previousHash: blockNumber > 0 ? `block_${blockNumber - 1}_hash` : '0',
      dataHash: `data_hash_${blockNumber}`,
      metadataHash: `metadata_hash_${blockNumber}`,
      signature: 'deprecated_mock_signature',
      transactions: []
    };
  }

  // Compute a deterministic super-root using Maatara Core service; fallback to local SHA-256 concat
  async computeSuperRoot(hashes: string[]): Promise<string> {
    if (!Array.isArray(hashes) || hashes.length === 0) {
      throw new Error('No hashes provided to compute super-root');
    }
    const base = (this.env as any).MAATARA_API_BASE || 'https://maatara-core-worker.rme-6e5.workers.dev';
    try {
      const resp = await fetch(base.replace(/\/$/, '') + '/api/super-root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hashes })
      });
      const contentType = resp.headers.get('content-type') || '';
      if (!resp.ok) {
        const text = contentType.includes('application/json') ? JSON.stringify(await resp.json()) : await resp.text();
        throw new Error(`Maatara super-root failed: ${resp.status} ${text?.slice(0, 200)}`);
      }
      const json: any = contentType.includes('application/json') ? await resp.json() : null;
      const root = json?.superRoot || json?.super_root || json?.data?.superRoot;
      if (typeof root === 'string' && /^0x[0-9a-fA-F]{64}$/.test(root)) {
        return root;
      }
      // If API returns something else, fallback below
    } catch (e) {
      console.warn('Maatara computeSuperRoot error, falling back to local:', (e as any)?.message || e);
    }

    // Fallback: local SHA-256 over concatenated hashes
    const encoder = new TextEncoder();
    const input = encoder.encode(hashes.join(''));
    const digest = await crypto.subtle.digest('SHA-256', input);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
    return '0x' + hex;
  }
}

export function generateMnemonic(): string {
  const words = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse',
    'access', 'accident', 'account', 'accuse', 'achieve', 'acid', 'acoustic', 'acquire', 'across', 'act',
    'action', 'actor', 'actress', 'actual', 'adapt', 'add', 'addict', 'address', 'adjust', 'admit',
    'adult', 'advance', 'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'against', 'age',
    'agent', 'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album', 'alcohol',
    // ... would include full BIP39 wordlist in production
  ];

  const mnemonic = [];
  for (let i = 0; i < 12; i++) {
    const randomIndex = Math.floor(Math.random() * words.length);
    mnemonic.push(words[randomIndex]);
  }

  return mnemonic.join(' ');
}

export function generateId(): string {
  return crypto.randomUUID();
}

export async function hashString(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function uploadToIPFS(data: string, apiKey: string): Promise<string> {
  // This would integrate with an IPFS service like Pinata or web3.storage
  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      pinataContent: { data },
      pinataMetadata: {
        name: `veritas-document-${Date.now()}`,
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload to IPFS: ${response.statusText}`);
  }

  const result: any = await response.json();
  return result.IpfsHash;
}