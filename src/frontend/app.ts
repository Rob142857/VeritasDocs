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

// Make functions available globally for inline HTML usage
(window as any).VeritasCrypto = {
  encryptDocumentData,
  decryptDocumentData,
  generateClientKeypair,
  signData,
  verifySignature,
  ensureCryptoReady,
  hashData
};

console.log('Veritas Crypto module loaded');
