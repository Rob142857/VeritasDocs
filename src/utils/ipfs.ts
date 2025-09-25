// IPFS utilities using Cloudflare IPFS Gateway
import { Environment } from '../types';

export class IPFSClient {
  private gatewayUrl: string;

  constructor(env: Environment) {
    // Use Cloudflare's IPFS gateway
    this.gatewayUrl = 'https://cloudflare-ipfs.com';
  }

  /**
   * Upload data to IPFS via Cloudflare gateway
   * This uses the standard IPFS HTTP API compatible with Cloudflare
   */
  async uploadToIPFS(data: string | Uint8Array): Promise<string> {
    try {
      // Convert string to Uint8Array if needed
      const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
      
      // Create form data for IPFS upload
      const formData = new FormData();
      const blob = new Blob([dataBytes], { type: 'application/octet-stream' });
      formData.append('file', blob);

      // Upload to IPFS using Cloudflare's gateway API
      const response = await fetch(`${this.gatewayUrl}/api/v0/add`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`IPFS upload failed: ${response.statusText}`);
      }

      const result = await response.json() as { Hash: string };
      return result.Hash; // Return the IPFS hash
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
   * Pin content to ensure it stays available
   * This would typically require IPFS pinning service API
   */
  async pinToIPFS(hash: string): Promise<boolean> {
    try {
      // In a production setup, you'd use a pinning service like Pinata or Cloudflare's pinning
      // For now, we'll return true as a placeholder
      console.log(`Pinning ${hash} to IPFS`);
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