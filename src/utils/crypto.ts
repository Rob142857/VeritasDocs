// Crypto utilities using Maatara protocol
import { Environment } from '../types';

export class MaataraClient {
  private apiBase: string;
  private chainPrivateKey: string;

  constructor(env: Environment) {
    this.apiBase = env.MAATARA_API_BASE;
    this.chainPrivateKey = env.MAATARA_CHAIN_PRIVATE_KEY;
  }

  async generateKeyPair(): Promise<{ publicKey: string; privateKey: string }> {
    const response = await fetch(`${this.apiBase}/crypto/generate-keypair`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        algorithm: 'kyber',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to generate keypair: ${response.statusText}`);
    }

    return await response.json();
  }

  async encryptData(data: string, publicKey: string): Promise<string> {
    const response = await fetch(`${this.apiBase}/crypto/encrypt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data,
        publicKey,
        algorithm: 'kyber',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to encrypt data: ${response.statusText}`);
    }

    const result: any = await response.json();
    return result.encryptedData;
  }

  async decryptData(encryptedData: string, privateKey: string): Promise<string> {
    const response = await fetch(`${this.apiBase}/crypto/decrypt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        encryptedData,
        privateKey,
        algorithm: 'kyber',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to decrypt data: ${response.statusText}`);
    }

    const result: any = await response.json();
    return result.data;
  }

  async signData(data: string, privateKey: string): Promise<string> {
    const response = await fetch(`${this.apiBase}/crypto/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data,
        privateKey,
        algorithm: 'dilithium',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to sign data: ${response.statusText}`);
    }

    const result: any = await response.json();
    return result.signature;
  }

  async verifySignature(data: string, signature: string, publicKey: string): Promise<boolean> {
    const response = await fetch(`${this.apiBase}/crypto/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        data,
        signature,
        publicKey,
        algorithm: 'dilithium',
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to verify signature: ${response.statusText}`);
    }

    const result: any = await response.json();
    return result.valid;
  }

  async addToChain(transactionData: any): Promise<string> {
    const response = await fetch(`${this.apiBase}/chain/add-transaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.chainPrivateKey}`,
      },
      body: JSON.stringify({
        chainId: 'veritas-chain',
        transaction: transactionData,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to add to chain: ${response.statusText}`);
    }

    const result: any = await response.json();
    return result.transactionId;
  }

  async getChainBlock(blockNumber: number): Promise<any> {
    const response = await fetch(`${this.apiBase}/chain/block/${blockNumber}?chainId=veritas-chain`);
    
    if (!response.ok) {
      throw new Error(`Failed to get block: ${response.statusText}`);
    }

    return await response.json();
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