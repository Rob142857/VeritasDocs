import { Hono } from 'hono';
import { Environment, Asset, SearchResult, APIResponse } from '../types';

const searchHandler = new Hono<{ Bindings: Environment }>();

// Search assets by various criteria
searchHandler.get('/', async (c) => {
  try {
    const env = c.env;
    const query = c.req.query('q') || '';
    const documentType = c.req.query('type');
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '20');

    // For simplicity, we'll do a basic search through KV store
    // In production, you'd want to use a proper search index
    const assets: Asset[] = [];
    
    // Get all asset keys (this is not efficient for large datasets)
    const list = await env.VERITAS_KV.list({ prefix: 'asset:' });
    
    for (const key of list.keys) {
      const assetData = await env.VERITAS_KV.get(key.name);
      if (assetData) {
        const asset: Asset = JSON.parse(assetData);
        
        // Only include publicly searchable assets
        if (!asset.isPubliclySearchable) {
          continue;
        }

        // Apply filters
        let matches = true;

        if (query) {
          const searchLower = query.toLowerCase();
          matches = matches && (
            asset.title.toLowerCase().includes(searchLower) ||
            asset.description.toLowerCase().includes(searchLower) ||
            asset.tokenId.toLowerCase().includes(searchLower)
          );
        }

        if (documentType && documentType !== 'all') {
          matches = matches && asset.documentType === documentType;
        }

        if (matches) {
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
          } as Asset);
        }
      }
    }

    // Sort by creation date (newest first)
    assets.sort((a, b) => b.createdAt - a.createdAt);

    // Paginate results
    const startIndex = (page - 1) * limit;
    const endIndex = startIndex + limit;
    const paginatedAssets = assets.slice(startIndex, endIndex);

    const searchResult: SearchResult = {
      assets: paginatedAssets,
      total: assets.length,
      page,
      limit,
    };

    return c.json<APIResponse>({
      success: true,
      data: searchResult,
    });
  } catch (error) {
    console.error('Error searching assets:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get asset provenance/ownership history
searchHandler.get('/provenance/:assetId', async (c) => {
  try {
    const env = c.env;
    const assetId = c.req.param('assetId');

    // Verify asset exists and is publicly searchable
    const assetData = await env.VERITAS_KV.get(`asset:${assetId}`);
    if (!assetData) {
      return c.json<APIResponse>({ success: false, error: 'Asset not found' }, 404);
    }

    const asset: Asset = JSON.parse(assetData);
    if (!asset.isPubliclySearchable) {
      return c.json<APIResponse>({ 
        success: false, 
        error: 'Asset provenance is not publicly available' 
      }, 403);
    }

    // In a real implementation, you'd query the blockchain for all transactions
    // related to this asset. For now, we'll return basic ownership information
    const provenance = [
      {
        event: 'created',
        timestamp: asset.createdAt,
        userId: asset.creatorId,
        details: {
          title: asset.title,
          documentType: asset.documentType,
        },
      },
    ];

    // If the current owner is different from creator, add transfer event
    if (asset.ownerId !== asset.creatorId) {
      provenance.push({
        event: 'transferred',
        timestamp: asset.updatedAt,
        userId: asset.ownerId,
        details: {
          from: asset.creatorId,
          to: asset.ownerId,
        } as any,
      });
    }

    return c.json<APIResponse>({
      success: true,
      data: {
        assetId,
        tokenId: asset.tokenId,
        provenance,
      },
    });
  } catch (error) {
    console.error('Error getting asset provenance:', error);
    return c.json<APIResponse>({ success: false, error: 'Internal server error' }, 500);
  }
});

// Get document types for filtering
searchHandler.get('/document-types', async (c) => {
  const documentTypes = [
    { value: 'will', label: 'Will' },
    { value: 'deed', label: 'Property Deed' },
    { value: 'certificate', label: 'Certificate' },
    { value: 'contract', label: 'Contract' },
    { value: 'other', label: 'Other' },
  ];

  return c.json<APIResponse>({
    success: true,
    data: documentTypes,
  });
});

export { searchHandler };