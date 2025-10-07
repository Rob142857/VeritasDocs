// Types for the Veritas Documents system
export interface EncryptionMetadata {
  algorithm: string;
  version: string;
  keyId?: string;
  source: 'client' | 'server' | 'system';
}

export interface User {
  id: string;
  email: string;
  publicKey: string;
  kyberPublicKey?: string;
  dilithiumPublicKey: string;
  encryptedPrivateData: string; // Kyber-encrypted user details
  blockchainTxId?: string;
  createdAt: number;
  invitedBy?: string;
  hasActivated: boolean;
  accountType: 'admin' | 'paid' | 'invited';
}

export interface Asset {
  id: string;
  tokenId: string;
  ownerId: string;
  creatorId: string;
  title: string;
  description: string;
  documentType: 'will' | 'deed' | 'certificate' | 'contract' | 'other';
  ipfsHash?: string;
  encryptedData?: string; // Legacy support: Kyber-encrypted document (KV-stored)
  signature: string; // Dilithium signature
  createdAt: number;
  updatedAt: number;
  isPubliclySearchable: boolean;
  publicMetadata?: Record<string, any>;
  // Payment and VDC status
  paymentStatus?: 'pending' | 'completed' | 'failed';
  stripeSessionId?: string;
  vdcTransactionId?: string; // ID of VDC transaction after payment
  vdcBlockNumber?: number; // Block number where asset was registered
  // Web3 integration
  merkleRoot?: string; // Ethereum Merkle root hash
  ethereumTxHash?: string; // Transaction hash on Ethereum
  blockNumber?: number; // Ethereum block number
  ipfsMetadataHash?: string; // IPFS hash for metadata
  storage?: {
    documentR2Key: string;
    storedAt: number;
    size: number;
    ipfsHash?: string;
    ipfsGatewayUrl?: string;
    ipfsPinned?: boolean;
    encryption?: EncryptionMetadata;
  };
}

export interface OneTimeLink {
  id: string;
  token: string;
  createdBy: string; // user ID or 'admin'
  inviteType: 'admin' | 'user';
  email: string;
  expiresAt: number;
  used: boolean;
  usedAt?: number;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'account_creation' | 'asset_creation' | 'asset_transfer';
  amount: number;
  stripePaymentIntentId: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: number;
}

export interface VeritasChainBlock {
  id: string;
  blockNumber: number;
  previousHash: string;
  hash: string;
  timestamp: number;
  transactions: ChainTransaction[];
  signature: string;
}

export interface ChainTransaction {
  id: string;
  type: 'user_registration' | 'asset_creation' | 'asset_transfer';
  data: string; // Kyber-encrypted transaction data
  signature: string; // Dilithium signature
  timestamp: number;
}

export interface MaataraKeyPair {
  publicKey: string;
  privateKey: string;
}

export interface EncryptedUserData {
  email: string;
  personalDetails: {
    fullName: string;
    dateOfBirth?: string;
    address?: string;
    phoneNumber?: string;
  };
  recoveryPhrase: string; // 12-word mnemonic
}

export interface Environment {
  VERITAS_KV: KVNamespace;
  VDC_STORAGE: R2Bucket;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  MAATARA_CHAIN_PRIVATE_KEY: string;
  IPFS_API_KEY: string;
  ADMIN_SECRET_KEY: string;
  MAATARA_API_BASE: string;
  // Web3 and IPFS configuration
  ETHEREUM_RPC_URL: string;
  VERITAS_CONTRACT_ADDRESS: string;
  ETHEREUM_PRIVATE_KEY: string;
  // Optional override network name (mainnet|sepolia)
  ETHEREUM_NETWORK?: string;
  // Optional system wallet used for admin commits
  SYSTEM_ETH_PRIVATE_KEY?: string;
  SYSTEM_ETH_FROM_ADDRESS?: string;
  IPFS_GATEWAY_URL: string;
  PINATA_API_KEY?: string;
  PINATA_SECRET_KEY?: string;
  // Optional Pinata dedicated gateway (e.g., https://<subdomain>.mypinata.cloud)
  PINATA_GATEWAY_URL?: string;
  // VDC System Master Keys (Cloudflare Secrets)
  SYSTEM_DILITHIUM_PRIVATE_KEY?: string;
  SYSTEM_DILITHIUM_PRIVATE_KEY_PART1?: string;
  SYSTEM_DILITHIUM_PRIVATE_KEY_PART2?: string;
  SYSTEM_DILITHIUM_PUBLIC_KEY: string;
  SYSTEM_KYBER_PRIVATE_KEY: string;
  SYSTEM_KYBER_PUBLIC_KEY: string;
  SYSTEM_KEY_VERSION: string;
  SYSTEM_KEY_ID: string;
  // Precompiled WASM binding configured via wrangler.toml [wasm_modules]
  PQC_WASM?: WebAssembly.Module;
  // Optional feature flag: auto-mine a block after successful payment
  AUTO_MINE_ON_PAYMENT?: string;
  // Stripe price configuration
  PRICE_CENTS?: string;       // e.g. "2500"
  PRICE_CURRENCY?: string;    // e.g. "usd"
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface DashboardData {
  user: User;
  ownedAssets: Asset[];
  createdAssets: Asset[];
  transactions: Transaction[];
}

export interface SearchResult {
  assets: Asset[];
  total: number;
  page: number;
  limit: number;
}