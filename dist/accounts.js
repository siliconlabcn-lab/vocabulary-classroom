const registeredPrefix = 'vocabulary-classroom-registered-v1:';
const kdfIterations = 600000;
const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

export function accountName(value) {
  return value.normalize('NFKC').trim().replace(/\s+/gu, ' ');
}

export function registeredKey(name) {
  return registeredPrefix + name.toLowerCase();
}

export function validAccountName(name) {
  return name.length > 0 && name.length <= 60 && !/[\p{Cc}\p{Cf}]/u.test(name);
}

async function derivePassword(password, salt) {
  if (!globalThis.crypto?.subtle) throw new Error('Password verification is unavailable');
  const bytes = Uint8Array.from(salt.match(/../g), byte => parseInt(byte, 16));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const result = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: bytes, iterations: kdfIterations, hash: 'SHA-256' }, key, 256,
  );
  return hex(new Uint8Array(result));
}

export async function createCredentials(password) {
  const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
  return { salt, verifier: await derivePassword(password, salt) };
}

export async function verifyPassword(password, credentials) {
  const { salt, verifier } = credentials;
  if (!/^[0-9a-f]{32}$/.test(salt) || !/^[0-9a-f]{64}$/.test(verifier)) return false;
  const candidate = await derivePassword(password, salt);
  let difference = 0;
  for (let i = 0; i < verifier.length; i++) difference |= candidate.charCodeAt(i) ^ verifier.charCodeAt(i);
  return difference === 0;
}
