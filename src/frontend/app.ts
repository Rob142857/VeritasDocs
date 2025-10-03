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
  b64uDecode
} from '@maatara/core-pqc';

// TypeScript declarations for browser environment
declare const window: any;

// Initialize WASM with the bundled WASM file
let wasmInitialized = false;

async function ensureCryptoReady(): Promise<void> {
  if (wasmInitialized) return;
  
  try {
    // Initialize WASM with the URL to the WASM file
    const wasmUrl = '/static/core_pqc_wasm_bg.wasm';
    await initWasm(wasmUrl);
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
  
  // Step 3: Encrypt data with AES-256-GCM
  const dekB64u = b64uEncode(new TextEncoder().encode(data));
  const aadB64u = b64uEncode(new TextEncoder().encode('veritas-documents'));
  
  const aesResult = await (aesGcmWrap as any)(aesKey, dekB64u, aadB64u);
  if (aesResult.error) throw new Error(aesResult.error);
  
  // Return encrypted package
  return JSON.stringify({
    version: '1.0',
    algorithm: 'kyber768-aes256gcm',
    kem_ct: kemCt,
    iv: aesResult.iv_b64u,
    ciphertext: aesResult.ct_b64u
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
  
  // Decode decrypted data
  return new TextDecoder().decode(b64uDecode(aesResult.dek_b64u));
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
    
    return {
      kyberPublicKey: kyberResult.public_b64u,
      kyberPrivateKey: kyberResult.secret_b64u,
      dilithiumPublicKey: dilithiumResult.public_b64u,
      dilithiumPrivateKey: dilithiumResult.secret_b64u
    };
  } catch (error) {
    console.error('Key generation error:', error);
    throw error;
  }
}

// Sign data with Dilithium private key
export async function signData(data: string, dilithiumPrivateKey: string): Promise<string> {
  await ensureCryptoReady();
  
  const messageB64u = b64uEncode(new TextEncoder().encode(data));
  const signResult = await (dilithiumSign as any)(dilithiumPrivateKey, messageB64u);
  
  if (signResult.error) throw new Error(signResult.error);
  
  return signResult.signature_b64u;
}

// Verify signature with Dilithium public key
export async function verifySignature(data: string, signature: string, dilithiumPublicKey: string): Promise<boolean> {
  await ensureCryptoReady();
  
  const messageB64u = b64uEncode(new TextEncoder().encode(data));
  const verifyResult = await (dilithiumVerify as any)(dilithiumPublicKey, messageB64u, signature);
  
  if (verifyResult.error) return false;
  
  return verifyResult.valid === true;
}

// Make functions available globally for inline HTML usage
(window as any).VeritasCrypto = {
  encryptDocumentData,
  decryptDocumentData,
  generateClientKeypair,
  signData,
  verifySignature,
  ensureCryptoReady
};

console.log('Veritas Crypto module loaded');
