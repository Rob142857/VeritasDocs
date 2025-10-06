/**
 * Unified Storage Layer for Veritas Documents
 * 
 * Enforces encryption and multi-tier persistence:
 * - R2: Primary durable storage (encrypted)
 * - IPFS: Decentralized backup (encrypted)
 * - KV: Fast access for blocks and metadata (dual-signed blocks only)
 * 
 * Storage Policies:
 * - Chain Blocks: KV (low latency) + R2 (archive) + IPFS (public verifiability)
 * - Pending Transactions: R2 (encrypted with system key) + optional IPFS
 * - Documents: R2 (encrypted with user key) + IPFS (encrypted)
 * - Activation Tokens: R2 (encrypted with system key)
 * - User Data: KV (encrypted metadata) + R2 (encrypted details)
 */

import { Environment, EncryptionMetadata } from '../types';
import { MaataraClient } from './crypto';
import { IPFSClient, createIPFSRecord, IPFSRecord } from './ipfs';

export type StorageTier = 'kv' | 'r2' | 'ipfs' | 'all';

export interface StoragePolicy {
  tiers: StorageTier[];
  encrypt: boolean;
  encryptionKeyType?: 'system' | 'user';
  requireDualSignature?: boolean;
}

export interface StoredObject<T = any> {
  data: T;
  metadata: {
    key: string;
    storedAt: number;
    encryption?: EncryptionMetadata;
    r2Key?: string;
    ipfsHash?: string;
    ipfsGatewayUrl?: string;
    ipfsPinned?: boolean;
    kvKey?: string;
  };
}

export interface StorageResult {
  success: boolean;
  r2Key?: string;
  ipfsHash?: string;
  ipfsGatewayUrl?: string;
  kvKey?: string;
  encryption?: EncryptionMetadata;
  storedAt: number;
  error?: string;
}

/**
 * Storage policies for different data types
 */
export const STORAGE_POLICIES: Record<string, StoragePolicy> = {
  // Chain blocks: KV for fast access, R2 for durability, IPFS for verifiability
  chainBlock: {
    tiers: ['kv', 'r2', 'ipfs'],
    encrypt: false, // Blocks are publicly verifiable (signatures provide integrity)
    requireDualSignature: true
  },
  
  // Pending transactions: R2 encrypted, optional IPFS
  pendingTransaction: {
    tiers: ['r2'],
    encrypt: true,
    encryptionKeyType: 'system'
  },
  
  // Documents: R2 and IPFS, both encrypted with user key
  document: {
    tiers: ['r2', 'ipfs'],
    encrypt: true,
    encryptionKeyType: 'user'
  },
  
  // Activation tokens: R2 encrypted with system key
  activationToken: {
    tiers: ['r2'],
    encrypt: true,
    encryptionKeyType: 'system'
  },
  
  // User metadata: KV for fast lookup, R2 for encrypted details
  userMetadata: {
    tiers: ['kv', 'r2'],
    encrypt: true,
    encryptionKeyType: 'system'
  },
  
  // Asset metadata: KV for fast lookup, R2 for backup
  assetMetadata: {
    tiers: ['kv', 'r2'],
    encrypt: false // Metadata is public (document itself is encrypted)
  }
};

/**
 * Unified Storage Manager
 */
export class StorageManager {
  private env: Environment;
  private maataraClient: MaataraClient;
  private ipfsClient: IPFSClient;

  constructor(env: Environment) {
    this.env = env;
    this.maataraClient = new MaataraClient(env);
    this.ipfsClient = new IPFSClient(env);
  }

  /**
   * Store object with policy enforcement
   */
  async store<T>(
    key: string,
    data: T,
    policy: StoragePolicy,
    encryptionKey?: string
  ): Promise<StorageResult> {
    const storedAt = Date.now();
    let payload = JSON.stringify(data);
    let encryption: EncryptionMetadata | undefined;

    // Enforce encryption if required
    if (policy.encrypt) {
      if (!encryptionKey) {
        throw new Error(`Encryption required but no key provided for ${key}`);
      }

      encryption = {
        algorithm: 'kyber768-aes256gcm',
        version: '1.0',
        keyId: policy.encryptionKeyType === 'system' 
          ? this.env.SYSTEM_KEY_ID || 'system'
          : 'user',
        source: policy.encryptionKeyType === 'user' ? 'client' : 'system'
      };

      payload = await this.maataraClient.encryptData(payload, encryptionKey);
    }

    const result: StorageResult = {
      success: true,
      storedAt,
      encryption
    };

    // Store in R2 if required
    if (policy.tiers.includes('r2') || policy.tiers.includes('all')) {
      const r2Result = await this.storeInR2(key, payload, encryption);
      if (r2Result.success) {
        result.r2Key = r2Result.r2Key;
      } else {
        console.error(`R2 storage failed for ${key}:`, r2Result.error);
        result.success = false;
        result.error = `R2 storage required but failed: ${r2Result.error}`;
        throw new Error(result.error);
      }
    }

    // Store in IPFS if required
    if (policy.tiers.includes('ipfs') || policy.tiers.includes('all')) {
      const ipfsResult = await this.storeInIPFS(payload, encryption);
      if (ipfsResult.success) {
        result.ipfsHash = ipfsResult.ipfsHash;
        result.ipfsGatewayUrl = ipfsResult.ipfsGatewayUrl;
        console.log(`✅ IPFS storage successful for ${key}: ${ipfsResult.ipfsHash}`);
      } else {
        console.error(`❌ IPFS storage failed for ${key}:`, ipfsResult.error);
        // IPFS failure is now CRITICAL for policies that require it
        result.success = false;
        result.error = `IPFS storage required but failed: ${ipfsResult.error}`;
        throw new Error(result.error);
      }
    }

    // Store in KV if required
    if (policy.tiers.includes('kv') || policy.tiers.includes('all')) {
      const kvResult = await this.storeInKV(key, data, result);
      if (kvResult.success) {
        result.kvKey = kvResult.kvKey;
      } else {
        console.error(`KV storage failed for ${key}:`, kvResult.error);
        result.success = false;
        result.error = `KV storage required but failed: ${kvResult.error}`;
        throw new Error(result.error);
      }
    }

    return result;
  }

  /**
   * Retrieve object with automatic decryption
   */
  async retrieve<T>(
    key: string,
    policy: StoragePolicy,
    decryptionKey?: string
  ): Promise<StoredObject<T> | null> {
    let payload: string | null = null;
    let metadata: StoredObject<T>['metadata'] = {
      key,
      storedAt: 0
    };

    // Try KV first (fastest)
    if (policy.tiers.includes('kv') || policy.tiers.includes('all')) {
      const kvData = await this.env.VERITAS_KV.get(key);
      if (kvData) {
        try {
          const parsed = JSON.parse(kvData);
          metadata.kvKey = key;
          
          // If KV stores the full object with storage metadata, use it
          if (parsed.metadata && parsed.data) {
            return parsed as StoredObject<T>;
          }
          
          // Otherwise, KV has the direct data
          return {
            data: parsed as T,
            metadata
          };
        } catch (err) {
          console.warn(`Failed to parse KV data for ${key}`, err);
        }
      }
    }

    // Try R2 next
    if (policy.tiers.includes('r2') || policy.tiers.includes('all')) {
      const r2Object = await this.retrieveFromR2(key);
      if (r2Object) {
        payload = r2Object.payload;
        metadata.r2Key = r2Object.r2Key;
        metadata.encryption = r2Object.encryption;
        metadata.storedAt = r2Object.storedAt;
      }
    }

    // Try IPFS as fallback
    if (!payload && (policy.tiers.includes('ipfs') || policy.tiers.includes('all'))) {
      // IPFS retrieval requires hash lookup from metadata
      console.warn(`IPFS retrieval requires hash; implement metadata lookup for ${key}`);
    }

    if (!payload) {
      return null;
    }

    // Decrypt if needed
    if (policy.encrypt && metadata.encryption) {
      if (!decryptionKey) {
        throw new Error(`Decryption key required for ${key}`);
      }
      payload = await this.maataraClient.decryptData(payload, decryptionKey);
    }

    const data = JSON.parse(payload) as T;

    return {
      data,
      metadata
    };
  }

  /**
   * List objects by prefix
   */
  async list(prefix: string, tier: 'kv' | 'r2' = 'r2'): Promise<string[]> {
    if (tier === 'kv') {
      const list = await this.env.VERITAS_KV.list({ prefix });
      return list.keys.map(k => k.name);
    }

    if (tier === 'r2' && this.env.VDC_STORAGE) {
      const list = await this.env.VDC_STORAGE.list({ prefix });
      return list.objects.map(o => o.key);
    }

    return [];
  }

  /**
   * Delete object from all tiers
   */
  async delete(key: string, policy: StoragePolicy): Promise<void> {
    const tasks: Promise<any>[] = [];

    if (policy.tiers.includes('kv') || policy.tiers.includes('all')) {
      tasks.push(this.env.VERITAS_KV.delete(key));
    }

    if (policy.tiers.includes('r2') || policy.tiers.includes('all')) {
      if (this.env.VDC_STORAGE) {
        tasks.push(this.env.VDC_STORAGE.delete(key));
      }
    }

    // Note: IPFS deletion is not supported (immutable storage)

    await Promise.all(tasks);
  }

  /**
   * Verify encryption status of stored object
   */
  async verifyEncryption(key: string): Promise<{
    encrypted: boolean;
    metadata?: EncryptionMetadata;
    tier: 'kv' | 'r2' | 'ipfs' | 'none';
  }> {
    // Check R2 first
    if (this.env.VDC_STORAGE) {
      const r2Object = await this.env.VDC_STORAGE.get(key);
      if (r2Object) {
        const metadata = r2Object.customMetadata;
        if (metadata?.encryption_algorithm) {
          return {
            encrypted: true,
            metadata: {
              algorithm: metadata.encryption_algorithm,
              version: metadata.encryption_version || '1.0',
              keyId: metadata.encryption_key_id,
              source: metadata.encryption_source as any
            },
            tier: 'r2'
          };
        }

        // Try to detect encryption in payload
        const text = await r2Object.text();
        const isEncrypted = this.detectEncryption(text);
        
        return {
          encrypted: isEncrypted,
          tier: 'r2'
        };
      }
    }

    // Check KV
    const kvData = await this.env.VERITAS_KV.get(key);
    if (kvData) {
      const isEncrypted = this.detectEncryption(kvData);
      return {
        encrypted: isEncrypted,
        tier: 'kv'
      };
    }

    return {
      encrypted: false,
      tier: 'none'
    };
  }

  // Private helper methods

  private async storeInR2(
    key: string,
    payload: string,
    encryption?: EncryptionMetadata
  ): Promise<{ success: boolean; r2Key?: string; error?: string }> {
    if (!this.env.VDC_STORAGE) {
      return { success: false, error: 'VDC_STORAGE not configured' };
    }

    try {
      const customMetadata: Record<string, string> = {
        storedAt: Date.now().toString()
      };

      if (encryption) {
        customMetadata.encryption_algorithm = encryption.algorithm;
        customMetadata.encryption_version = encryption.version;
        customMetadata.encryption_key_id = encryption.keyId || 'unknown';
        customMetadata.encryption_source = encryption.source;
      }

      await this.env.VDC_STORAGE.put(key, payload, {
        httpMetadata: {
          contentType: 'application/json'
        },
        customMetadata
      });

      return { success: true, r2Key: key };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async storeInIPFS(
    payload: string,
    encryption?: EncryptionMetadata
  ): Promise<{ success: boolean; ipfsHash?: string; ipfsGatewayUrl?: string; error?: string }> {
    try {
      const record = await createIPFSRecord(
        this.ipfsClient,
        payload,
        'application/json'
      );

      return {
        success: true,
        ipfsHash: record.hash,
        ipfsGatewayUrl: record.gatewayUrl
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async storeInKV<T>(
    key: string,
    data: T,
    storageResult: StorageResult
  ): Promise<{ success: boolean; kvKey?: string; error?: string }> {
    try {
      const kvPayload: StoredObject<T> = {
        data,
        metadata: {
          key,
          storedAt: storageResult.storedAt,
          encryption: storageResult.encryption,
          r2Key: storageResult.r2Key,
          ipfsHash: storageResult.ipfsHash,
          ipfsGatewayUrl: storageResult.ipfsGatewayUrl,
          kvKey: key
        }
      };

      await this.env.VERITAS_KV.put(key, JSON.stringify(kvPayload));

      return { success: true, kvKey: key };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async retrieveFromR2(key: string): Promise<{
    payload: string;
    r2Key: string;
    encryption?: EncryptionMetadata;
    storedAt: number;
  } | null> {
    if (!this.env.VDC_STORAGE) {
      return null;
    }

    const object = await this.env.VDC_STORAGE.get(key);
    if (!object) {
      return null;
    }

    const metadata = object.customMetadata;
    const encryption: EncryptionMetadata | undefined = metadata?.encryption_algorithm
      ? {
          algorithm: metadata.encryption_algorithm,
          version: metadata.encryption_version || '1.0',
          keyId: metadata.encryption_key_id,
          source: metadata.encryption_source as any
        }
      : undefined;

    return {
      payload: await object.text(),
      r2Key: key,
      encryption,
      storedAt: parseInt(metadata?.storedAt || '0', 10)
    };
  }

  private detectEncryption(payload: string): boolean {
    try {
      const parsed = JSON.parse(payload);
      
      // Detect Kyber envelope
      if (
        parsed.algorithm === 'kyber768-aes256gcm' &&
        parsed.kem_ct &&
        parsed.iv &&
        parsed.ciphertext
      ) {
        return true;
      }

      // Detect nested encryption
      if (parsed.encrypted === true || parsed.version === '1.0') {
        return true;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Get system encryption key
   */
  private getSystemKyberPublicKey(): string {
    if (!this.env.SYSTEM_KYBER_PUBLIC_KEY) {
      throw new Error('System Kyber public key not configured');
    }
    return this.env.SYSTEM_KYBER_PUBLIC_KEY;
  }

  /**
   * Get system decryption key
   */
  private getSystemKyberPrivateKey(): string {
    if (this.env.SYSTEM_KYBER_PRIVATE_KEY) {
      return this.env.SYSTEM_KYBER_PRIVATE_KEY;
    }
    throw new Error('System Kyber private key not configured');
  }
}

/**
 * Convenience functions for common operations
 */

export async function storeChainBlock(
  env: Environment,
  blockNumber: number,
  block: any
): Promise<StorageResult> {
  const manager = new StorageManager(env);
  const key = `blocks/${blockNumber}.json`;
  
  return await manager.store(
    key,
    block,
    STORAGE_POLICIES.chainBlock
  );
}

export async function storePendingTransaction(
  env: Environment,
  txId: string,
  transaction: any
): Promise<StorageResult> {
  const manager = new StorageManager(env);
  const key = `pending/${txId}.json`;
  
  const systemKey = env.SYSTEM_KYBER_PUBLIC_KEY;
  if (!systemKey) {
    throw new Error('System Kyber public key not configured');
  }
  
  return await manager.store(
    key,
    transaction,
    STORAGE_POLICIES.pendingTransaction,
    systemKey
  );
}

export async function storeDocument(
  env: Environment,
  userId: string,
  assetId: string,
  document: any,
  userKyberPublicKey: string
): Promise<StorageResult> {
  const manager = new StorageManager(env);
  const key = `documents/${userId}/${assetId}.json`;
  
  return await manager.store(
    key,
    document,
    STORAGE_POLICIES.document,
    userKyberPublicKey
  );
}

export async function storeActivationToken(
  env: Environment,
  token: string,
  tokenData: any
): Promise<StorageResult> {
  const manager = new StorageManager(env);
  const key = `activation/${token}.json`;
  
  const systemKey = env.SYSTEM_KYBER_PUBLIC_KEY;
  if (!systemKey) {
    throw new Error('System Kyber public key not configured');
  }
  
  return await manager.store(
    key,
    tokenData,
    STORAGE_POLICIES.activationToken,
    systemKey
  );
}
