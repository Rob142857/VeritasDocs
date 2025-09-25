// Types for the Veritas Documents system
export interface User {
  id: string;
  email: string;
  publicKey: string;
  encryptedPrivateData: string; // Kyber-encrypted user details
  createdAt: number;
  invitedBy?: string;
  hasActivated: boolean;
  accountType: 'paid' | 'invited';
}

export interface Asset {
  id: string;
  tokenId: string;
  ownerId: string;
  creatorId: string;
  title: string;
  description: string;
  documentType: 'will' | 'deed' | 'certificate' | 'contract' | 'other';
  ipfsHash: string;
  encryptedData: string; // Kyber-encrypted document
  signature: string; // Dilithium signature
  createdAt: number;
  updatedAt: number;
  isPubliclySearchable: boolean;
  publicMetadata?: Record<string, any>;
}

export interface OneTimeLink {
  id: string;
  token: string;
  createdBy: string;
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
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  MAATARA_CHAIN_PRIVATE_KEY: string;
  IPFS_API_KEY: string;
  ADMIN_SECRET_KEY: string;
  MAATARA_API_BASE: string;
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