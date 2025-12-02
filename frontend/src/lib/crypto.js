export const buf2hex = (buffer) => 
  [...new Uint8Array(buffer)].map(x => x.toString(16).padStart(2, '0')).join('');

export const hex2buf = (hexString) => 
  new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

const pemToArrayBuffer = (pem) => {
  const b64Lines = pem.replace(/-----BEGIN [^-]+-----/, '').replace(/-----END [^-]+-----/, '').replace(/[\n\r]/g, '');
  const str = window.atob(b64Lines);
  const buf = new ArrayBuffer(str.length);
  const bufView = new Uint8Array(buf);
  for (let i = 0, strLen = str.length; i < strLen; i++) bufView[i] = str.charCodeAt(i);
  return buf;
};

const arrayBufferToPem = (buffer, type) => {
  const binary = String.fromCharCode(...new Uint8Array(buffer));
  const b64 = window.btoa(binary);
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----`;
};

export const cryptoService = {
  generateAESKey: async () => window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
  ),
  encryptData: async (aesKey, text) => {
    const encoder = new TextEncoder();
    const dataEncoded = encoder.encode(text);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encryptedBuffer = await window.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv }, aesKey, dataEncoded
    );
    return { cipher: buf2hex(encryptedBuffer), iv: buf2hex(iv) };
  },
  decryptData: async (aesKey, cipherHex, ivHex) => {
    const cipher = hex2buf(cipherHex);
    const iv = hex2buf(ivHex);
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv }, aesKey, cipher
    );
    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  },
  generateUserKeyPair: async () => {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
      true, ["encrypt", "decrypt"]
    );
    const pubBuffer = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const privBuffer = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);
    return {
      publicKey: keyPair.publicKey,
      privateKey: keyPair.privateKey,
      publicKeyPem: arrayBufferToPem(pubBuffer, "PUBLIC KEY"),
      privateKeyPem: arrayBufferToPem(privBuffer, "PRIVATE KEY")
    };
  },
  importPrivateKey: async (pem) => {
    const binaryDer = pemToArrayBuffer(pem);
    return window.crypto.subtle.importKey("pkcs8", binaryDer, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["decrypt"]);
  },
  wrapKeyWithRSA: async (pemOrKey, aesKey) => {
    let rsaKey = pemOrKey;
    if (typeof pemOrKey === 'string') {
      const rsaKeyData = pemToArrayBuffer(pemOrKey);
      rsaKey = await window.crypto.subtle.importKey("spki", rsaKeyData, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
    }
    const rawAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
    const encryptedKeyBuffer = await window.crypto.subtle.encrypt({ name: "RSA-OAEP" }, rsaKey, rawAesKey);
    return buf2hex(encryptedKeyBuffer);
  },
  unwrapKeyWithRSA: async (privateKey, encryptedAesHex) => {
    const encryptedBytes = hex2buf(encryptedAesHex);
    const rawKeyBuffer = await window.crypto.subtle.decrypt({ name: "RSA-OAEP" }, privateKey, encryptedBytes);
    return window.crypto.subtle.importKey("raw", rawKeyBuffer, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
  },
  deriveKeyFromPassword: async (password, saltHex = "123456789012345678901234") => {
    const enc = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey("raw", enc.encode(password), { name: "PBKDF2" }, false, ["deriveKey"]);
    const salt = new TextEncoder().encode(saltHex);
    return window.crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]
    );
  }
};