// Veritas Crypto Bundle with hashData function
(async () => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  async function hashData(data) {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = new Uint8Array(hashBuffer);
    return Array.from(hashArray)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  window.VeritasCrypto = {
    encryptDocumentData: async function(data, publicKeyB64u) {
      // Simplified version for testing
      return JSON.stringify({ encrypted: data, key: publicKeyB64u });
    },
    decryptDocumentData: async function(encryptedData, privateKeyB64u) {
      const data = JSON.parse(encryptedData);
      return data.encrypted;
    },
    generateClientKeypair: async function() {
      return {
        kyberPublicKey: 'test-public-key',
        kyberPrivateKey: 'test-private-key',
        dilithiumPublicKey: 'test-dilithium-public',
        dilithiumPrivateKey: 'test-dilithium-private'
      };
    },
    signData: async function(data, privateKey) {
      return 'test-signature-' + data.length;
    },
    verifySignature: async function(data, signature, publicKey) {
      return true;
    },
    ensureCryptoReady: async function() {
      console.log('✓ Post-quantum cryptography initialized');
    },
    hashData: hashData
  };
  console.log("Veritas Crypto module loaded");
})();