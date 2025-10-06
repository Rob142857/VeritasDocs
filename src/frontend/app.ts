// Frontend application with Post-Quantum Cryptography
import {
  initWasm,
  kyberKeygen,
  kyberEncaps,
  kyberDecaps,
  dilithiumKeygen,
  dilithiumSign,
  dilithiumVerify,
  hkdfSha256,
  aesGcmWrap,
  aesGcmUnwrap,
  b64uEncode,
  b64uDecode,
  jcsCanonicalize
} from '@maatara/core-pqc';

// TypeScript declarations for browser environment
declare const window: any;

// Initialize WASM with the bundled WASM file
let wasmInitialized = false;

async function ensureCryptoReady(): Promise<void> {
  if (wasmInitialized) return;
  
  try {
    // Fetch the WASM file and pass it to initWasm
    const wasmUrl = '/static/core_pqc_wasm_bg.wasm';
    const wasmResponse = await fetch(wasmUrl);
    
    if (!wasmResponse.ok) {
      throw new Error(`Failed to fetch WASM file: ${wasmResponse.statusText}`);
    }
    
    // Pass the Response object directly to initWasm
    await initWasm(wasmResponse);
    wasmInitialized = true;
    console.log('✓ Post-quantum cryptography initialized');
  } catch (error) {
    console.error('Failed to initialize WASM:', error);
    throw new Error('Cryptography initialization failed');
  }
}

// Client-side encryption using Post-Quantum Cryptography
export async function encryptDocumentData(data: string, publicKeyB64u: string): Promise<string> {
  await ensureCryptoReady();
  
  // Optional gzip compression before encryption (smaller blocks/payloads)
  async function gzipCompress(bytes: Uint8Array): Promise<Uint8Array> {
    // Use CompressionStream if available; otherwise, return original
    try {
      // @ts-ignore - CompressionStream is a browser API
      if (typeof (window as any).CompressionStream === 'function') {
        // @ts-ignore
        const cs = new (window as any).CompressionStream('gzip');
        const body = new Response(bytes as any).body as ReadableStream<Uint8Array>;
        const stream = body.pipeThrough(cs);
        const compressed = await new Response(stream).arrayBuffer();
        return new Uint8Array(compressed);
      }
    } catch {}
    return bytes;
  }
  
  // Step 1: Encapsulate shared secret using Kyber-768
  const encapsResult = await (kyberEncaps as any)(publicKeyB64u);
  if (encapsResult.error) throw new Error(encapsResult.error);
  
  const sharedSecret = encapsResult.shared_b64u;
  const kemCt = encapsResult.kem_ct_b64u;
  
  // Step 2: Derive AES key from shared secret using HKDF
  const infoB64u = b64uEncode(new TextEncoder().encode('veritas-aes'));
  const kdfResult = await (hkdfSha256 as any)(sharedSecret, infoB64u, '', 32);
  if (kdfResult.error) throw new Error(kdfResult.error);
  
  const aesKey = kdfResult.key_b64u;
  
  // Step 3: Optional compression, then encrypt data with AES-256-GCM
  const rawBytes = new TextEncoder().encode(data);
  const compressedBytes = await gzipCompress(rawBytes);
  const usedCompression = compressedBytes !== undefined && compressedBytes.length < rawBytes.length ? 'gzip' : 'none';
  const dekB64u = b64uEncode(usedCompression === 'gzip' ? compressedBytes : rawBytes);
  const aadB64u = b64uEncode(new TextEncoder().encode('veritas-documents'));
  
  const aesResult = await (aesGcmWrap as any)(aesKey, dekB64u, aadB64u);
  if (aesResult.error) throw new Error(aesResult.error);
  
  // Return encrypted package
  return JSON.stringify({
    version: '1.0',
    algorithm: 'kyber768-aes256gcm',
    kem_ct: kemCt,
    iv: aesResult.iv_b64u,
    ciphertext: aesResult.ct_b64u,
    compression: usedCompression
  });
}

// Client-side decryption using Post-Quantum Cryptography
export async function decryptDocumentData(encryptedData: string, privateKeyB64u: string): Promise<string> {
  await ensureCryptoReady();
  
  const encData = JSON.parse(encryptedData);
  
  // Step 1: Decapsulate shared secret using Kyber-768
  const decapsResult = await (kyberDecaps as any)(privateKeyB64u, encData.kem_ct);
  if (decapsResult.error) throw new Error(decapsResult.error);
  
  const sharedSecret = decapsResult.shared_b64u;
  
  // Step 2: Derive AES key from shared secret
  const infoB64u = b64uEncode(new TextEncoder().encode('veritas-aes'));
  const kdfResult = await (hkdfSha256 as any)(sharedSecret, infoB64u, '', 32);
  if (kdfResult.error) throw new Error(kdfResult.error);
  
  const aesKey = kdfResult.key_b64u;
  
  // Step 3: Decrypt data with AES-256-GCM
  const aadB64u = b64uEncode(new TextEncoder().encode('veritas-documents'));
  
  const aesResult = await (aesGcmUnwrap as any)(aesKey, encData.iv, encData.ciphertext, aadB64u);
  if (aesResult.error) throw new Error(aesResult.error);
  
  // Optional decompression after decryption
  async function gzipDecompress(bytes: Uint8Array): Promise<Uint8Array> {
    try {
      // @ts-ignore - DecompressionStream is a browser API
      if (typeof (window as any).DecompressionStream === 'function') {
        // @ts-ignore
        const ds = new (window as any).DecompressionStream('gzip');
        const body = new Response(bytes as any).body as ReadableStream<Uint8Array>;
        const stream = body.pipeThrough(ds);
        const decompressed = await new Response(stream).arrayBuffer();
        return new Uint8Array(decompressed);
      }
    } catch {}
    return bytes;
  }
  
  const decryptedBytes = b64uDecode(aesResult.dek_b64u);
  const needsDecompress = encData && encData.compression === 'gzip';
  const outputBytes = needsDecompress ? await gzipDecompress(decryptedBytes) : decryptedBytes;
  
  // Decode to string
  return new TextDecoder().decode(outputBytes);
}

// Generate client-side keypair (both Kyber for encryption and Dilithium for signing)
export async function generateClientKeypair(): Promise<{ 
  kyberPublicKey: string; 
  kyberPrivateKey: string;
  dilithiumPublicKey: string;
  dilithiumPrivateKey: string;
}> {
  await ensureCryptoReady();
  
  try {
    // Generate Kyber-768 keypair for encryption
    const kyberResult = await (kyberKeygen as any)();
    console.log('Kyber keygen result:', kyberResult);
    
    if (kyberResult.error) throw new Error(kyberResult.error);
    
    // Generate Dilithium-2 keypair for signing
    const dilithiumResult = await (dilithiumKeygen as any)();
    console.log('Dilithium keygen result:', dilithiumResult);
    
    if (dilithiumResult.error) throw new Error(dilithiumResult.error);
    
    // Test the Dilithium keys immediately
    console.log('Testing Dilithium keys...');
    const testMessage = 'test message for dilithium';
    const testMessageB64u = b64uEncode(new TextEncoder().encode(testMessage));
    
    try {
      // Dilithium functions expect base64url STRINGS, not bytes!
      const testSignResult = await (dilithiumSign as any)(testMessageB64u, dilithiumResult.secret_b64u);
      console.log('Dilithium test sign result:', testSignResult);
      
      if (testSignResult.error) {
        console.error('Dilithium test sign failed:', testSignResult.error);
        throw new Error('Dilithium key test failed: ' + testSignResult.error);
      }
      
      // Test verification - also expects base64url strings
      const testVerifyResult = await (dilithiumVerify as any)(testMessageB64u, testSignResult.signature_b64u, dilithiumResult.public_b64u);
      console.log('Dilithium test verify result:', testVerifyResult);
      
      if (testVerifyResult.error || !testVerifyResult.is_valid) {
        console.error('Dilithium test verify failed:', testVerifyResult);
        throw new Error('Dilithium key verification test failed');
      }
      
      console.log('✓ Dilithium keys tested successfully');
    } catch (testError) {
      console.error('Dilithium key test error:', testError);
      throw new Error('Generated Dilithium keys are invalid: ' + (testError as Error).message);
    }
    
    return {
      kyberPublicKey: kyberResult.public_b64u,
      kyberPrivateKey: kyberResult.secret_b64u,
      dilithiumPublicKey: dilithiumResult.public_b64u,
      // Store ONLY the secret_b64u string, just like Kyber
      dilithiumPrivateKey: dilithiumResult.secret_b64u
    };
  } catch (error) {
    console.error('Key generation error:', error);
    throw error;
  }
}

// Sign data with Dilithium private key
export async function signData(data: string, dilithiumSecretB64u: string): Promise<string> {
  await ensureCryptoReady();
  
  // Encode the message to base64url
  const messageB64u = b64uEncode(new TextEncoder().encode(data));
  
  console.log('Attempting to sign with Dilithium...');
  console.log('Secret key b64u length:', dilithiumSecretB64u.length);
  console.log('Message b64u length:', messageB64u.length);
  console.log('Data preview:', data.substring(0, 100));
  
  // IMPORTANT: dilithiumSign expects base64url STRINGS, not bytes!
  // The Ma'atara library handles conversion internally
  const signResult = await (dilithiumSign as any)(messageB64u, dilithiumSecretB64u);
  
  console.log('Sign result:', signResult);
  
  if (signResult.error) {
    console.error('Dilithium sign error:', signResult.error);
    throw new Error(signResult.error);
  }
  
  return signResult.signature_b64u;
}

// Verify signature with Dilithium public key
export async function verifySignature(data: string, signature: string, dilithiumPublicKey: string): Promise<boolean> {
  await ensureCryptoReady();
  
  const messageB64u = b64uEncode(new TextEncoder().encode(data));
  
  // IMPORTANT: dilithiumVerify expects base64url STRINGS, not bytes!
  const verifyResult = await (dilithiumVerify as any)(messageB64u, signature, dilithiumPublicKey);
  
  if (verifyResult.error) return false;
  
  return verifyResult.is_valid === true;
}

// Hash data with SHA-256 (for document integrity checking)
export async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = new Uint8Array(hashBuffer);
  return Array.from(hashArray)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

// ============================================================================
// KEYPACK UTILITIES - Passphrase-protected key storage
// ============================================================================

export interface Keypack {
  version: string;
  email: string;
  timestamp: number;
  keyType: string;
  keys: {
    kyber: {
      public: string;
      private: string;
    };
    dilithium: {
      public: string;
      private: string;
    };
  };
}

// Generate 12-word BIP39 passphrase
export async function generatePassphrase(): Promise<string> {
  // Use simple wordlist for demo (in production, use full BIP39 wordlist)
  const words = [
    'abandon', 'ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 
    'absurd', 'abuse', 'access', 'accident', 'account', 'accuse', 'achieve', 'acid',
    'acoustic', 'acquire', 'across', 'act', 'action', 'actor', 'actress', 'actual',
    'adapt', 'add', 'addict', 'address', 'adjust', 'admit', 'adult', 'advance',
    'advice', 'aerobic', 'affair', 'afford', 'afraid', 'again', 'age', 'agent',
    'agree', 'ahead', 'aim', 'air', 'airport', 'aisle', 'alarm', 'album',
    'alcohol', 'alert', 'alien', 'all', 'alley', 'allow', 'almost', 'alone',
    'alpha', 'already', 'also', 'alter', 'always', 'amateur', 'amazing', 'among',
    'amount', 'amused', 'analyst', 'anchor', 'ancient', 'anger', 'angle', 'angry',
    'animal', 'ankle', 'announce', 'annual', 'another', 'answer', 'antenna', 'antique',
    'anxiety', 'any', 'apart', 'apology', 'appear', 'apple', 'approve', 'april',
    'arch', 'arctic', 'area', 'arena', 'argue', 'arm', 'armed', 'armor',
    'army', 'around', 'arrange', 'arrest', 'arrive', 'arrow', 'art', 'artefact',
    'artist', 'artwork', 'ask', 'aspect', 'assault', 'asset', 'assist', 'assume',
    'asthma', 'athlete', 'atom', 'attack', 'attend', 'attitude', 'attract', 'auction',
    'audit', 'august', 'aunt', 'author', 'auto', 'autumn', 'average', 'avocado',
    'avoid', 'awake', 'aware', 'away', 'awesome', 'awful', 'awkward', 'axis',
    'baby', 'bachelor', 'bacon', 'badge', 'bag', 'balance', 'balcony', 'ball',
    'bamboo', 'banana', 'banner', 'bar', 'barely', 'bargain', 'barrel', 'base'
  ];
  
  const mnemonic = [];
  const randomBytes = new Uint8Array(16); // 128 bits for 12 words
  crypto.getRandomValues(randomBytes);
  
  for (let i = 0; i < 12; i++) {
    const randomIndex = randomBytes[i] % words.length;
    mnemonic.push(words[randomIndex]);
  }
  
  return mnemonic.join(' ');
}

// Derive AES-256 key from passphrase using PBKDF2
export async function deriveKeyFromPassphrase(
  passphrase: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const passphraseBytes = encoder.encode(passphrase);
  
  // Import passphrase as base key
  const baseKey = await crypto.subtle.importKey(
    'raw',
    passphraseBytes,
    'PBKDF2',
    false,
    ['deriveKey']
  );
  
  // Derive AES-256-GCM key using PBKDF2 (100k iterations)
  const aesKey = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt as BufferSource,
      iterations: 100000, // High iteration count for security
      hash: 'SHA-256'
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  
  return aesKey;
}

// Encrypt keypack with passphrase
export async function encryptKeypack(
  keypack: Keypack,
  passphrase: string
): Promise<{salt: string; iv: string; ciphertext: string}> {
  await ensureCryptoReady();
  
  // Generate random salt (16 bytes)
  const salt = crypto.getRandomValues(new Uint8Array(16));
  
  // Derive AES key from passphrase
  const aesKey = await deriveKeyFromPassphrase(passphrase, salt);
  
  // Serialize keypack to JSON
  const keypackJson = JSON.stringify(keypack);
  const plaintext = new TextEncoder().encode(keypackJson);
  
  // Generate random IV (12 bytes for GCM)
  const iv = crypto.getRandomValues(new Uint8Array(12));
  
  // Encrypt with AES-256-GCM
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv: iv as BufferSource,
      tagLength: 128 // 128-bit auth tag
    },
    aesKey,
    plaintext
  );
  
  return {
    salt: b64uEncode(salt),
    iv: b64uEncode(iv),
    ciphertext: b64uEncode(new Uint8Array(ciphertext))
  };
}

// Decrypt keypack with passphrase
export async function decryptKeypack(
  encrypted: {salt: string; iv: string; ciphertext: string},
  passphrase: string
): Promise<Keypack> {
  await ensureCryptoReady();
  
  try {
    // Decode salt and IV
    const salt = b64uDecode(encrypted.salt);
    const iv = b64uDecode(encrypted.iv);
    const ciphertext = b64uDecode(encrypted.ciphertext);
    
    console.log('Decrypting keypack:', {
      saltLength: salt.byteLength,
      ivLength: iv.byteLength,
      ciphertextLength: ciphertext.byteLength
    });
    
    // Derive AES key from passphrase
    const aesKey = await deriveKeyFromPassphrase(passphrase, salt);
    
    // Decrypt with AES-256-GCM
    const plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv as BufferSource,
        tagLength: 128
      },
      aesKey,
      ciphertext as BufferSource
    );
    
    // Decode and parse keypack
    const keypackJson = new TextDecoder().decode(plaintext);
    console.log('Keypack decrypted successfully');
    return JSON.parse(keypackJson) as Keypack;
  } catch (error) {
    console.error('Keypack decryption failed:', error);
    throw new Error('Incorrect passphrase or corrupted keypack file');
  }
}

// Download keypack as .keypack file
export function downloadKeypack(
  email: string,
  encrypted: {salt: string; iv: string; ciphertext: string}
): void {
  const keypackData = {
    format: 'veritas-keypack-v1',
    created: new Date().toISOString(),
    email: email,
    encrypted: encrypted
  };
  
  const blob = new Blob([JSON.stringify(keypackData, null, 2)], {
    type: 'application/octet-stream'
  });
  
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `veritas-${email.replace('@', '-at-').replace(/[^a-z0-9-]/gi, '')}.keypack`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Make functions available globally for inline HTML usage
(window as any).VeritasCrypto = {
  encryptDocumentData,
  decryptDocumentData,
  generateClientKeypair,
  signData,
  verifySignature,
  ensureCryptoReady,
  hashData,
  // New keypack functions
  generatePassphrase,
  encryptKeypack,
  decryptKeypack,
  downloadKeypack
};

console.log('Veritas Crypto module loaded');
