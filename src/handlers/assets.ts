import { Hono } from 'hono';
import { Environment, Asset, User, APIResponse } from '../types';
import { MaataraClient, generateId, uploadToIPFS } from '../utils/crypto';
import { initializeVeritasChain, addAssetToChain, addAssetTransferToChain } from '../utils/blockchain';

const assetHandler = new Hono<{ Bindings: Environment }>();

// Create new asset/NFT
assetHandler.post('/create', async (c) => {
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
    const maataraClient = new MaataraClient(env);

    // Encrypt document data with user's public key
    const encryptedData = await maataraClient.encryptData(
      JSON.stringify(documentData),
      user.publicKey
    );

    // Upload encrypted data to IPFS
    const ipfsHash = await uploadToIPFS(encryptedData, env.IPFS_API_KEY);

    // Create asset metadata for signing
    const assetMetadata = {
      title,
      description,
      documentType,
      ipfsHash,
      createdAt: Date.now(),
      creatorId: userId,
    };

    // Sign the asset metadata
    const signature = await maataraClient.signData(
      JSON.stringify(assetMetadata),
      privateKey
    );

    // Create asset
    const assetId = generateId();
    const tokenId = `VD-${Date.now()}-${assetId.slice(0, 8)}`;

    const asset: Asset = {
      id: assetId,
      tokenId,
      ownerId: userId,
      creatorId: userId,
      title,
      description,
      documentType: documentType || 'other',
      ipfsHash,
      encryptedData,
      signature,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPubliclySearchable: isPubliclySearchable || false,
      publicMetadata: publicMetadata || {},
    };

    // Save asset to KV
    await env.VERITAS_KV.put(`asset:${assetId}`, JSON.stringify(asset));
    
    // Add to user's assets list
    const userAssetsKey = `user:${userId}:assets`;
    const userAssets = await env.VERITAS_KV.get(userAssetsKey);
    const assetsList = userAssets ? JSON.parse(userAssets) : [];
    assetsList.push(assetId);
    await env.VERITAS_KV.put(userAssetsKey, JSON.stringify(assetsList));

    // Add asset creation to Veritas blockchain
    const blockchain = await initializeVeritasChain(env);
    const txId = await addAssetToChain(
      blockchain,
      assetId,
      userId,
      ipfsHash,
      privateKey,
      user.publicKey
    );

    return c.json<APIResponse>({
      success: true,
      data: { asset, blockchainTxId: txId },
      message: 'Asset created successfully',
    });
  } catch (error) {
    console.error('Error creating asset:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get asset details
assetHandler.get('/:assetId', async (c) => {
  try {
    const env = c.env;
    const assetId = c.req.param('assetId');

    const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
    if (!assetData) {
      return c.json<APIResponse>({ success: false, error: 'Asset not found' }, 404);
    }

    const asset: Asset = JSON.parse(assetData);

    // Return public data only (no encrypted content)
    const publicAsset = {
      id: asset.id,
      tokenId: asset.tokenId,
      ownerId: asset.ownerId,
      creatorId: asset.creatorId,
      title: asset.title,
      description: asset.description,
      documentType: asset.documentType,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      isPubliclySearchable: asset.isPubliclySearchable,
      publicMetadata: asset.publicMetadata,
    };

    return c.json<APIResponse>({
      success: true,
      data: publicAsset,
    });
  } catch (error) {
    console.error('Error getting asset:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get user's assets
assetHandler.get('/user/:userId', async (c) => {
  try {
    const env = c.env;
    const userId = c.req.param('userId');

    const userAssetsKey = `user:${userId}:assets`;
    const userAssets = await env.VERITAS_KV.get(userAssetsKey);
    
    if (!userAssets) {
      return c.json<APIResponse>({
        success: true,
        data: { assets: [] },
      });
    }

    const assetIds: string[] = JSON.parse(userAssets);
    const assets = [];

    for (const assetId of assetIds) {
      const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
      if (assetData) {
        const asset: Asset = JSON.parse(assetData);
        // Return public data only
        assets.push({
          id: asset.id,
          tokenId: asset.tokenId,
          ownerId: asset.ownerId,
          creatorId: asset.creatorId,
          title: asset.title,
          description: asset.description,
          documentType: asset.documentType,
          createdAt: asset.createdAt,
          updatedAt: asset.updatedAt,
          isPubliclySearchable: asset.isPubliclySearchable,
          publicMetadata: asset.publicMetadata,
        });
      }
    }

    return c.json<APIResponse>({
      success: true,
      data: { assets },
    });
  } catch (error) {
    console.error('Error getting user assets:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Transfer asset ownership
assetHandler.post('/transfer', async (c) => {
  try {
    const env = c.env;
    const { assetId, fromUserId, toUserId, privateKey } = await c.req.json();

    if (!assetId || !fromUserId || !toUserId || !privateKey) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Asset ID, from user ID, to user ID, and private key are required' 
      }, 400);
    }

    // Verify asset exists and user owns it
    const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
    if (!assetData) {
      return c.json<APIResponse>({ success: false, error: 'Asset not found' }, 404);
    }

    const asset: Asset = JSON.parse(assetData);
    if (asset.ownerId !== fromUserId) {
      return c.json<APIResponse>({ success: false, error: 'You do not own this asset' }, 403);
    }

    // Verify from user exists
    const fromUserData = await env.VERITAS_KV.get(`user:${fromUserId}`);
    if (!fromUserData) {
      return c.json<APIResponse>({ success: false, error: 'From user not found' }, 404);
    }

    const fromUser: User = JSON.parse(fromUserData);

    // Verify target user exists
    const toUserData = await env.VERITAS_KV.get(`user:${toUserId}`);
    if (!toUserData) {
      return c.json<APIResponse>({ success: false, error: 'Target user not found' }, 404);
    }

    const maataraClient = new MaataraClient(env);

    // Create transfer transaction for signing
    const transferData = {
      assetId,
      fromUserId,
      toUserId,
      timestamp: Date.now(),
    };

    // Sign the transfer
    const signature = await maataraClient.signData(
      JSON.stringify(transferData),
      privateKey
    );

    // Update asset ownership
    asset.ownerId = toUserId;
    asset.updatedAt = Date.now();

    // Save updated asset
    await env.VERITAS_KV.put(`asset:${assetId}`, JSON.stringify(asset));

    // Remove from old owner's assets list
    const oldOwnerAssetsKey = `user:${fromUserId}:assets`;
    const oldOwnerAssets = await env.VERITAS_KV.get(oldOwnerAssetsKey);
    if (oldOwnerAssets) {
      const assetsList: string[] = JSON.parse(oldOwnerAssets);
      const updatedList = assetsList.filter(id => id !== assetId);
      await env.VERITAS_KV.put(oldOwnerAssetsKey, JSON.stringify(updatedList));
    }

    // Add to new owner's assets list
    const newOwnerAssetsKey = `user:${toUserId}:assets`;
    const newOwnerAssets = await env.VERITAS_KV.get(newOwnerAssetsKey);
    const newAssetsList = newOwnerAssets ? JSON.parse(newOwnerAssets) : [];
    newAssetsList.push(assetId);
    await env.VERITAS_KV.put(newOwnerAssetsKey, JSON.stringify(newAssetsList));

    // Add transfer to Veritas blockchain
    const blockchain = await initializeVeritasChain(env);
    const txId = await addAssetTransferToChain(
      blockchain,
      assetId,
      fromUserId,
      toUserId,
      privateKey,
      fromUser.publicKey
    );

    return c.json<APIResponse>({
      success: true,
      data: { asset, blockchainTxId: txId },
      message: 'Asset transferred successfully',
    });
  } catch (error) {
    console.error('Error transferring asset:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

export { assetHandler };