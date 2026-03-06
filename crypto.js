/**
 * Crypto Module - AES-256-GCM obfuscation for API keys
 * NOTE: This provides local obfuscation against casual data theft.
 * Since the Extension ID is public, this is NOT a replacement for
 * absolute security (like a user-defined Master Password).
 * Uses Web Crypto API with PBKDF2 key derivation from extension ID.
 */
const CryptoModule = (() => {
  const SALT = new Uint8Array([83, 65, 76, 84, 95, 65, 73, 95, 69, 88, 84, 95, 86, 49, 95, 75]);

  async function getEncryptionKey() {
    const extensionId = chrome.runtime?.id || 'ai-assistant-dev';
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      'raw',
      encoder.encode(extensionId),
      'PBKDF2',
      false,
      ['deriveKey']
    );
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: SALT, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  async function encrypt(plaintext) {
    const key = await getEncryptionKey();
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      encoder.encode(plaintext)
    );
    return {
      iv: Array.from(iv),
      ciphertext: Array.from(new Uint8Array(encrypted))
    };
  }

  async function decrypt({ iv, ciphertext }) {
    const key = await getEncryptionKey();
    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      key,
      new Uint8Array(ciphertext)
    );
    return new TextDecoder().decode(decrypted);
  }

  return { encrypt, decrypt };
})();
