// Crypto utilities using Maatara API
import { Environment } from '../types';

// Base64url encoding/decoding utilities for Cloudflare Workers
function stringToBase64url(str: string): string {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(str);
  const base64 = btoa(String.fromCharCode(...bytes));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlToString(b64u: string): string {
  // Add back padding if needed
  let base64 = b64u.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const decoder = new TextDecoder();
  return decoder.decode(bytes);
}

export class MaataraClient {
  private apiBase: string;

  constructor(env: Environment) {
    this.apiBase = env.MAATARA_API_BASE || 'https://maatara-core-worker.rme-6e5.workers.dev';
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const response = await fetch(`${this.apiBase}/api/crypto/kyber/keygen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    
    if (!response.ok) {
      throw new Error(`Failed to generate key pair: ${response.statusText}`);
    }
    
    const data = await response.json() as any;
    return {
      publicKey: data.public_b64u,
      privateKey: data.secret_b64u
    };
  }

  async encryptData(data: string, publicKey: string): Promise<string> {
    // Step 1: Encapsulate shared secret using Kyber
    const encapsResponse = await fetch(`${this.apiBase}/api/crypto/kyber/encaps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ public_b64u: publicKey })
    });
    
    if (!encapsResponse.ok) {
      throw new Error(`Failed to encapsulate: ${encapsResponse.statusText}`);
    }
    
    const encapsData = await encapsResponse.json() as any;
    const sharedSecret = encapsData.shared_b64u;
    const kemCt = encapsData.kem_ct_b64u;
    
    // Step 2: Derive AES key from shared secret
    const infoB64u = stringToBase64url('veritas-aes');
    const kdfResponse = await fetch(`${this.apiBase}/api/crypto/hkdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret_b64u: sharedSecret,
        info_b64u: infoB64u,
        salt_b64u: '',
        len: 32
      })
    });
    
    if (!kdfResponse.ok) {
      throw new Error(`Failed to derive key: ${kdfResponse.statusText}`);
    }
    
    const kdfData = await kdfResponse.json() as any;
    const aesKey = kdfData.key_b64u;
    
    // Step 3: Encrypt data with AES-GCM
    const dekB64u = stringToBase64url(data);
    const aadB64u = stringToBase64url('veritas-documents');
    
    const aesResponse = await fetch(`${this.apiBase}/api/crypto/aes/wrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key_b64u: aesKey,
        dek_b64u: dekB64u,
        aad_b64u: aadB64u
      })
    });
    
    if (!aesResponse.ok) {
      throw new Error(`Failed to encrypt: ${aesResponse.statusText}`);
    }
    
    const aesData = await aesResponse.json() as any;
    
    return JSON.stringify({
      version: '1.0',
      algorithm: 'kyber768-aes256gcm',
      kem_ct: kemCt,
      iv: aesData.iv_b64u,
      ciphertext: aesData.ct_b64u
    });
  }

  async decryptData(encryptedData: string, privateKey: string): Promise<string> {
    const encData = JSON.parse(encryptedData);
    
    // Step 1: Decapsulate shared secret using Kyber
    const decapsResponse = await fetch(`${this.apiBase}/api/crypto/kyber/decaps`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret_b64u: privateKey,
        kem_ct_b64u: encData.kem_ct
      })
    });
    
    if (!decapsResponse.ok) {
      throw new Error(`Failed to decapsulate: ${decapsResponse.statusText}`);
    }
    
    const decapsData = await decapsResponse.json() as any;
    const sharedSecret = decapsData.shared_b64u;
    
    // Step 2: Derive AES key from shared secret
    const infoB64u = stringToBase64url('veritas-aes');
    const kdfResponse = await fetch(`${this.apiBase}/api/crypto/hkdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secret_b64u: sharedSecret,
        info_b64u: infoB64u,
        salt_b64u: '',
        len: 32
      })
    });
    
    if (!kdfResponse.ok) {
      throw new Error(`Failed to derive key: ${kdfResponse.statusText}`);
    }
    
    const kdfData = await kdfResponse.json() as any;
    const aesKey = kdfData.key_b64u;
    
    // Step 3: Decrypt data with AES-GCM
    const aadB64u = stringToBase64url('veritas-documents');
    
    const aesResponse = await fetch(`${this.apiBase}/api/crypto/aes/unwrap`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        key_b64u: aesKey,
        iv_b64u: encData.iv,
        ct_b64u: encData.ciphertext,
        aad_b64u: aadB64u
      })
    });
    
    if (!aesResponse.ok) {
      throw new Error(`Failed to decrypt: ${aesResponse.statusText}`);
    }
    
    const aesData = await aesResponse.json() as any;
    return base64urlToString(aesData.dek_b64u);
  }

  async signData(data: string, privateKey: string): Promise<string> {
    const messageB64u = stringToBase64url(data);
    
    const response = await fetch(`${this.apiBase}/api/crypto/dilithium/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_b64u: messageB64u,
        secret_b64u: privateKey
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to sign data: ${response.statusText}`);
    }
    
    const data_result = await response.json() as any;
    return data_result.signature_b64u;
  }

  async verifySignature(data: string, signature: string, publicKey: string): Promise<boolean> {
    const messageB64u = stringToBase64url(data);
    
    const response = await fetch(`${this.apiBase}/api/crypto/dilithium/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message_b64u: messageB64u,
        signature_b64u: signature,
        public_b64u: publicKey
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to verify signature: ${response.statusText}`);
    }
    
    const result = await response.json() as any;
    return !!result.valid;
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