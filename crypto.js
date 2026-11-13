// Folio v2 — attachment encryption. A random data key encrypts every file (AES-GCM).
// The data key is wrapped twice: by the passphrase and by a recovery code (PBKDF2 → AES-KW).
const te = new TextEncoder();
const ITER = 600000;
export const b64 = u8 => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };
export const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));

async function kek(secret, salt, iter) {
  const base = await crypto.subtle.importKey('raw', te.encode(secret.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-KW', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
const normCode = c => c.toUpperCase().replace(/[^A-Z2-7]/g, '');

export function makeRecoveryCode() {
  const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567', r = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(r, b => A[b % 32]).join('').match(/.{4}/g).join('-');
}

/** Create a data key. Returns { meta, key, recoveryCode } — meta goes into workspace.json. */
export async function setupKeys(passphrase, iter = ITER) {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const recoveryCode = makeRecoveryCode();
  const meta = await wrapAll(key, passphrase, recoveryCode, iter);
  return { meta, key, recoveryCode };
}
async function wrapAll(key, passphrase, code, iter) {
  const s1 = crypto.getRandomValues(new Uint8Array(16)), s2 = crypto.getRandomValues(new Uint8Array(16));
  const byPass = new Uint8Array(await crypto.subtle.wrapKey('raw', key, await kek(passphrase, s1, iter), 'AES-KW'));
  const byRecovery = new Uint8Array(await crypto.subtle.wrapKey('raw', key, await kek(normCode(code), s2, iter), 'AES-KW'));
  return { v: 1, iter, s1: b64(s1), s2: b64(s2), byPass: b64(byPass), byRecovery: b64(byRecovery) };
}
async function unwrap(wrapped, secret, salt, iter) {
  return crypto.subtle.unwrapKey('raw', unb64(wrapped), await kek(secret, unb64(salt), iter), 'AES-KW', { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
/** Unlock with the passphrase or the recovery code. Throws on a wrong secret. */
export async function unlockKeys(meta, secret) {
  try { return await unwrap(meta.byPass, secret, meta.s1, meta.iter); } catch {}
  try { return await unwrap(meta.byRecovery, normCode(secret), meta.s2, meta.iter); } catch {}
  throw new Error('Wrong passphrase or recovery code');
}
/** New passphrase (and new recovery code) without re-encrypting any file. */
export async function changePassphrase(key, newPass, iter = ITER) {
  const recoveryCode = makeRecoveryCode();
  return { meta: await wrapAll(key, newPass, recoveryCode, iter), recoveryCode };
}
export async function encryptBlob(key, bytes) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
  const out = new Uint8Array(12 + ct.length); out.set(iv); out.set(ct, 12); return out;
}
export async function decryptBlob(key, data) {
  data = data instanceof Uint8Array ? data : new Uint8Array(data);
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: data.subarray(0, 12) }, key, data.subarray(12)));
}

// PIN: PBKDF2 hash, never stored in plain text.
export async function hashPin(pin, saltB64) {
  const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
  const base = await crypto.subtle.importKey('raw', te.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' }, base, 256));
  return { salt: b64(salt), hash: b64(bits) };
}
