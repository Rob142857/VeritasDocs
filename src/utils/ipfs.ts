// IPFS utilities using Cloudflare IPFS Gateway for reading and Pinata for pinning
import { Environment } from '../types';

export class IPFSClient {
  private gatewayUrl: string;
  private pinataGatewayUrl?: string;
  private pinataApiKey?: string;
  private pinataSecretKey?: string;
  private cloudflarePathGateways: string[];
  private cloudflareSubdomainHosts: string[];

  constructor(env: Environment) {
    // Use Cloudflare's IPFS gateway for reading by default; allow override
    this.gatewayUrl = env.IPFS_GATEWAY_URL || 'https://cloudflare-ipfs.com';
    // If a dedicated Pinata gateway is configured, remember it for reads
    this.pinataGatewayUrl = env.PINATA_GATEWAY_URL;
    // Known Cloudflare IPFS path gateways to try for warming
    this.cloudflarePathGateways = [
      'https://cloudflare-ipfs.com',
      'https://cf-ipfs.com'
    ];
    // Subdomain-style gateways sometimes succeed sooner on CF
    this.cloudflareSubdomainHosts = [
      'ipfs.cf-ipfs.com',
      'ipfs.cloudflare-ipfs.com'
    ];
    
    // Use Pinata for uploading/pinning if configured
    this.pinataApiKey = env.PINATA_API_KEY;
    this.pinataSecretKey = env.PINATA_SECRET_KEY;
  }

  /**
   * Upload data to IPFS via Pinata (pinning service)
   * Cloudflare gateway is read-only, so we use Pinata for uploads
   */
  async uploadToIPFS(data: string | Uint8Array, options?: { name?: string }): Promise<string> {
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
            name: (options?.name || `veritas-object-${Date.now()}`),
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
      // Try preferred gateway first (Cloudflare or configured), then fall back to Pinata gateway if provided
      let response = await fetch(`${this.gatewayUrl}/ipfs/${hash}`);
      if (!response.ok && this.pinataGatewayUrl) {
        response = await fetch(`${this.pinataGatewayUrl}/ipfs/${hash}`);
      }
      
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
   * Generate IPFS URL using Pinata gateway if available
   */
  getPinataIPFSUrl(hash: string): string | null {
    return this.pinataGatewayUrl ? `${this.pinataGatewayUrl}/ipfs/${hash}` : null;
  }

  /**
   * Attempt to warm a specific gateway by fetching the content.
   * This helps public gateways discover and cache content pinned on Pinata.
   */
  async warmGateway(hash: string, which: 'cloudflare' | 'pinata', timeoutMs: number = 5000): Promise<boolean> {
    try {
      if (which === 'pinata') {
        const url = this.getPinataIPFSUrl(hash) || this.getIPFSUrl(hash);
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort('timeout'), timeoutMs);
        const resp = await fetch(url + `?warm=${Date.now()}`, { signal: controller.signal, method: 'GET' });
        clearTimeout(t);
        return resp.ok;
      }
      // For Cloudflare, use robust multi-attempt warm
  const result = await this.warmCloudflareRobust(hash, { timeoutMs });
      return result.ok;
    } catch (e) {
      return false;
    }
  }

  /**
   * Warm both gateways (non-fatal). Returns status for each.
   */
  async warmGateways(hash: string, timeoutMs: number = 5000): Promise<{ cloudflare: boolean; pinata: boolean; }> {
    const [cfOk, piOk] = await Promise.all([
      this.warmGateway(hash, 'cloudflare', timeoutMs).catch(() => false),
      this.warmGateway(hash, 'pinata', timeoutMs).catch(() => false)
    ]);
    return { cloudflare: cfOk, pinata: piOk };
  }

  /**
   * Robust Cloudflare warm: optionally prime via Pinata, then try multiple Cloudflare gateways
   * with retries and backoff. Returns detailed attempt log.
   */
  async warmCloudflareRobust(
    hash: string,
    opts?: { retries?: number; timeoutMs?: number; backoffMs?: number; primeWithPinata?: boolean }
  ): Promise<{ ok: boolean; attempts: Array<{ url: string; ok: boolean; status?: number; method?: string }>; primedPinata: boolean }>
  {
    // Slightly more patient defaults to give CF time to fetch from IPFS providers
    const retries = Math.max(1, Math.min(5, opts?.retries ?? 4));
    const timeoutMs = Math.max(1000, Math.min(20000, opts?.timeoutMs ?? 8000));
    const backoffMs = Math.max(250, Math.min(5000, opts?.backoffMs ?? 1200));
    const primeWithPinata = opts?.primeWithPinata ?? true;

  const attempts: Array<{ url: string; ok: boolean; status?: number; method?: string }> = [];
    let primedPinata = false;

    // Step 1: prime pinata (best-effort)
    if (primeWithPinata && this.pinataGatewayUrl) {
      try {
        const controller = new AbortController();
        const t = setTimeout(() => controller.abort('timeout'), Math.min(4000, timeoutMs));
        const piUrl = `${this.pinataGatewayUrl}/ipfs/${hash}?warm=${Date.now()}`;
        const r = await fetch(piUrl, { signal: controller.signal, method: 'GET', headers: { 'Accept': '*/*' } });
        clearTimeout(t);
        primedPinata = r.ok;
        attempts.push({ url: piUrl, ok: r.ok, status: r.status, method: 'GET' });
      } catch {
        attempts.push({ url: `${this.pinataGatewayUrl}/ipfs/${hash}`, ok: false, method: 'GET' });
      }
    }

    // Also try to prime via ipfs.io (helps propagation in the network)
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort('timeout'), Math.min(6000, timeoutMs));
      const ipfsIoUrl = `https://ipfs.io/ipfs/${hash}?warm=${Date.now()}`;
      const r = await fetch(ipfsIoUrl, { signal: controller.signal, method: 'GET', headers: { 'Accept': '*/*', 'Range': 'bytes=0-0' } });
      clearTimeout(t);
      attempts.push({ url: ipfsIoUrl, ok: r.ok, status: r.status, method: 'GET' });
    } catch {
      attempts.push({ url: `https://ipfs.io/ipfs/${hash}`, ok: false, method: 'GET' });
    }

    // Prime via dweb.link (common public gateway)
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort('timeout'), Math.min(6000, timeoutMs));
      const dwebUrl = `https://dweb.link/ipfs/${hash}?warm=${Date.now()}`;
      const r = await fetch(dwebUrl, { signal: controller.signal, method: 'GET', headers: { 'Accept': '*/*', 'Range': 'bytes=0-0' } });
      clearTimeout(t);
      attempts.push({ url: dwebUrl, ok: r.ok, status: r.status, method: 'GET' });
    } catch {
      attempts.push({ url: `https://dweb.link/ipfs/${hash}`, ok: false, method: 'GET' });
    }

    // Prime via Pinata public gateway as well (in addition to the private subdomain)
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort('timeout'), Math.min(6000, timeoutMs));
      const pinataPubUrl = `https://gateway.pinata.cloud/ipfs/${hash}?warm=${Date.now()}`;
      const r = await fetch(pinataPubUrl, { signal: controller.signal, method: 'GET', headers: { 'Accept': '*/*', 'Range': 'bytes=0-0' } });
      clearTimeout(t);
      attempts.push({ url: pinataPubUrl, ok: r.ok, status: r.status, method: 'GET' });
    } catch {
      attempts.push({ url: `https://gateway.pinata.cloud/ipfs/${hash}`, ok: false, method: 'GET' });
    }

    // Step 2: try Cloudflare subdomain and path gateways with retries
    for (let i = 0; i < retries; i++) {
      // Subdomain style: https://<cid>.ipfs.cf-ipfs.com/ (note: do NOT duplicate 'ipfs')
      for (const host of this.cloudflareSubdomainHosts) {
        const url = `https://${hash}.${host}/?warm=${Date.now()}`;
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort('timeout'), timeoutMs);
          let headResp: Response | null = null;
          try {
            headResp = await fetch(url, { signal: controller.signal, method: 'HEAD', headers: { 'Accept': '*/*' } });
            attempts.push({ url, ok: headResp.ok, status: headResp.status, method: 'HEAD' });
          } catch {
            // ignore head failure
          }
          if (headResp && headResp.ok) {
            clearTimeout(t);
            return { ok: true, attempts, primedPinata };
          }
          const r = await fetch(url, { signal: controller.signal, method: 'GET', headers: { 'Accept': '*/*', 'Range': 'bytes=0-0' } });
          clearTimeout(t);
          attempts.push({ url, ok: r.ok, status: r.status, method: 'GET' });
          if (r.ok) {
            return { ok: true, attempts, primedPinata };
          }
        } catch {
          attempts.push({ url, ok: false, method: 'GET' });
        }
      }

      for (const base of this.cloudflarePathGateways) {
        const url = `${base}/ipfs/${hash}?warm=${Date.now()}`;
        try {
          const controller = new AbortController();
          const t = setTimeout(() => controller.abort('timeout'), timeoutMs);
          // Try a lightweight HEAD first (some gateways support this), fallback to GET
          let headResp: Response | null = null;
          try {
            headResp = await fetch(url, { signal: controller.signal, method: 'HEAD', headers: { 'Accept': '*/*' } });
            attempts.push({ url, ok: headResp.ok, status: headResp.status, method: 'HEAD' });
          } catch {
            // ignore head failure; fall back to GET
          }
          if (headResp && headResp.ok) {
            clearTimeout(t);
            return { ok: true, attempts, primedPinata };
          }
          // Fallback GET with a 0-0 Range to hint minimal transfer
          const r = await fetch(url, { signal: controller.signal, method: 'GET', headers: { 'Accept': '*/*', 'Range': 'bytes=0-0' } });
          clearTimeout(t);
          attempts.push({ url, ok: r.ok, status: r.status, method: 'GET' });
          if (r.ok) {
            return { ok: true, attempts, primedPinata };
          }
        } catch {
          attempts.push({ url, ok: false, method: 'GET' });
        }
      }
      // backoff
      await new Promise(res => setTimeout(res, backoffMs * (i + 1)));
    }

    return { ok: false, attempts, primedPinata };
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
  contentType: string = 'application/octet-stream',
  pinName?: string
): Promise<IPFSRecord> {
  // Choose a descriptive name for Pinata metadata based on content type, allow override
  const label = pinName || (contentType.includes('json') ? `veritas-json-${Date.now()}` : `veritas-document-${Date.now()}`);
  const hash = await client.uploadToIPFS(content, { name: label });
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