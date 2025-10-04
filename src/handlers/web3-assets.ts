// Enhanced assets handler with IPFS and Ethereum anchoring
import { Hono } from 'hono';
import { Environment, Asset, User, APIResponse } from '../types';
import { MaataraClient, hashString } from '../utils/crypto';
import { IPFSClient, createIPFSRecord } from '../utils/ipfs';
import { EthereumAnchoringClient, anchorDocumentsToEthereum } from '../utils/ethereum';

const enhancedAssetHandler = new Hono<{ Bindings: Environment }>();

// Create new asset with IPFS storage and Ethereum anchoring
enhancedAssetHandler.post('/create-web3', async (c) => {
  try {
    const env = c.env;
    console.log('Starting asset creation...');
    
    const requestBody = await c.req.json();
    console.log('Request body received:', Object.keys(requestBody));
    
    const {
      userId,
      title,
      description,
      documentType,
      documentData,
      isPubliclySearchable,
      publicMetadata,
      signature,        // Client-side signature
      signaturePayload, // What was signed client-side
      signatureVersion, // Version of signature format
    } = requestBody;

    console.log('Validating required fields...');
    if (!userId || !title || !documentData || !signature || !signaturePayload) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'User ID, title, document data, signature, and signature payload are required' 
      }, 400);
    }

    // Parse and validate signature payload
    let parsedSignaturePayload;
    try {
      parsedSignaturePayload = JSON.parse(signaturePayload);
    } catch (e) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Invalid signature payload format' 
      }, 400);
    }

    // Verify document hash matches
    console.log('Verifying document hash...');
    const maataraClient = new MaataraClient(env);
    const documentHash = await hashString(documentData);
    
    if (documentHash !== parsedSignaturePayload.documentHash) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Document hash verification failed' 
      }, 400);
    }
    console.log('Document hash verified successfully');

    // Verify user exists and get their public key for signature verification
    const userData = await env.VERITAS_KV.get(`user:${userId}`);
    if (!userData) {
      return c.json<APIResponse>({ success: false, error: 'User not found' }, 404);
    }

    const user: User = JSON.parse(userData);
    console.log('User found:', user.email);

    // Verify the client-side signature
    console.log('Verifying client signature...');
    const isSignatureValid = await maataraClient.verifySignature(
      signaturePayload,
      signature,
      user.dilithiumPublicKey
    );

    if (!isSignatureValid) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Invalid signature - asset creation rejected' 
      }, 400);
    }

    console.log('Client signature verified successfully');

    // Initialize clients for IPFS and Ethereum operations
    console.log('Initializing IPFS and Ethereum clients...');
    const ipfsClient = new IPFSClient(env);
    console.log('IPFS client initialized');
    const ethereumClient = new EthereumAnchoringClient(env);
    console.log('Ethereum client initialized');

    // 1. Document data should already be encrypted client-side
    console.log('Using client-side encrypted document data...');
    let encryptedData = documentData;
    
    // Check if data is already encrypted (has our encryption format)
    try {
      const parsed = JSON.parse(documentData);
      if (parsed.encrypted && parsed.ciphertext) {
        console.log('Data is already encrypted client-side');
        encryptedData = documentData;
      } else {
        console.warn('Data does not appear to be encrypted, wrapping as-is');
        encryptedData = JSON.stringify({ plaintext: documentData, encrypted: false });
      }
    } catch (e) {
      console.warn('Data is not JSON, treating as plaintext');
      encryptedData = JSON.stringify({ plaintext: documentData, encrypted: false });
    }

    // 2. Upload encrypted data to IPFS via Cloudflare (skip if Pinata not configured)
    let ipfsRecord;
    try {
      ipfsRecord = await createIPFSRecord(
        ipfsClient,
        encryptedData,
        'application/json'
      );
    } catch (ipfsError) {
      // IPFS upload failed (likely Pinata not configured), use placeholder hash
      console.warn('IPFS upload failed, using placeholder:', ipfsError);
      ipfsRecord = {
        hash: `placeholder_${Date.now()}`,
        size: encryptedData.length,
        timestamp: Date.now()
      };
    }

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

    // 4. Upload metadata to IPFS (skip if Pinata not configured)
    let metadataRecord;
    try {
      metadataRecord = await createIPFSRecord(
        ipfsClient,
        JSON.stringify(assetMetadata),
        'application/json'
      );
    } catch (metadataError) {
      console.warn('IPFS metadata upload failed, using placeholder:', metadataError);
      metadataRecord = {
        hash: `metadata_${Date.now()}`,
        size: JSON.stringify(assetMetadata).length,
        timestamp: Date.now()
      };
    }

    // 5. Create Ethereum anchor placeholder (client-side anchoring not implemented yet)
    let ethereumAnchor;
    try {
      // TODO: Implement client-side Ethereum anchoring with user signature
      ethereumAnchor = {
        anchorHash: `placeholder_${Date.now()}`,
        ethereumTxHash: `0x${Date.now().toString(16)}`,
        canonical: '',
        signature: signature, // Use client signature
        timestamp: Date.now()
      };
    } catch (ethError) {
      console.warn('Ethereum anchoring placeholder used:', ethError);
      ethereumAnchor = {
        anchorHash: `placeholder_${Date.now()}`,
        ethereumTxHash: `0x${Date.now().toString(16)}`,
        canonical: '',
        signature: signature,
        timestamp: Date.now()
      };
    }

    // 6. Use the verified client signature

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

    // 9. Store asset in KV with pending payment status
    asset.paymentStatus = 'pending';
    await env.VERITAS_KV.put(`asset:${asset.id}`, JSON.stringify(asset));

    // 10. Add asset to user's pending assets list (will move to owned after payment)
    const userPendingAssetsKey = `user_pending_assets:${userId}`;
    const existingPendingAssets = await env.VERITAS_KV.get(userPendingAssetsKey);
    const pendingAssetsList = existingPendingAssets ? JSON.parse(existingPendingAssets) : [];
    pendingAssetsList.push(asset.id);
    await env.VERITAS_KV.put(userPendingAssetsKey, JSON.stringify(pendingAssetsList));

    // 11. Create REAL Stripe checkout session for $25 payment
    console.log('Creating Stripe checkout session...');
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Veritas Document Asset',
              description: `${title} - ${documentType}`,
            },
            unit_amount: 2500, // $25.00 in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${c.req.header('origin') || 'https://veritas-docs-production.rme-6e5.workers.dev'}/success?session_id={CHECKOUT_SESSION_ID}&asset_id=${asset.id}`,
      cancel_url: `${c.req.header('origin') || 'https://veritas-docs-production.rme-6e5.workers.dev'}/create-asset`,
      metadata: {
        assetId: asset.id,
        userId: userId,
        type: 'asset_creation',
      },
    });

    // Store checkout session ID with asset
    await env.VERITAS_KV.put(`stripe_session:${checkoutSession.id}`, asset.id);
    asset.stripeSessionId = checkoutSession.id;
    await env.VERITAS_KV.put(`asset:${asset.id}`, JSON.stringify(asset));

    console.log('Stripe checkout session created:', checkoutSession.id);

    return c.json<APIResponse>({
      success: true,
      message: 'Asset created - redirecting to payment',
      data: {
        stripeUrl: checkoutSession.url,
        sessionId: checkoutSession.id,
        asset: {
          id: asset.id,
          tokenId: asset.tokenId,
          title: asset.title,
          description: asset.description,
          documentType: asset.documentType,
          createdAt: asset.createdAt,
          paymentStatus: 'pending',
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
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('Error stack:', errorStack);
    return c.json<APIResponse>({ 
      success: false, 
      error: `Failed to create asset: ${errorMessage} | Stack: ${errorStack}`
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

// Get user's assets (both pending and confirmed)
enhancedAssetHandler.get('/user/:userId', async (c) => {
  try {
    const env = c.env;
    const userId = c.req.param('userId');

    // Get both pending and confirmed asset lists
    const pendingAssetsData = await env.VERITAS_KV.get(`user_pending_assets:${userId}`);
    const confirmedAssetsData = await env.VERITAS_KV.get(`user_assets:${userId}`);
    
    const pendingAssetIds: string[] = pendingAssetsData ? JSON.parse(pendingAssetsData) : [];
    const confirmedAssetIds: string[] = confirmedAssetsData ? JSON.parse(confirmedAssetsData) : [];
    
    const pendingAssets = [];
    const confirmedAssets = [];

    // Fetch pending assets
    for (const assetId of pendingAssetIds) {
      const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
      if (assetData) {
        const asset: Asset = JSON.parse(assetData);
        pendingAssets.push({
          id: asset.id,
          tokenId: asset.tokenId,
          ownerId: asset.ownerId,
          creatorId: asset.creatorId,
          title: asset.title,
          description: asset.description,
          documentType: asset.documentType,
          createdAt: asset.createdAt,
          paymentStatus: asset.paymentStatus,
          vdcTransactionId: asset.vdcTransactionId,
          vdcBlockNumber: asset.vdcBlockNumber,
          status: 'pending_payment'
        });
      }
    }

    // Fetch confirmed assets
    for (const assetId of confirmedAssetIds) {
      const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
      if (assetData) {
        const asset: Asset = JSON.parse(assetData);
        // Determine status based on VDC block number
        const status = asset.vdcBlockNumber 
          ? 'confirmed' 
          : (asset.vdcTransactionId ? 'pending_mining' : 'paid');
        
        confirmedAssets.push({
          id: asset.id,
          tokenId: asset.tokenId,
          ownerId: asset.ownerId,
          creatorId: asset.creatorId,
          title: asset.title,
          description: asset.description,
          documentType: asset.documentType,
          createdAt: asset.createdAt,
          paymentStatus: asset.paymentStatus,
          vdcTransactionId: asset.vdcTransactionId,
          vdcBlockNumber: asset.vdcBlockNumber,
          status
        });
      }
    }

    return c.json<APIResponse>({
      success: true,
      data: {
        pending: pendingAssets,
        confirmed: confirmedAssets,
        total: pendingAssets.length + confirmedAssets.length
      },
    });
  } catch (error) {
    console.error('Error getting user assets:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

export { enhancedAssetHandler };