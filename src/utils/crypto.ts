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
        const wasmBytes = await this.env.VERITAS_KV.get('pqc-wasm', 'arrayBuffer');
        if (!wasmBytes) {
          throw new Error('PQC WASM binary not found in KV (key: pqc-wasm). Upload the WASM bundle.');
        }
        await initWasm(new Uint8Array(wasmBytes));
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
    await this.ensureWasm();
    const messageB64u = b64uEncode(encoder.encode(data));
    const result = await dilithiumVerify(messageB64u, signature, publicKey);
    return result.is_valid === true;
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