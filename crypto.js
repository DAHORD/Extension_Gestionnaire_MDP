async function getKey(masterPassword, salt) {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(masterPassword),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

async function encryptData(masterPassword, data) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getKey(masterPassword, salt);
  const encoder = new TextEncoder();
  const encryptedContent = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    key,
    encoder.encode(data)
  );
  const encryptedBytes = new Uint8Array(encryptedContent);
  const result = new Uint8Array(salt.length + iv.length + encryptedBytes.length);
  result.set(salt, 0);
  result.set(iv, salt.length);
  result.set(encryptedBytes, salt.length + iv.length);
  return btoa(String.fromCharCode.apply(null, result));
}

async function decryptData(masterPassword, encryptedBase64) {
  try {
    const encryptedData = atob(encryptedBase64);
    const encryptedBytes = new Uint8Array(encryptedData.length).map((_, i) => encryptedData.charCodeAt(i));
    const salt = encryptedBytes.slice(0, 16);
    const iv = encryptedBytes.slice(16, 28);
    const data = encryptedBytes.slice(28);
    const key = await getKey(masterPassword, salt);
    const decryptedContent = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      data
    );
    const decoder = new TextDecoder();
    return decoder.decode(decryptedContent);
  } catch (e) {
    console.error("Déchiffrement échoué:", e);
    return null;
  }
}