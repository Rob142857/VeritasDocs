// Enhanced assets handler with IPFS and Ethereum anchoring
import { Hono } from 'hono';
import { Environment, Asset, User, APIResponse } from '../types';
import { MaataraClient } from '../utils/crypto';
import { IPFSClient, createIPFSRecord } from '../utils/ipfs';
import { EthereumAnchoringClient, anchorDocumentsToEthereum } from '../utils/ethereum';

const enhancedAssetHandler = new Hono<{ Bindings: Environment }>();

// Create new asset with IPFS storage and Ethereum anchoring
enhancedAssetHandler.post('/create-web3', async (c) => {
  try {
    const env = c.env;
    const {
      userId,
      title,
      description,
      documentType,
      documentData,
      isPubliclySearchable,
      publicMetadata,
      privateKey,
    } = await c.req.json();

    if (!userId || !title || !documentData || !privateKey) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'User ID, title, document data, and private key are required' 
      }, 400);
    }

    // Verify user exists
    const userData = await env.VERITAS_KV.get(`user:${userId}`);
    if (!userData) {
      return c.json<APIResponse>({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userData);
    
    // Initialize clients
    const maataraClient = new MaataraClient(env);
    const ipfsClient = new IPFSClient(env);
    const ethereumClient = new EthereumAnchoringClient(env);

    // 1. Encrypt document data with user's public key
    const encryptedData = await maataraClient.encryptData(
      JSON.stringify(documentData),
      user.publicKey
    );

    // 2. Upload encrypted data to IPFS via Cloudflare
    const ipfsRecord = await createIPFSRecord(
      ipfsClient,
      encryptedData,
      'application/json'
    );

    // 3. Create asset metadata for blockchain anchoring
    const assetMetadata = {
      id: `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      title,
      description,
      documentType,
      ownerId: userId,
      creatorId: userId,
      ipfsHash: ipfsRecord.hash,
      createdAt: Date.now(),
      isPubliclySearchable: isPubliclySearchable || false,
      publicMetadata: publicMetadata || {}
    };

    // 4. Upload metadata to IPFS
    const metadataRecord = await createIPFSRecord(
      ipfsClient,
      JSON.stringify(assetMetadata),
      'application/json'
    );

    // 5. Create Ethereum anchor with both content and metadata hashes
    const ethereumAnchor = await anchorDocumentsToEthereum(
      ethereumClient,
      userId,
      privateKey,
      [ipfsRecord.hash, metadataRecord.hash]
    );

    // 6. Sign the asset metadata with Dilithium
    const signature = await maataraClient.signData(
      JSON.stringify(assetMetadata),
      privateKey
    );

    // 7. Generate unique token ID
    const tokenId = `VRT_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // 8. Create final asset record
    const asset: Asset = {
      id: assetMetadata.id,
      tokenId,
      ownerId: userId,
      creatorId: userId,
      title,
      description,
      documentType,
      ipfsHash: ipfsRecord.hash,
      encryptedData: encryptedData,
      signature,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPubliclySearchable: isPubliclySearchable || false,
      publicMetadata: publicMetadata || {},
      // Web3 integration fields
      merkleRoot: ethereumAnchor.anchorHash,
      ethereumTxHash: ethereumAnchor.ethereumTxHash,
      ipfsMetadataHash: metadataRecord.hash
    };

    // 9. Store asset in KV
    await env.VERITAS_KV.put(`asset:${asset.id}`, JSON.stringify(asset));

    // 10. Add asset to user's owned assets list
    const userAssetsKey = `user_assets:${userId}`;
    const existingAssets = await env.VERITAS_KV.get(userAssetsKey);
    const assetsList = existingAssets ? JSON.parse(existingAssets) : [];
    assetsList.push(asset.id);
    await env.VERITAS_KV.put(userAssetsKey, JSON.stringify(assetsList));

    return c.json<APIResponse>({
      success: true,
      message: 'Asset created with IPFS storage and Ethereum anchoring',
      data: {
        asset: {
          id: asset.id,
          tokenId: asset.tokenId,
          title: asset.title,
          description: asset.description,
          documentType: asset.documentType,
          createdAt: asset.createdAt,
          ipfsHash: asset.ipfsHash,
          ipfsMetadataHash: asset.ipfsMetadataHash,
          merkleRoot: asset.merkleRoot,
          ethereumTxHash: asset.ethereumTxHash,
          ipfsGatewayUrl: ipfsClient.getIPFSUrl(asset.ipfsHash),
          metadataGatewayUrl: ipfsClient.getIPFSUrl(asset.ipfsMetadataHash!)
        },
        ethereumAnchor: {
          hash: ethereumAnchor.anchorHash,
          txHash: ethereumAnchor.ethereumTxHash,
          canonical: ethereumAnchor.canonical,
          signature: ethereumAnchor.signature
        }
      }
    });

  } catch (error) {
    console.error('Enhanced asset creation error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: `Failed to create asset: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, 500);
  }
});

// Get asset with IPFS and Ethereum verification
enhancedAssetHandler.get('/web3/:assetId', async (c) => {
  try {
    const env = c.env;
    const assetId = c.req.param('assetId');

    // Get asset from KV
    const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
    if (!assetData) {
      return c.json<APIResponse>({ success: false, error: 'Asset not found' }, 404);
    }

    const asset: Asset = JSON.parse(assetData);
    
    // Initialize clients for verification
    const ipfsClient = new IPFSClient(env);
    const ethereumClient = new EthereumAnchoringClient(env);

    // Verify asset integrity
    const verifications = {
      ipfsAccessible: false,
      metadataAccessible: false,
      ethereumAnchored: false
    };

    try {
      // Check if IPFS content is accessible
      await ipfsClient.retrieveFromIPFS(asset.ipfsHash);
      verifications.ipfsAccessible = true;
    } catch (error) {
      console.warn(`IPFS content not accessible: ${asset.ipfsHash}`);
    }

    try {
      // Check if metadata is accessible
      if (asset.ipfsMetadataHash) {
        await ipfsClient.retrieveFromIPFS(asset.ipfsMetadataHash);
        verifications.metadataAccessible = true;
      }
    } catch (error) {
      console.warn(`IPFS metadata not accessible: ${asset.ipfsMetadataHash}`);
    }

    try {
      // Verify Ethereum anchoring
      if (asset.merkleRoot) {
        verifications.ethereumAnchored = await ethereumClient.verifyAnchorOnEthereum(asset.merkleRoot);
      }
    } catch (error) {
      console.warn(`Ethereum verification failed: ${asset.merkleRoot}`);
    }

    return c.json<APIResponse>({
      success: true,
      data: {
        asset: {
          id: asset.id,
          tokenId: asset.tokenId,
          title: asset.title,
          description: asset.description,
          documentType: asset.documentType,
          createdAt: asset.createdAt,
          updatedAt: asset.updatedAt,
          ownerId: asset.ownerId,
          creatorId: asset.creatorId,
          isPubliclySearchable: asset.isPubliclySearchable,
          publicMetadata: asset.publicMetadata,
          // Web3 fields
          ipfsHash: asset.ipfsHash,
          ipfsMetadataHash: asset.ipfsMetadataHash,
          merkleRoot: asset.merkleRoot,
          ethereumTxHash: asset.ethereumTxHash,
          blockNumber: asset.blockNumber,
          // Gateway URLs
          ipfsGatewayUrl: ipfsClient.getIPFSUrl(asset.ipfsHash),
          metadataGatewayUrl: asset.ipfsMetadataHash ? ipfsClient.getIPFSUrl(asset.ipfsMetadataHash) : null
        },
        verifications
      }
    });

  } catch (error) {
    console.error('Enhanced asset retrieval error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: `Failed to retrieve asset: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, 500);
  }
});

// Retrieve and decrypt document content from IPFS
enhancedAssetHandler.post('/web3/:assetId/decrypt', async (c) => {
  try {
    const env = c.env;
    const assetId = c.req.param('assetId');
    const { privateKey } = await c.req.json();

    if (!privateKey) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Private key is required for decryption' 
      }, 400);
    }

    // Get asset from KV
    const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
    if (!assetData) {
      return c.json<APIResponse>({ success: false, error: 'Asset not found' }, 404);
    }

    const asset: Asset = JSON.parse(assetData);
    
    // Initialize clients
    const maataraClient = new MaataraClient(env);
    const ipfsClient = new IPFSClient(env);

    // Retrieve encrypted data from IPFS
    const encryptedData = await ipfsClient.retrieveFromIPFS(asset.ipfsHash);

    // Decrypt the document data
    const decryptedData = await maataraClient.decryptData(encryptedData, privateKey);
    const documentData = JSON.parse(decryptedData);

    return c.json<APIResponse>({
      success: true,
      data: {
        documentData,
        asset: {
          id: asset.id,
          tokenId: asset.tokenId,
          title: asset.title,
          description: asset.description,
          documentType: asset.documentType
        }
      }
    });

  } catch (error) {
    console.error('Document decryption error:', error);
    return c.json<APIResponse>({ 
      success: false, 
      error: `Failed to decrypt document: ${error instanceof Error ? error.message : 'Unknown error'}` 
    }, 500);
  }
});

export { enhancedAssetHandler };