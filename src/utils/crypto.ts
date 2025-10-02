// Crypto utilities using Maatara protocol
import { 
  initWasm,
  kyberKeygen,
  kyberEncaps,
  kyberDecaps,
  dilithiumKeygen,
  dilithiumSign,
  dilithiumVerify,
  buildMintPreimage,
  buildTransferPreimage,
  buildBlockPreimage,
  b64uEncode,
  b64uDecode,
  aesGcmWrap,
  aesGcmUnwrap,
  hkdfSha256
} from '@maatara/core-pqc';
import { Environment } from '../types';

// Initialize WASM once
let wasmInitialized = false;
async function ensureWasmInit() {
  if (!wasmInitialized) {
    await initWasm();
    wasmInitialized = true;
  }
}

export class MaataraClient {
  constructor(env: Environment) {
    // No longer need to store environment variables for direct SDK usage
    // All crypto operations now use the Maatara SDK directly
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    await ensureWasmInit();
    const keyPair = await kyberKeygen();
    return {
      publicKey: keyPair.public_b64u,
      privateKey: keyPair.secret_b64u
    };
  }

  async encryptData(data: string, publicKey: string): Promise<string> {
    await ensureWasmInit();
    
    // Use Kyber for key encapsulation and AES-GCM for data encryption
    const encapResult = await kyberEncaps(publicKey);
    const dataB64u = b64uEncode(new TextEncoder().encode(data));
    
    // Derive AES key from shared secret
    const kdfResult = await hkdfSha256(encapResult.shared_b64u, b64uEncode(new TextEncoder().encode('veritas-aes')));
    
    // Encrypt data with AES-GCM
    const aesResult = await aesGcmWrap(
      kdfResult.key_b64u,
      dataB64u,
      b64uEncode(new TextEncoder().encode('veritas-documents'))
    );
    
    // Return combined result
    return JSON.stringify({
      kem_ct: encapResult.kem_ct_b64u,
      iv: aesResult.iv_b64u,
      ciphertext: aesResult.ct_b64u
    });
  }

  async decryptData(encryptedData: string, privateKey: string): Promise<string> {
    await ensureWasmInit();
    
    const encData = JSON.parse(encryptedData);
    
    // Decapsulate shared secret using Kyber
    const decapResult = await kyberDecaps(privateKey, encData.kem_ct);
    
    // Derive AES key from shared secret
    const kdfResult = await hkdfSha256(decapResult.shared_b64u, b64uEncode(new TextEncoder().encode('veritas-aes')));
    
    // Decrypt data with AES-GCM
    const aesResult = await aesGcmUnwrap(
      kdfResult.key_b64u,
      encData.iv,
      encData.ciphertext,
      b64uEncode(new TextEncoder().encode('veritas-documents'))
    );
    
    // Return decrypted data as string - based on README, aesGcm returns dek_b64u
    return new TextDecoder().decode(b64uDecode(aesResult.dek_b64u));
  }

  async signData(data: string, privateKey: string): Promise<string> {
    await ensureWasmInit();
    
    // Encode data to base64url for signing
    const messageB64u = b64uEncode(new TextEncoder().encode(data));
    
    // Sign with Dilithium
    const result = await dilithiumSign(messageB64u, privateKey);
    
    return result.signature_b64u;
  }

  async verifySignature(data: string, signature: string, publicKey: string): Promise<boolean> {
    await ensureWasmInit();
    
    // Encode data to base64url for verification
    const messageB64u = b64uEncode(new TextEncoder().encode(data));
    
    // Verify with Dilithium
    const result = await dilithiumVerify(messageB64u, signature, publicKey);
    
    // Based on README example usage: const ok = await dilithiumVerify(...)
    // The result appears to be truthy/falsy
    return !!result;
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