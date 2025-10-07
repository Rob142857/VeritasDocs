// Enhanced assets handler with IPFS and Ethereum anchoring
import { Hono } from 'hono';
import { Environment, Asset, User, APIResponse, EncryptionMetadata } from '../types';
import { MaataraClient, hashString } from '../utils/crypto';
import { IPFSClient, createIPFSRecord, IPFSRecord } from '../utils/ipfs';
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
      contentType,
      filename,
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

    const userKyberPublicKey = user.kyberPublicKey || user.publicKey;
    if (!userKyberPublicKey) {
      console.error('User record missing Kyber public key');
      return c.json<APIResponse>({ success: false, error: 'User encryption key unavailable' }, 500);
    }

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
    console.log('Ensuring document payload is Kyber-encrypted before storage...');

    const safeParseJson = (value: string): any | null => {
      try {
        return JSON.parse(value);
      } catch (err) {
        return null;
      }
    };

    const isKyberEnvelope = (payload: any): boolean => {
      return !!payload && typeof payload === 'object' &&
        typeof payload.algorithm === 'string' &&
        typeof payload.ciphertext === 'string' &&
        typeof payload.kem_ct === 'string' &&
        typeof payload.iv === 'string';
    };

    let encryptedData: string | null = null;
    let encryptionSource: 'client' | 'server' = 'client';
    let plaintextPayload: string | null = null;

    const parsedDocument = safeParseJson(documentData);

    if (parsedDocument && isKyberEnvelope(parsedDocument)) {
      encryptedData = documentData;
    } else if (parsedDocument && parsedDocument.encrypted === true && isKyberEnvelope(parsedDocument)) {
      encryptedData = documentData;
    } else if (parsedDocument && parsedDocument.encrypted === false && typeof parsedDocument.plaintext === 'string') {
      const nested = safeParseJson(parsedDocument.plaintext);
      if (nested && isKyberEnvelope(nested)) {
        encryptedData = parsedDocument.plaintext;
      } else {
        plaintextPayload = parsedDocument.plaintext;
      }
    } else if (parsedDocument && typeof parsedDocument.plaintext === 'string') {
      plaintextPayload = parsedDocument.plaintext;
    } else if (parsedDocument && isKyberEnvelope(parsedDocument.data)) {
      encryptedData = JSON.stringify(parsedDocument.data);
    } else if (parsedDocument) {
      plaintextPayload = JSON.stringify(parsedDocument);
    } else {
      plaintextPayload = documentData;
    }

    if (!encryptedData) {
      // Optional strict mode: require client-side encryption to preserve exact bits
      if ((env as any)?.REQUIRE_CLIENT_ENCRYPTION === 'true') {
        return c.json<APIResponse>({
          success: false,
          error: 'Client-side encryption required. Please ensure the document is encrypted with Kyber before upload.'
        }, 400);
      }
      encryptionSource = 'server';
      const payloadToEncrypt = plaintextPayload ?? documentData;
      encryptedData = await maataraClient.encryptData(payloadToEncrypt, userKyberPublicKey);
    }

    if (!encryptedData) {
      console.error('Failed to prepare encrypted document payload');
      return c.json<APIResponse>({ success: false, error: 'Unable to encrypt document' }, 500);
    }

    console.log(`Document encryption source: ${encryptionSource}`);

    // Precompute asset identifier for storage coordination
    const assetId = `asset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Pre-compute document size for storage metadata
  const documentBuffer = new TextEncoder().encode(encryptedData);
    const documentSize = documentBuffer.length;

    // 2. Upload encrypted data to IPFS via Pinata if configured; do not fail asset creation if IPFS is unavailable
    let ipfsRecord: IPFSRecord | null = null;
    try {
      ipfsRecord = await createIPFSRecord(
        ipfsClient,
        encryptedData,
        'application/json'
      );
      // Attempt to warm Cloudflare gateway so public link is available sooner
      if (ipfsRecord?.hash) {
        // Slightly longer warm time just after upload to allow propagation
        ipfsClient.warmGateway(ipfsRecord.hash, 'cloudflare', 8000).catch(() => {});
      }
    } catch (ipfsError: any) {
      console.warn('IPFS upload skipped or failed, continuing with R2-only storage:', ipfsError?.message || ipfsError);
    }

    // 3. Create asset metadata for blockchain anchoring (store to IPFS if available)
    // PRIVACY PROTECTION: Only include identifying info if document is public
    const isPublic = isPubliclySearchable === true;
    
    const assetMetadata = isPublic ? {
      // PUBLIC metadata - searchable and viewable by anyone
      id: assetId,
      title,
      description,
      documentType,
      ownerId: userId,
      creatorId: userId,
      ...(ipfsRecord?.hash ? { ipfsHash: ipfsRecord.hash } : {}),
      createdAt: Date.now(),
      isPubliclySearchable: true,
      publicMetadata: {
        ...(publicMetadata || {}),
        originalContentType: contentType || undefined,
        originalFilename: filename || undefined
      }
    } : {
      // PRIVATE metadata - minimal info for ownership verification only
      id: assetId,
      ...(ipfsRecord?.hash ? { ipfsHash: ipfsRecord.hash } : {}),
      createdAt: Date.now(),
      isPubliclySearchable: false,
      // Include public keys for ownership verification when user logs in
      ownerPublicKey: userKyberPublicKey,
      creatorPublicKey: userKyberPublicKey
    };

    // 4. Upload metadata to IPFS if available; otherwise continue without
    let metadataRecord: IPFSRecord | null = null;
    try {
      metadataRecord = await createIPFSRecord(
        ipfsClient,
        JSON.stringify(assetMetadata),
        'application/json'
      );
      if (metadataRecord?.hash) {
        ipfsClient.warmGateway(metadataRecord.hash, 'cloudflare', 8000).catch(() => {});
      }
    } catch (metadataError: any) {
      console.warn('IPFS metadata upload skipped or failed:', metadataError?.message || metadataError);
    }

    // 5. Store encrypted document in R2 for durable, low-latency retrieval
    const storageBucket = env.VDC_STORAGE;
    if (!storageBucket) {
      console.error('VDC_STORAGE binding is not configured. Cannot persist encrypted document.');
      return c.json<APIResponse>({ success: false, error: 'Document storage not configured' }, 500);
    }

    const documentStoredAt = Date.now();
    const documentKey = `documents/${userId}/${assetId}.json`;

    const storageEncryptionMetadata: EncryptionMetadata = {
      algorithm: 'kyber768-aes256gcm',
      version: '1.0',
      keyId: user.id,
      source: encryptionSource
    };

    await storageBucket.put(documentKey, encryptedData, {
      httpMetadata: {
        contentType: 'application/json'
      },
      customMetadata: {
        assetId,
        userId,
        documentType: documentType || 'other',
        document_content_type: contentType || '',
        document_filename: filename || '',
        encryption_algorithm: storageEncryptionMetadata.algorithm,
        encryption_version: storageEncryptionMetadata.version,
        encryption_source: storageEncryptionMetadata.source,
        encryption_owner: user.id
      }
    });

    const assetStorage = {
      documentR2Key: documentKey,
      storedAt: documentStoredAt,
      size: documentSize,
      ...(ipfsRecord?.hash ? {
        ipfsHash: ipfsRecord.hash,
        ipfsGatewayUrl: ipfsRecord.gatewayUrl || ipfsClient.getIPFSUrl(ipfsRecord.hash),
        ipfsPinned: !!ipfsRecord.isPinned,
      } : {}),
      encryption: storageEncryptionMetadata
    } as Asset['storage'];

    // 6. Create Ethereum anchor placeholder (client-side anchoring not implemented yet)
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

    // 7. Use the verified client signature

    // 8. Generate unique token ID
    const tokenId = `VRT_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    // 9. Create final asset record
    const asset: Asset = {
      id: assetMetadata.id,
      tokenId,
      ownerId: userId,
      creatorId: userId,
      title,
      description,
      documentType,
      ...(ipfsRecord?.hash ? { ipfsHash: ipfsRecord.hash } : {}),
      signature,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isPubliclySearchable: isPubliclySearchable || false,
      publicMetadata: isPublic ? (assetMetadata as any).publicMetadata || {} : {},
      // Web3 integration fields
      merkleRoot: ethereumAnchor.anchorHash,
      ethereumTxHash: ethereumAnchor.ethereumTxHash,
      ...(metadataRecord?.hash ? { ipfsMetadataHash: metadataRecord.hash } : {}),
      storage: assetStorage
    };

    // 10. Store asset in KV with pending payment status
    asset.paymentStatus = 'pending';
    await env.VERITAS_KV.put(`asset:${asset.id}`, JSON.stringify(asset));

    // 11. Add asset to user's pending assets list (will move to owned after payment)
    const userPendingAssetsKey = `user_pending_assets:${userId}`;
    const existingPendingAssets = await env.VERITAS_KV.get(userPendingAssetsKey);
    const pendingAssetsList = existingPendingAssets ? JSON.parse(existingPendingAssets) : [];
    pendingAssetsList.push(asset.id);
    await env.VERITAS_KV.put(userPendingAssetsKey, JSON.stringify(pendingAssetsList));

    // 12. Create REAL Stripe checkout session for $25 payment
    console.log('Creating Stripe checkout session...');
    const Stripe = (await import('stripe')).default;
    const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2023-10-16',
    });

    const priceCurrency = (env.PRICE_CURRENCY || 'usd').toLowerCase();
    const priceCents = parseInt(env.PRICE_CENTS || '2500', 10);
    const checkoutSession = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: priceCurrency,
            product_data: {
              name: 'Veritas Document Asset',
              description: `${title} - ${documentType}`,
            },
            unit_amount: priceCents, // price in smallest unit
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
          ipfsGatewayUrl: asset.ipfsHash ? (ipfsClient.getPinataIPFSUrl(asset.ipfsHash) || ipfsClient.getIPFSUrl(asset.ipfsHash)) : undefined,
          ipfsGatewayUrlCloudflare: asset.ipfsHash ? ipfsClient.getIPFSUrl(asset.ipfsHash) : undefined,
          ipfsGatewayUrlPinata: asset.ipfsHash ? (ipfsClient.getPinataIPFSUrl(asset.ipfsHash) || undefined) : undefined,
          metadataGatewayUrl: asset.ipfsMetadataHash ? (ipfsClient.getPinataIPFSUrl(asset.ipfsMetadataHash) || ipfsClient.getIPFSUrl(asset.ipfsMetadataHash)) : undefined,
          metadataGatewayUrlCloudflare: asset.ipfsMetadataHash ? ipfsClient.getIPFSUrl(asset.ipfsMetadataHash) : undefined,
          metadataGatewayUrlPinata: asset.ipfsMetadataHash ? (ipfsClient.getPinataIPFSUrl(asset.ipfsMetadataHash) || undefined) : undefined
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
      const contentHash = asset.ipfsHash || asset.storage?.ipfsHash;
      if (contentHash) {
        await ipfsClient.retrieveFromIPFS(contentHash);
        verifications.ipfsAccessible = true;
      }
    } catch (error) {
      console.warn(`IPFS content not accessible: ${asset.ipfsHash || asset.storage?.ipfsHash}`);
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
          originalContentType: asset.publicMetadata?.originalContentType,
          originalFilename: asset.publicMetadata?.originalFilename,
          // Web3 fields
          ipfsHash: asset.ipfsHash,
          ipfsMetadataHash: asset.ipfsMetadataHash,
          merkleRoot: asset.merkleRoot,
          ethereumTxHash: asset.ethereumTxHash,
          blockNumber: asset.blockNumber,
          // Gateway URLs (prefer Pinata, include both for UI toggle)
          ipfsGatewayUrl: (asset.ipfsHash
            ? (ipfsClient.getPinataIPFSUrl(asset.ipfsHash) || ipfsClient.getIPFSUrl(asset.ipfsHash))
            : (asset.storage?.ipfsHash ? (ipfsClient.getPinataIPFSUrl(asset.storage.ipfsHash) || ipfsClient.getIPFSUrl(asset.storage.ipfsHash)) : null)),
          ipfsGatewayUrlCloudflare: (asset.ipfsHash || asset.storage?.ipfsHash) ? ipfsClient.getIPFSUrl(asset.ipfsHash || asset.storage!.ipfsHash!) : null,
          ipfsGatewayUrlPinata: (asset.ipfsHash || asset.storage?.ipfsHash) ? (ipfsClient.getPinataIPFSUrl(asset.ipfsHash || asset.storage!.ipfsHash!) || null) : null,
          metadataGatewayUrl: asset.ipfsMetadataHash ? (ipfsClient.getPinataIPFSUrl(asset.ipfsMetadataHash) || ipfsClient.getIPFSUrl(asset.ipfsMetadataHash)) : null,
          metadataGatewayUrlCloudflare: asset.ipfsMetadataHash ? ipfsClient.getIPFSUrl(asset.ipfsMetadataHash) : null,
          metadataGatewayUrlPinata: asset.ipfsMetadataHash ? (ipfsClient.getPinataIPFSUrl(asset.ipfsMetadataHash) || null) : null
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

    // Retrieve encrypted data from R2 first, fallback to IPFS
    let encryptedData: string | null = null;

    if (asset.storage?.documentR2Key && env.VDC_STORAGE) {
      try {
        const r2Object = await env.VDC_STORAGE.get(asset.storage.documentR2Key);
        if (r2Object) {
          encryptedData = await r2Object.text();
        }
      } catch (error) {
        console.warn(`Failed to fetch encrypted document from R2 for asset ${asset.id}`, error);
      }
    }

    if (!encryptedData) {
      const contentHash = asset.ipfsHash || asset.storage?.ipfsHash;
      if (contentHash) {
        encryptedData = await ipfsClient.retrieveFromIPFS(contentHash);
      }
    }

    if (!encryptedData) {
      return c.json<APIResponse>({
        success: false,
        error: 'Encrypted document could not be retrieved'
      }, 500);
    }

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

// Retrieve encrypted document content (no decryption, zero-knowledge)
enhancedAssetHandler.get('/web3/:assetId/encrypted', async (c) => {
  try {
    const env = c.env;
    const assetId = c.req.param('assetId');

    // Get asset from KV
    const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
    if (!assetData) {
      return c.json<APIResponse>({ success: false, error: 'Asset not found' }, 404);
    }

    const asset: Asset = JSON.parse(assetData);

    // Prefer R2; fallback to IPFS
    let encryptedData: string | null = null;
    let source: 'r2' | 'ipfs' = 'r2';

    if (asset.storage?.documentR2Key && env.VDC_STORAGE) {
      try {
        const r2Object = await env.VDC_STORAGE.get(asset.storage.documentR2Key);
        if (r2Object) {
          encryptedData = await r2Object.text();
          source = 'r2';
        }
      } catch (error) {
        console.warn(`Failed to fetch encrypted document from R2 for asset ${asset.id}`, error);
      }
    }

    if (!encryptedData) {
      const ipfsClient = new IPFSClient(env);
      const contentHash = asset.ipfsHash || asset.storage?.ipfsHash;
      if (contentHash) {
        encryptedData = await ipfsClient.retrieveFromIPFS(contentHash);
        source = 'ipfs';
      }
    }

    if (!encryptedData) {
      return c.json<APIResponse>({ success: false, error: 'Encrypted document could not be retrieved' }, 500);
    }

    return c.json<APIResponse>({ success: true, data: { encryptedData, source } });
  } catch (error) {
    console.error('Encrypted document retrieval error:', error);
    return c.json<APIResponse>({ success: false, error: 'Failed to retrieve encrypted document' }, 500);
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