// IPFS utilities using Cloudflare IPFS Gateway for reading and Pinata for pinning
import { Environment } from '../types';

export class IPFSClient {
  private gatewayUrl: string;
  private pinataApiKey?: string;
  private pinataSecretKey?: string;

  constructor(env: Environment) {
    // Use Cloudflare's IPFS gateway for reading
    this.gatewayUrl = env.IPFS_GATEWAY_URL || 'https://cloudflare-ipfs.com';
    
    // Use Pinata for uploading/pinning if configured
    this.pinataApiKey = env.PINATA_API_KEY;
    this.pinataSecretKey = env.PINATA_SECRET_KEY;
  }

  /**
   * Upload data to IPFS via Pinata (pinning service)
   * Cloudflare gateway is read-only, so we use Pinata for uploads
   */
  async uploadToIPFS(data: string | Uint8Array): Promise<string> {
    try {
      if (!this.pinataApiKey || !this.pinataSecretKey) {
        throw new Error('Pinata API keys not configured. Please set PINATA_API_KEY and PINATA_SECRET_KEY environment variables.');
      }

      // Convert data to the format Pinata expects
      let content: any;
      if (typeof data === 'string') {
        // Try to parse as JSON first; if it fails, treat as plain text
        try {
          content = JSON.parse(data);
        } catch {
          // Not valid JSON, wrap it
          content = { data };
        }
      } else {
        // For binary data, we'd need to use pinFileToIPFS instead
        throw new Error('Binary file uploads not yet implemented. Use pinFileToIPFS for files.');
      }

      // Upload to IPFS using Pinata
      const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey,
        },
        body: JSON.stringify({
          pinataContent: content,
          pinataMetadata: {
            name: `veritas-block-${Date.now()}`,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Pinata upload failed:', response.status, errorText);
        throw new Error(`Pinata upload failed: ${response.status} ${errorText}`);
      }

      const result: { IpfsHash: string } = await response.json();
      console.log(`✅ IPFS upload successful: ${result.IpfsHash}`);
      return result.IpfsHash; // Return the IPFS hash
    } catch (error) {
      console.error('IPFS upload error:', error);
      throw new Error(`Failed to upload to IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve data from IPFS via Cloudflare gateway
   */
  async retrieveFromIPFS(hash: string): Promise<string> {
    try {
      const response = await fetch(`${this.gatewayUrl}/ipfs/${hash}`);
      
      if (!response.ok) {
        throw new Error(`IPFS retrieval failed: ${response.statusText}`);
      }

      return await response.text();
    } catch (error) {
      console.error('IPFS retrieval error:', error);
      throw new Error(`Failed to retrieve from IPFS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Pin content to ensure it stays available using Pinata
   */
  async pinToIPFS(hash: string): Promise<boolean> {
    try {
      if (!this.pinataApiKey || !this.pinataSecretKey) {
        console.warn('Pinata API keys not configured. Content will not be pinned.');
        return false;
      }

      // Pin the content using Pinata
      const response = await fetch(`https://api.pinata.cloud/pinning/pinByHash`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'pinata_api_key': this.pinataApiKey,
          'pinata_secret_api_key': this.pinataSecretKey,
        },
        body: JSON.stringify({
          hashToPin: hash,
          pinataMetadata: {
            name: `veritas-document-${Date.now()}`,
          },
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Pinata pinning failed: ${response.status} ${errorText}`);
        return false;
      }

      const result = await response.json();
      console.log(`Successfully pinned ${hash} to IPFS via Pinata`);
      return true;
    } catch (error) {
      console.error('IPFS pinning error:', error);
      return false;
    }
  }

  /**
   * Generate IPFS URL for public access
   */
  getIPFSUrl(hash: string): string {
    return `${this.gatewayUrl}/ipfs/${hash}`;
  }

  /**
   * Upload JSON metadata to IPFS
   */
  async uploadJSONToIPFS(jsonData: any): Promise<string> {
    const jsonString = JSON.stringify(jsonData, null, 2);
    return await this.uploadToIPFS(jsonString);
  }

  /**
   * Retrieve and parse JSON from IPFS
   */
  async retrieveJSONFromIPFS(hash: string): Promise<any> {
    const jsonString = await this.retrieveFromIPFS(hash);
    return JSON.parse(jsonString);
  }
}

/**
 * Create a content-addressed storage record
 * This combines IPFS hash with content metadata
 */
export interface IPFSRecord {
  hash: string;
  size: number;
  contentType: string;
  timestamp: number;
  isPinned: boolean;
  gatewayUrl: string;
}

/**
 * Helper function to create an IPFS record with metadata
 */
export async function createIPFSRecord(
  client: IPFSClient,
  content: string | Uint8Array,
  contentType: string = 'application/octet-stream'
): Promise<IPFSRecord> {
  const hash = await client.uploadToIPFS(content);
  const size = typeof content === 'string' ? new TextEncoder().encode(content).length : content.length;
  const isPinned = await client.pinToIPFS(hash);

  return {
    hash,
    size,
    contentType,
    timestamp: Date.now(),
    isPinned,
    gatewayUrl: client.getIPFSUrl(hash)
  };
}