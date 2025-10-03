/**
 * Veritas Documents Chain (VDC) - Post-Quantum Blockchain
 * 
 * A single master blockchain with dual-signature system:
 * - User signatures: Prove user authorization
 * - System signatures: Prove platform validation
 * 
 * All blocks signed by system master key stored in Cloudflare Secrets.
 */

import { Environment } from '../types';
import { IPFSClient, createIPFSRecord } from './ipfs';
import { MaataraClient } from './crypto';

function getSystemDilithiumPrivateKey(env: Environment): string {
  if (env.SYSTEM_DILITHIUM_PRIVATE_KEY && env.SYSTEM_DILITHIUM_PRIVATE_KEY.length > 0) {
    return env.SYSTEM_DILITHIUM_PRIVATE_KEY;
  }

  const part1 = env.SYSTEM_DILITHIUM_PRIVATE_KEY_PART1 || '';
  const part2 = env.SYSTEM_DILITHIUM_PRIVATE_KEY_PART2 || '';
  const combined = part1 + part2;

  if (!combined) {
    throw new Error('System Dilithium private key not configured');
  }

  return combined;
}

/**
 * VDC Transaction with Dual Signatures
 */
export interface VDCTransaction {
  id: string;
  type: 'user_registration' | 'document_creation' | 'asset_transfer' | 'admin_action';
  timestamp: number;
  
  // Transaction data (can be encrypted for sensitive info)
  data: {
    // User registration
    userId?: string;
    email?: string;
    kyberPublicKey?: string;
    dilithiumPublicKey?: string;
    encryptedUserData?: any;
    accountType?: 'admin' | 'paid' | 'invited';
    
    // Document creation
    documentId?: string;
    documentHash?: string;
    ipfsHash?: string;
    metadata?: any;
    
    // Asset transfer
    assetId?: string;
    fromUserId?: string;
    toUserId?: string;
    
    // Generic data
    [key: string]: any;
  };
  
  // DUAL SIGNATURES
  signatures: {
    // User signature (proves user authorized this)
    user: {
      publicKey: string;    // User's Dilithium public key
      signature: string;    // User's Dilithium signature
    };
    
    // System signature (proves platform validated this)
    system: {
      publicKey: string;    // System master Dilithium public key
      signature: string;    // System master Dilithium signature
      keyVersion: number;   // For key rotation
    };
  };
}

/**
 * VDC Block Structure
 */
export interface VDCBlock {
  blockNumber: number;
  timestamp: number;
  previousHash: string;
  hash: string;
  
  // Block contents
  transactions: VDCTransaction[];
  merkleRoot: string;
  
  // Block signature (system master key signs entire block)
  blockSignature: {
    publicKey: string;
    signature: string;
    keyVersion: number;
  };
  
  // IPFS storage
  ipfsHash?: string;
}

/**
 * Genesis Block Data
 */
export interface VDCGenesisData {
  chain: 'VeritasByMaataraBlockChain' | 'VDC';
  version: string;
  description: string;
  generatedAt: string;
  systemPublicKeys: {
    dilithium: string;
    kyber: string;
    keyVersion: number;
  };
}

/**
 * Veritas Documents Chain (VDC) Blockchain
 */
export class VDCBlockchain {
  private env: Environment;
  private ipfsClient: IPFSClient;
  private maataraClient: MaataraClient;
  private genesisBlock: VDCBlock | null = null;

  constructor(env: Environment) {
    this.env = env;
    this.ipfsClient = new IPFSClient(env);
    this.maataraClient = new MaataraClient(env);
  }

  /**
   * Initialize the blockchain (load or create genesis)
   */
  async initialize(): Promise<void> {
    // Try to load existing genesis block
    const genesisData = await this.env.VERITAS_KV.get('vdc:block:0');
    
    if (genesisData) {
      this.genesisBlock = JSON.parse(genesisData);
      console.log('✅ VDC: Loaded existing genesis block');
    } else {
      console.log('⚠️  VDC: No genesis block found - call createGenesisBlock()');
    }
  }

  /**
   * Create the genesis block for the VDC blockchain
   * This should only be called ONCE when initializing the chain
   */
  async createGenesisBlock(): Promise<VDCBlock> {
    // Check if genesis already exists
    const existing = await this.env.VERITAS_KV.get('vdc:block:0');
    if (existing) {
      throw new Error('Genesis block already exists! Cannot recreate.');
    }

    // Get system public keys from environment
    const systemDilithiumPublicKey = this.env.SYSTEM_DILITHIUM_PUBLIC_KEY;
    const systemKyberPublicKey = this.env.SYSTEM_KYBER_PUBLIC_KEY;
    const systemKeyVersion = parseInt(this.env.SYSTEM_KEY_VERSION || '1');

    if (!systemDilithiumPublicKey) {
      throw new Error('SYSTEM_DILITHIUM_PUBLIC_KEY not found in environment');
    }

    const genesisData: VDCGenesisData = {
      chain: 'VeritasByMaataraBlockChain',
      version: '1.0.0',
      description: 'Veritas Documents Chain - Post-Quantum Legal Document Blockchain',
      generatedAt: new Date().toISOString(),
      systemPublicKeys: {
        dilithium: systemDilithiumPublicKey,
        kyber: systemKyberPublicKey || '',
        keyVersion: systemKeyVersion
      }
    };

    const systemPrivateKey = getSystemDilithiumPrivateKey(this.env);
    const blockTimestamp = Date.now();

    const genesisTransaction: VDCTransaction = {
      id: `vdc_genesis_${blockTimestamp}`,
      type: 'admin_action',
      timestamp: blockTimestamp,
      data: {
        action: 'initialize_chain',
        description: 'Genesis block initialization by system master key',
        initiatedBy: 'system',
        metadata: genesisData
      },
      signatures: {
        user: {
          publicKey: systemDilithiumPublicKey,
          signature: ''
        },
        system: {
          publicKey: systemDilithiumPublicKey,
          signature: '',
          keyVersion: systemKeyVersion
        }
      }
    };

    const genesisTxPayload = {
      id: genesisTransaction.id,
      type: genesisTransaction.type,
      timestamp: genesisTransaction.timestamp,
      data: genesisTransaction.data
    };

    const genesisSignature = await this.maataraClient.signData(
      JSON.stringify(genesisTxPayload),
      systemPrivateKey
    );

    genesisTransaction.signatures.user.signature = genesisSignature;
    genesisTransaction.signatures.system.signature = genesisSignature;

    const transactions = [genesisTransaction];

    // Create genesis block
    const genesisBlock: VDCBlock = {
      blockNumber: 0,
      timestamp: blockTimestamp,
      previousHash: '0',
      hash: '',
      transactions,
      merkleRoot: this.calculateMerkleRoot(transactions),
      blockSignature: {
        publicKey: systemDilithiumPublicKey,
        signature: '',
        keyVersion: systemKeyVersion
      }
    };

    // Calculate genesis hash
    genesisBlock.hash = await this.calculateBlockHash(genesisBlock);

    // Sign genesis block with system master key
    const blockDataToSign = {
      blockNumber: 0,
      timestamp: blockTimestamp,
      previousHash: '0',
      hash: genesisBlock.hash,
      merkleRoot: genesisBlock.merkleRoot,
      transactionCount: genesisBlock.transactions.length
    };

    genesisBlock.blockSignature.signature = await this.maataraClient.signData(
      JSON.stringify(blockDataToSign),
      systemPrivateKey
    );

    // Upload to IPFS (optional for now)
    const blockJson = JSON.stringify(genesisBlock, null, 2);
    try {
      const ipfsRecord = await createIPFSRecord(this.ipfsClient, blockJson, 'application/json');
      genesisBlock.ipfsHash = ipfsRecord.hash;
    } catch (error) {
      console.warn('IPFS upload failed, using mock hash:', error);
      genesisBlock.ipfsHash = 'QmMockGenesis' + Date.now();
    }

    // Store in KV
    await this.env.VERITAS_KV.put('vdc:block:0', JSON.stringify(genesisBlock));
    await this.env.VERITAS_KV.put('vdc:latest', JSON.stringify({
      blockNumber: 0,
      hash: genesisBlock.hash,
      ipfsHash: genesisBlock.ipfsHash,
      timestamp: blockTimestamp
    }));
    await this.env.VERITAS_KV.put('vdc:genesis', JSON.stringify(genesisData));
    await this.env.VERITAS_KV.put(`vdc:tx:${genesisTransaction.id}`, JSON.stringify({
      blockNumber: 0,
      txId: genesisTransaction.id,
      type: genesisTransaction.type,
      timestamp: genesisTransaction.timestamp
    }));
    await this.env.VERITAS_KV.put('vdc:pending:count', '0');

    this.genesisBlock = genesisBlock;

    console.log('🎉 VDC: Genesis block created!');
    console.log(`   Block Hash: ${genesisBlock.hash}`);
    console.log(`   IPFS Hash: ${genesisBlock.ipfsHash}`);
    console.log(`   Genesis TX: ${genesisTransaction.id}`);

    return genesisBlock;
  }

  /**
   * Add a transaction to the pending pool (with dual signatures)
   */
  async addTransaction(
    type: VDCTransaction['type'],
    data: VDCTransaction['data'],
    userDilithiumPrivateKey: string,
    userDilithiumPublicKey: string
  ): Promise<string> {
    // Create transaction ID
    const txId = `vdc_tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Prepare transaction data for signing
    const txData = {
      id: txId,
      type,
      timestamp: Date.now(),
      data
    };

    // USER SIGNATURE: User signs the transaction
    const userSignature = await this.maataraClient.signData(
      JSON.stringify(txData),
      userDilithiumPrivateKey
    );

    // SYSTEM SIGNATURE: System validates and signs the transaction
    const systemKeyVersion = parseInt(this.env.SYSTEM_KEY_VERSION || '1');
    const systemPublicKey = this.env.SYSTEM_DILITHIUM_PUBLIC_KEY;
    const systemPrivateKey = getSystemDilithiumPrivateKey(this.env);

    if (!systemPrivateKey || !systemPublicKey) {
      throw new Error('System master keys not configured in environment');
    }

    const systemSignature = await this.maataraClient.signData(
      JSON.stringify(txData),
      systemPrivateKey
    );

    // Create final transaction with dual signatures
    const transaction: VDCTransaction = {
      ...txData,
      signatures: {
        user: {
          publicKey: userDilithiumPublicKey,
          signature: userSignature
        },
        system: {
          publicKey: systemPublicKey,
          signature: systemSignature,
          keyVersion: systemKeyVersion
        }
      }
    };

    const pendingCount = await this.storePendingTransaction(transaction);

    console.log(`✅ VDC: Transaction ${txId} added to pending pool`);
    console.log(`   Type: ${type}`);
    console.log(`   Pending count: ${pendingCount}`);

    return txId;
  }

  async addAdminAction(
    action: string,
    payload: Record<string, any> = {}
  ): Promise<{ transaction: VDCTransaction; pendingCount: number }> {
    if (!action) {
      throw new Error('Admin action name is required');
    }

    const systemPublicKey = this.env.SYSTEM_DILITHIUM_PUBLIC_KEY;
    if (!systemPublicKey) {
      throw new Error('System Dilithium public key not configured');
    }

    const systemPrivateKey = getSystemDilithiumPrivateKey(this.env);
    const systemKeyVersion = parseInt(this.env.SYSTEM_KEY_VERSION || '1');
    const timestamp = Date.now();
    const txId = `vdc_admin_${timestamp}_${Math.random().toString(36).substr(2, 6)}`;

    const txData: Omit<VDCTransaction, 'signatures'> = {
      id: txId,
      type: 'admin_action',
      timestamp,
      data: {
        action,
        payload,
        initiatedBy: 'system',
        keyVersion: systemKeyVersion
      }
    };

    const signature = await this.maataraClient.signData(
      JSON.stringify(txData),
      systemPrivateKey
    );

    const transaction: VDCTransaction = {
      ...txData,
      signatures: {
        user: {
          publicKey: systemPublicKey,
          signature
        },
        system: {
          publicKey: systemPublicKey,
          signature,
          keyVersion: systemKeyVersion
        }
      }
    };

    const pendingCount = await this.storePendingTransaction(transaction);

    console.log(`✅ VDC: Admin action ${action} queued (tx: ${txId})`);
    console.log(`   Pending count: ${pendingCount}`);

    return { transaction, pendingCount };
  }

  private async storePendingTransaction(transaction: VDCTransaction): Promise<number> {
    await this.env.VERITAS_KV.put(
      `vdc:pending:${transaction.id}`,
      JSON.stringify(transaction)
    );

    const currentCountStr = await this.env.VERITAS_KV.get('vdc:pending:count');
    const currentCount = parseInt(currentCountStr || '0', 10);
    const pendingCount = Number.isNaN(currentCount) ? 1 : currentCount + 1;
    await this.env.VERITAS_KV.put('vdc:pending:count', pendingCount.toString());

    return pendingCount;
  }

  /**
   * Mine a new block with pending transactions
   */
  async mineBlock(): Promise<VDCBlock> {
    // Get pending transactions
    const pendingList = await this.env.VERITAS_KV.list({ prefix: 'vdc:pending:' });
    const transactions: VDCTransaction[] = [];

    for (const key of pendingList.keys) {
      if (key.name === 'vdc:pending:count') continue;
      
      const txData = await this.env.VERITAS_KV.get(key.name);
      if (txData) {
        transactions.push(JSON.parse(txData));
      }
    }

    if (transactions.length === 0) {
      throw new Error('No pending transactions to mine');
    }

    // Get previous block
    const latestData = await this.env.VERITAS_KV.get('vdc:latest');
    if (!latestData) {
      throw new Error('No latest block found - create genesis first');
    }

    const latest = JSON.parse(latestData);
    const blockNumber = latest.blockNumber + 1;
    const timestamp = Date.now();

    // Create block
    const block: VDCBlock = {
      blockNumber,
      timestamp,
      previousHash: latest.hash,
      hash: '',
      transactions,
      merkleRoot: this.calculateMerkleRoot(transactions),
      blockSignature: {
        publicKey: this.env.SYSTEM_DILITHIUM_PUBLIC_KEY,
        signature: '',
        keyVersion: parseInt(this.env.SYSTEM_KEY_VERSION || '1')
      }
    };

    // Calculate block hash
    block.hash = await this.calculateBlockHash(block);

    // Sign block with system master key
    const blockDataToSign = {
      blockNumber,
      timestamp,
      previousHash: latest.hash,
      hash: block.hash,
      merkleRoot: block.merkleRoot,
      transactionCount: transactions.length
    };

        block.blockSignature.signature = await this.maataraClient.signData(
          JSON.stringify(blockDataToSign),
          getSystemDilithiumPrivateKey(this.env)
        );

    // Upload to IPFS (optional for now)
    const blockJson = JSON.stringify(block, null, 2);
    try {
      const ipfsRecord = await createIPFSRecord(this.ipfsClient, blockJson, 'application/json');
      block.ipfsHash = ipfsRecord.hash;
    } catch (error) {
      console.warn('IPFS upload failed, using mock hash:', error);
      block.ipfsHash = 'QmMockBlock' + blockNumber + Date.now();
    }

    // Store block in KV
    await this.env.VERITAS_KV.put(`vdc:block:${blockNumber}`, JSON.stringify(block));
    
    // Update latest pointer
    await this.env.VERITAS_KV.put('vdc:latest', JSON.stringify({
      blockNumber,
      hash: block.hash,
      ipfsHash: block.ipfsHash,
      timestamp
    }));

    // Index transactions
    for (const tx of transactions) {
      await this.env.VERITAS_KV.put(`vdc:tx:${tx.id}`, JSON.stringify({
        blockNumber,
        txId: tx.id,
        type: tx.type,
        timestamp: tx.timestamp
      }));
    }

    // Clear pending transactions
    for (const key of pendingList.keys) {
      await this.env.VERITAS_KV.delete(key.name);
    }
    await this.env.VERITAS_KV.put('vdc:pending:count', '0');

    console.log(`🎉 VDC: Block ${blockNumber} mined!`);
    console.log(`   Hash: ${block.hash}`);
    console.log(`   IPFS: ${block.ipfsHash}`);
    console.log(`   Transactions: ${transactions.length}`);

    return block;
  }

  /**
   * Get the latest block
   */
  async getLatestBlock(): Promise<VDCBlock> {
    const latestData = await this.env.VERITAS_KV.get('vdc:latest');
    if (!latestData) {
      throw new Error('No latest block found');
    }

    const latest = JSON.parse(latestData);
    const blockData = await this.env.VERITAS_KV.get(`vdc:block:${latest.blockNumber}`);
    
    if (!blockData) {
      throw new Error(`Block ${latest.blockNumber} not found`);
    }

    return JSON.parse(blockData);
  }

  /**
   * Get a block by number
   */
  async getBlock(blockNumber: number): Promise<VDCBlock | null> {
    const blockData = await this.env.VERITAS_KV.get(`vdc:block:${blockNumber}`);
    return blockData ? JSON.parse(blockData) : null;
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(txId: string): Promise<VDCTransaction | null> {
    const txIndexData = await this.env.VERITAS_KV.get(`vdc:tx:${txId}`);
    if (!txIndexData) return null;

    const txIndex = JSON.parse(txIndexData);
    const block = await this.getBlock(txIndex.blockNumber);
    
    if (!block) return null;

    return block.transactions.find(tx => tx.id === txId) || null;
  }

  /**
   * Verify a transaction's dual signatures
   */
  async verifyTransaction(transaction: VDCTransaction): Promise<boolean> {
    try {
      const txData = {
        id: transaction.id,
        type: transaction.type,
        timestamp: transaction.timestamp,
        data: transaction.data
      };
      const dataToVerify = JSON.stringify(txData);

      // Verify user signature
      const userSigValid = await this.maataraClient.verifySignature(
        dataToVerify,
        transaction.signatures.user.signature,
        transaction.signatures.user.publicKey
      );

      if (!userSigValid) {
        console.error('❌ VDC: User signature invalid');
        return false;
      }

      // Verify system signature
      const systemSigValid = await this.maataraClient.verifySignature(
        dataToVerify,
        transaction.signatures.system.signature,
        transaction.signatures.system.publicKey
      );

      if (!systemSigValid) {
        console.error('❌ VDC: System signature invalid');
        return false;
      }

      return true;
    } catch (error) {
      console.error('❌ VDC: Transaction verification failed:', error);
      return false;
    }
  }

  /**
   * Verify a block's integrity
   */
  async verifyBlock(block: VDCBlock): Promise<boolean> {
    try {
      // Verify block hash
      const expectedHash = await this.calculateBlockHash(block);
      if (expectedHash !== block.hash) {
        console.error('❌ VDC: Block hash mismatch');
        return false;
      }

      // Verify merkle root
      const expectedMerkleRoot = this.calculateMerkleRoot(block.transactions);
      if (expectedMerkleRoot !== block.merkleRoot) {
        console.error('❌ VDC: Merkle root mismatch');
        return false;
      }

      // Verify block signature
      const blockDataToVerify = {
        blockNumber: block.blockNumber,
        timestamp: block.timestamp,
        previousHash: block.previousHash,
        hash: block.hash,
        merkleRoot: block.merkleRoot,
        transactionCount: block.transactions.length
      };

      const blockSigValid = await this.maataraClient.verifySignature(
        JSON.stringify(blockDataToVerify),
        block.blockSignature.signature,
        block.blockSignature.publicKey
      );

      if (!blockSigValid) {
        console.error('❌ VDC: Block signature invalid');
        return false;
      }

      // Verify all transactions
      for (const tx of block.transactions) {
        if (!(await this.verifyTransaction(tx))) {
          console.error(`❌ VDC: Transaction ${tx.id} invalid`);
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('❌ VDC: Block verification failed:', error);
      return false;
    }
  }

  /**
   * Calculate block hash
   */
  private async calculateBlockHash(block: VDCBlock): Promise<string> {
    const data = `${block.blockNumber}${block.previousHash}${block.merkleRoot}${block.timestamp}`;
    
    // Use Web Crypto API for SHA-256
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  }

  /**
   * Calculate Merkle root for transactions
   */
  private calculateMerkleRoot(transactions: VDCTransaction[]): string {
    if (transactions.length === 0) {
      return '0000000000000000000000000000000000000000000000000000000000000000';
    }

    // Simple merkle root: hash all transaction IDs together
    const txHashes = transactions.map(tx => this.hashString(tx.id));
    return this.hashString(txHashes.join(''));
  }

  /**
   * Hash a string using simple hash function
   */
  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16).padStart(8, '0');
  }

  /**
   * Get blockchain statistics
   */
  async getStats(): Promise<any> {
    const latestData = await this.env.VERITAS_KV.get('vdc:latest');
    const pendingCount = await this.env.VERITAS_KV.get('vdc:pending:count') || '0';
    
    if (!latestData) {
      return {
        initialized: false,
        message: 'Genesis block not created yet'
      };
    }

    const latest = JSON.parse(latestData);

    return {
      initialized: true,
      chain: 'VeritasByMaataraBlockChain (VDC)',
      totalBlocks: latest.blockNumber + 1,
      latestBlock: {
        number: latest.blockNumber,
        hash: latest.hash,
        ipfsHash: latest.ipfsHash,
        timestamp: latest.timestamp
      },
      pendingTransactions: parseInt(pendingCount),
      genesisHash: this.genesisBlock?.hash || 'unknown'
    };
  }
}

/**
 * Initialize the VDC blockchain
 */
export async function initializeVDC(env: Environment): Promise<VDCBlockchain> {
  const vdc = new VDCBlockchain(env);
  await vdc.initialize();
  return vdc;
}

/**
 * Helper function to add user registration to VDC
 */
export async function addUserToVDC(
  vdc: VDCBlockchain,
  userId: string,
  email: string,
  kyberPublicKey: string,
  dilithiumPublicKey: string,
  encryptedUserData: any,
  accountType: 'admin' | 'paid' | 'invited',
  userDilithiumPrivateKey: string
): Promise<string> {
  const txData = {
    userId,
    email,
    kyberPublicKey,
    dilithiumPublicKey,
    encryptedUserData,
    accountType
  };

  return await vdc.addTransaction(
    'user_registration',
    txData,
    userDilithiumPrivateKey,
    dilithiumPublicKey
  );
}

/**
 * Helper function to add document creation to VDC
 */
export async function addDocumentToVDC(
  vdc: VDCBlockchain,
  documentId: string,
  documentHash: string,
  ipfsHash: string,
  metadata: any,
  userDilithiumPrivateKey: string,
  userDilithiumPublicKey: string
): Promise<string> {
  const txData = {
    documentId,
    documentHash,
    ipfsHash,
    metadata
  };

  return await vdc.addTransaction(
    'document_creation',
    txData,
    userDilithiumPrivateKey,
    userDilithiumPublicKey
  );
}

/**
 * Helper function to add asset transfer to VDC
 */
export async function addAssetTransferToVDC(
  vdc: VDCBlockchain,
  assetId: string,
  fromUserId: string,
  toUserId: string,
  userDilithiumPrivateKey: string,
  userDilithiumPublicKey: string
): Promise<string> {
  const txData = {
    assetId,
    fromUserId,
    toUserId
  };

  return await vdc.addTransaction(
    'asset_transfer',
    txData,
    userDilithiumPrivateKey,
    userDilithiumPublicKey
  );
}
