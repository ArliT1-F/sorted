// End-to-end encryption helpers. Everything runs in the browser (WebCrypto).
// A random 256-bit data key encrypts all records and files. That data key is
// stored on the server only in wrapped form: once wrapped with a key derived
// from the user's vault passphrase, once with a key derived from a one-time
// recovery code. The server never sees the passphrase, the code or the data key.

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const dec = new TextDecoder();

export const PBKDF2_ITERATIONS = 600_000;
export const RECOVERY_ITERATIONS = 100_000;

export function toB64(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const s = atob(b64);
  const u = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
  return u;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

async function deriveKek(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const base = await subtle.importKey("raw", enc.encode(secret.normalize("NFKC")), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export type Wrapped = { salt: string; iv: string; wrapped: string; iterations: number };

export async function wrapRawKey(raw: Uint8Array<ArrayBuffer>, secret: string, iterations: number): Promise<Wrapped> {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const kek = await deriveKek(secret, salt, iterations);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, kek, raw);
  return { salt: toB64(salt), iv: toB64(iv), wrapped: toB64(ct), iterations };
}

/** Returns the raw data key, or throws if the secret is wrong. */
export async function unwrapRawKey(w: Wrapped, secret: string): Promise<Uint8Array<ArrayBuffer>> {
  const kek = await deriveKek(secret, fromB64(w.salt), w.iterations);
  const raw = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(w.iv) }, kek, fromB64(w.wrapped));
  return new Uint8Array(raw);
}

export function newRawKey(): Uint8Array<ArrayBuffer> {
  return randomBytes(32);
}

export function importDataKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  return subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

/** Recovery code: 25 base32 characters in 5 groups (~125 bits). */
export function newRecoveryCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(25);
  const chars = Array.from(b, (x) => alphabet[x % 32]).join("");
  return chars.match(/.{5}/g)!.join("-");
}

export function normalizeRecoveryCode(code: string): string {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return c.match(/.{1,5}/g)?.join("-") ?? "";
}

export async function encryptJSON(key: CryptoKey, data: unknown): Promise<{ iv: string; ciphertext: string }> {
  const iv = randomBytes(12);
  const ct = await subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(JSON.stringify(data)));
  return { iv: toB64(iv), ciphertext: toB64(ct) };
}

export async function decryptJSON<T>(key: CryptoKey, iv: string, ciphertext: string): Promise<T> {
  const pt = await subtle.decrypt({ name: "AES-GCM", iv: fromB64(iv) }, key, fromB64(ciphertext));
  return JSON.parse(dec.decode(pt)) as T;
}

/** Output layout: 12-byte IV followed by ciphertext. */
export async function encryptBytes(key: CryptoKey, data: ArrayBuffer): Promise<Uint8Array<ArrayBuffer>> {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, data));
  const out = new Uint8Array(12 + ct.length);
  out.set(iv, 0);
  out.set(ct, 12);
  return out;
}

export async function decryptBytes(key: CryptoKey, data: ArrayBuffer): Promise<ArrayBuffer> {
  const u = new Uint8Array(data);
  return subtle.decrypt({ name: "AES-GCM", iv: u.slice(0, 12) }, key, u.slice(12));
}

/** Rough passphrase strength, 0-4. */
export function passphraseScore(p: string): number {
  if (p.length < 10) return 0;
  let s = 1;
  if (p.length >= 14) s++;
  if (p.length >= 20) s++;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/, /\s/].filter((r) => r.test(p)).length;
  if (kinds >= 3) s++;
  return Math.min(4, s);
}
