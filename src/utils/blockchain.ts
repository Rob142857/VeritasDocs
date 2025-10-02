// Veritas Blockchain - Custom blockchain stored in IPFS
import { Environment, VeritasChainBlock, ChainTransaction } from '../types';
import { IPFSClient, createIPFSRecord } from './ipfs';
import { MaataraClient } from './crypto';

export interface VeritasBlock {
  id: string;
  blockNumber: number;
  previousHash: string;
  hash: string;
  timestamp: number;
  transactions: VeritasTransaction[];
  signature: string;
  merkleRoot: string;
  ipfsHash?: string; // IPFS hash where this block is stored
}

export interface VeritasTransaction {
  id: string;
  type: 'user_registration' | 'asset_creation' | 'asset_transfer' | 'admin_action';
  data: any; // Encrypted transaction data
  signature: string; // Dilithium signature
  timestamp: number;
  publicKey: string; // Public key of the signer
}

export class VeritasBlockchain {
  private ipfsClient: IPFSClient;
  private maataraClient: MaataraClient;
  private genesisBlock: VeritasBlock;
  private currentBlockNumber: number = 0;
  private pendingTransactions: VeritasTransaction[] = [];

  constructor(env: Environment) {
    this.ipfsClient = new IPFSClient(env);
    this.maataraClient = new MaataraClient(env);

    // Initialize genesis block
    this.genesisBlock = this.createGenesisBlock();
  }

  /**
   * Create the genesis block for the Veritas chain
   */
  private createGenesisBlock(): VeritasBlock {
    const genesisData = {
      message: 'Veritas Documents - Genesis Block',
      timestamp: Date.now(),
      version: '1.0.0'
    };

    const block: VeritasBlock = {
      id: 'genesis',
      blockNumber: 0,
      previousHash: '0',
      hash: this.calculateBlockHash(0, '0', [], Date.now()),
      timestamp: Date.now(),
      transactions: [],
      signature: '',
      merkleRoot: this.calculateMerkleRoot([])
    };

    return block;
  }

  /**
   * Add a transaction to the pending pool
   */
  async addTransaction(
    type: VeritasTransaction['type'],
    data: any,
    privateKey: string,
    publicKey: string
  ): Promise<string> {
    // Create transaction data
    const transactionData = {
      type,
      data,
      timestamp: Date.now()
    };

    // Sign the transaction with Dilithium
    const signature = await this.maataraClient.signData(
      JSON.stringify(transactionData),
      privateKey
    );

    const transaction: VeritasTransaction = {
      id: `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type,
      data: transactionData,
      signature,
      timestamp: Date.now(),
      publicKey
    };

    // Add to pending transactions
    this.pendingTransactions.push(transaction);

    return transaction.id;
  }

  /**
   * Mine a new block with pending transactions
   */
  async mineBlock(): Promise<VeritasBlock> {
    if (this.pendingTransactions.length === 0) {
      throw new Error('No pending transactions to mine');
    }

    const previousBlock = await this.getLatestBlock();
    const blockNumber = previousBlock.blockNumber + 1;
    const timestamp = Date.now();

    // Create block
    const block: VeritasBlock = {
      id: `block_${blockNumber}`,
      blockNumber,
      previousHash: previousBlock.hash,
      hash: '',
      timestamp,
      transactions: [...this.pendingTransactions],
      signature: '',
      merkleRoot: this.calculateMerkleRoot(this.pendingTransactions)
    };

    // Calculate block hash
    block.hash = this.calculateBlockHash(
      blockNumber,
      previousBlock.hash,
      this.pendingTransactions,
      timestamp
    );

    // Sign the block (using system key for now - in production, use validator keys)
    // For now, we'll use a mock signature since we don't have a system private key
    block.signature = `mock_signature_${block.hash}`;

    // Store block in IPFS
    const blockData = JSON.stringify(block, null, 2);
    const ipfsRecord = await createIPFSRecord(
      this.ipfsClient,
      blockData,
      'application/json'
    );

    block.ipfsHash = ipfsRecord.hash;

    // Clear pending transactions
    this.pendingTransactions = [];

    // Update current block number
    this.currentBlockNumber = blockNumber;

    return block;
  }

  /**
   * Get the latest block from the chain
   */
  async getLatestBlock(): Promise<VeritasBlock> {
    // For now, return genesis block or last known block
    // In a full implementation, this would track the chain state
    return this.genesisBlock;
  }

  /**
   * Get a block by number
   */
  async getBlock(blockNumber: number): Promise<VeritasBlock | null> {
    if (blockNumber === 0) {
      return this.genesisBlock;
    }

    // In a full implementation, this would retrieve from IPFS or local storage
    // For now, return null for non-genesis blocks
    return null;
  }

  /**
   * Get transaction by ID
   */
  async getTransaction(txId: string): Promise<VeritasTransaction | null> {
    // Search in pending transactions first
    const pendingTx = this.pendingTransactions.find(tx => tx.id === txId);
    if (pendingTx) {
      return pendingTx;
    }

    // In a full implementation, this would search through all blocks
    // For now, return null
    return null;
  }

  /**
   * Verify a transaction's signature
   */
  async verifyTransaction(transaction: VeritasTransaction): Promise<boolean> {
    try {
      const dataToVerify = JSON.stringify({
        type: transaction.type,
        data: transaction.data,
        timestamp: transaction.timestamp
      });

      return await this.maataraClient.verifySignature(
        dataToVerify,
        transaction.signature,
        transaction.publicKey
      );
    } catch (error) {
      console.error('Transaction verification failed:', error);
      return false;
    }
  }

  /**
   * Verify a block's integrity
   */
  async verifyBlock(block: VeritasBlock): Promise<boolean> {
    try {
      // Verify block hash
      const expectedHash = this.calculateBlockHash(
        block.blockNumber,
        block.previousHash,
        block.transactions,
        block.timestamp
      );

      if (expectedHash !== block.hash) {
        return false;
      }

      // Verify merkle root
      const expectedMerkleRoot = this.calculateMerkleRoot(block.transactions);
      if (expectedMerkleRoot !== block.merkleRoot) {
        return false;
      }

      // Verify all transactions in the block
      for (const tx of block.transactions) {
        if (!(await this.verifyTransaction(tx))) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Block verification failed:', error);
      return false;
    }
  }

  /**
   * Get blockchain statistics
   */
  async getStats(): Promise<any> {
    return {
      totalBlocks: this.currentBlockNumber + 1,
      pendingTransactions: this.pendingTransactions.length,
      genesisBlock: this.genesisBlock.hash,
      latestBlock: (await this.getLatestBlock()).hash
    };
  }

  /**
   * Calculate block hash
   */
  private calculateBlockHash(
    blockNumber: number,
    previousHash: string,
    transactions: VeritasTransaction[],
    timestamp: number
  ): string {
    const data = `${blockNumber}${previousHash}${JSON.stringify(transactions)}${timestamp}`;
    // Simple hash for demo - in production use proper crypto
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Calculate Merkle root for transactions
   */
  private calculateMerkleRoot(transactions: VeritasTransaction[]): string {
    if (transactions.length === 0) {
      return '0';
    }

    // Simple merkle root calculation for demo
    const hashes = transactions.map(tx => this.hashTransaction(tx));
    return this.hashArray(hashes);
  }

  /**
   * Hash a single transaction
   */
  private hashTransaction(tx: VeritasTransaction): string {
    const data = `${tx.id}${tx.type}${JSON.stringify(tx.data)}${tx.timestamp}`;
    let hash = 0;
    for (let i = 0; i < data.length; i++) {
      const char = data.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Hash an array of strings
   */
  private hashArray(arr: string[]): string {
    const combined = arr.join('');
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Helper function to create and manage the Veritas blockchain
 */
export async function initializeVeritasChain(env: Environment): Promise<VeritasBlockchain> {
  const blockchain = new VeritasBlockchain(env);

  // Initialize chain state
  // In a full implementation, this would load the latest state from IPFS/storage

  return blockchain;
}

/**
 * Helper function to add user registration to blockchain
 */
export async function addUserToChain(
  blockchain: VeritasBlockchain,
  userId: string,
  publicKey: string,
  privateKey: string
): Promise<string> {
  const transactionData = {
    userId,
    publicKey,
    action: 'user_registration'
  };

  return await blockchain.addTransaction(
    'user_registration',
    transactionData,
    privateKey,
    publicKey
  );
}

/**
 * Helper function to add asset creation to blockchain
 */
export async function addAssetToChain(
  blockchain: VeritasBlockchain,
  assetId: string,
  ownerId: string,
  ipfsHash: string,
  privateKey: string,
  publicKey: string
): Promise<string> {
  const transactionData = {
    assetId,
    ownerId,
    ipfsHash,
    action: 'asset_creation'
  };

  return await blockchain.addTransaction(
    'asset_creation',
    transactionData,
    privateKey,
    publicKey
  );
}

/**
 * Helper function to add asset transfer to blockchain
 */
export async function addAssetTransferToChain(
  blockchain: VeritasBlockchain,
  assetId: string,
  fromUserId: string,
  toUserId: string,
  privateKey: string,
  publicKey: string
): Promise<string> {
  const transactionData = {
    assetId,
    fromUserId,
    toUserId,
    action: 'asset_transfer'
  };

  return await blockchain.addTransaction(
    'asset_transfer',
    transactionData,
    privateKey,
    publicKey
  );
}