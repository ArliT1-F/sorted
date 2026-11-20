"use client";
import * as C from "./crypto";
import { supabase, BUCKET } from "./supabase";

export type VaultKeyRow = {
  user_id: string;
  salt: string;
  iv: string;
  wrapped_key: string;
  iterations: number;
  recovery_salt: string;
  recovery_iv: string;
  recovery_wrapped_key: string;
  recovery_iterations: number;
};

export async function getVaultRow(): Promise<VaultKeyRow | null> {
  const { data, error } = await supabase().from("vault_keys").select("*").maybeSingle();
  if (error) throw error;
  return data as VaultKeyRow | null;
}

/** Creates the vault. Returns the data key and the one-time recovery code to show the user. */
export async function createVault(userId: string, passphrase: string): Promise<{ key: CryptoKey; recoveryCode: string }> {
  const raw = C.newRawKey();
  const code = C.newRecoveryCode();
  const w = await C.wrapRawKey(raw, passphrase, C.PBKDF2_ITERATIONS);
  const r = await C.wrapRawKey(raw, code, C.RECOVERY_ITERATIONS);
  const { error } = await supabase().from("vault_keys").insert({
    user_id: userId,
    salt: w.salt, iv: w.iv, wrapped_key: w.wrapped, iterations: w.iterations,
    recovery_salt: r.salt, recovery_iv: r.iv, recovery_wrapped_key: r.wrapped, recovery_iterations: r.iterations,
  });
  if (error) throw error;
  return { key: await C.importDataKey(raw), recoveryCode: code };
}

const passWrap = (row: VaultKeyRow): C.Wrapped => ({ salt: row.salt, iv: row.iv, wrapped: row.wrapped_key, iterations: row.iterations });
const recWrap = (row: VaultKeyRow): C.Wrapped => ({ salt: row.recovery_salt, iv: row.recovery_iv, wrapped: row.recovery_wrapped_key, iterations: row.recovery_iterations });

export async function unlockWithPassphrase(row: VaultKeyRow, passphrase: string): Promise<CryptoKey> {
  try {
    return await C.importDataKey(await C.unwrapRawKey(passWrap(row), passphrase));
  } catch {
    throw new Error("That vault passphrase is not right.");
  }
}

/** Uses the recovery code to set a new passphrase. Also issues a fresh recovery code. */
export async function resetWithRecovery(row: VaultKeyRow, code: string, newPassphrase: string): Promise<{ key: CryptoKey; recoveryCode: string }> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = await C.unwrapRawKey(recWrap(row), C.normalizeRecoveryCode(code));
  } catch {
    throw new Error("That recovery code is not right.");
  }
  return rewrap(row.user_id, raw, newPassphrase);
}

export async function changePassphrase(row: VaultKeyRow, oldPass: string, newPass: string): Promise<{ key: CryptoKey; recoveryCode: string }> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = await C.unwrapRawKey(passWrap(row), oldPass);
  } catch {
    throw new Error("Your current vault passphrase is not right.");
  }
  return rewrap(row.user_id, raw, newPass);
}

async function rewrap(userId: string, raw: Uint8Array<ArrayBuffer>, passphrase: string) {
  const code = C.newRecoveryCode();
  const w = await C.wrapRawKey(raw, passphrase, C.PBKDF2_ITERATIONS);
  const r = await C.wrapRawKey(raw, code, C.RECOVERY_ITERATIONS);
  const { error } = await supabase().from("vault_keys").update({
    salt: w.salt, iv: w.iv, wrapped_key: w.wrapped, iterations: w.iterations,
    recovery_salt: r.salt, recovery_iv: r.iv, recovery_wrapped_key: r.wrapped, recovery_iterations: r.iterations,
    updated_at: new Date().toISOString(),
  }).eq("user_id", userId);
  if (error) throw error;
  return { key: await C.importDataKey(raw), recoveryCode: code };
}

// ---------- Records (encrypted JSON, one table for every tool) ----------

export type Rec<T> = { id: string; data: T; created_at: string; updated_at: string };

export async function listRecords<T>(key: CryptoKey, kind: string): Promise<Rec<T>[]> {
  const { data, error } = await supabase().from("records").select("id,iv,ciphertext,created_at,updated_at").eq("kind", kind).order("created_at");
  if (error) throw error;
  const out: Rec<T>[] = [];
  for (const r of data ?? []) {
    try {
      out.push({ id: r.id, data: await C.decryptJSON<T>(key, r.iv, r.ciphertext), created_at: r.created_at, updated_at: r.updated_at });
    } catch {
      // Unreadable with this key; skip rather than break the page.
    }
  }
  return out;
}

export async function insertRecord<T>(key: CryptoKey, kind: string, data: T): Promise<Rec<T>> {
  const e = await C.encryptJSON(key, data);
  const { data: row, error } = await supabase().from("records").insert({ kind, iv: e.iv, ciphertext: e.ciphertext }).select("id,created_at,updated_at").single();
  if (error) throw error;
  return { id: row.id, data, created_at: row.created_at, updated_at: row.updated_at };
}

export async function updateRecord<T>(key: CryptoKey, id: string, data: T): Promise<void> {
  const e = await C.encryptJSON(key, data);
  const { error } = await supabase().from("records").update({ iv: e.iv, ciphertext: e.ciphertext, updated_at: new Date().toISOString() }).eq("id", id);
  if (error) throw error;
}

export async function deleteRecord(id: string): Promise<void> {
  const { error } = await supabase().from("records").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Files (encrypted bytes in Storage, encrypted metadata in a table) ----------

export type FileMeta = { name: string; type: string; size: number; folder: string; note?: string };
export type VaultFile = { id: string; path: string; meta: FileMeta; created_at: string };

export const FOLDERS = ["IDs", "Contracts", "Receipts", "Insurance", "Medical", "Home", "Photos", "Other"];

export async function uploadFile(key: CryptoKey, userId: string, blob: Blob, meta: FileMeta): Promise<VaultFile> {
  const id = crypto.randomUUID();
  const path = `${userId}/${id}`;
  const encBytes = await C.encryptBytes(key, await blob.arrayBuffer());
  const up = await supabase().storage.from(BUCKET).upload(path, new Blob([encBytes], { type: "application/octet-stream" }), { upsert: false, contentType: "application/octet-stream" });
  if (up.error) throw up.error;
  const m = await C.encryptJSON(key, meta);
  const { data, error } = await supabase().from("files").insert({ id, path, meta_iv: m.iv, meta_ciphertext: m.ciphertext, size: encBytes.length }).select("created_at").single();
  if (error) {
    await supabase().storage.from(BUCKET).remove([path]);
    throw error;
  }
  return { id, path, meta, created_at: data.created_at };
}

export async function listFiles(key: CryptoKey): Promise<VaultFile[]> {
  const { data, error } = await supabase().from("files").select("id,path,meta_iv,meta_ciphertext,created_at").order("created_at", { ascending: false });
  if (error) throw error;
  const out: VaultFile[] = [];
  for (const r of data ?? []) {
    try {
      out.push({ id: r.id, path: r.path, meta: await C.decryptJSON<FileMeta>(key, r.meta_iv, r.meta_ciphertext), created_at: r.created_at });
    } catch {}
  }
  return out;
}

export async function updateFileMeta(key: CryptoKey, id: string, meta: FileMeta): Promise<void> {
  const m = await C.encryptJSON(key, meta);
  const { error } = await supabase().from("files").update({ meta_iv: m.iv, meta_ciphertext: m.ciphertext }).eq("id", id);
  if (error) throw error;
}

export async function fetchFile(key: CryptoKey, f: { path: string; meta: FileMeta }): Promise<Blob> {
  const { data, error } = await supabase().storage.from(BUCKET).download(f.path);
  if (error || !data) throw error ?? new Error("Download failed");
  const plain = await C.decryptBytes(key, await data.arrayBuffer());
  return new Blob([plain], { type: f.meta.type || "application/octet-stream" });
}

export async function deleteFile(f: { id: string; path: string }): Promise<void> {
  const s = await supabase().storage.from(BUCKET).remove([f.path]);
  if (s.error) throw s.error;
  const { error } = await supabase().from("files").delete().eq("id", f.id);
  if (error) throw error;
}

/** Deletes every file, record and the vault key, then the account itself. */
export async function deleteEverything(userId: string): Promise<void> {
  const sb = supabase();
  const { data: files } = await sb.from("files").select("path");
  const paths = (files ?? []).map((f) => f.path);
  for (let i = 0; i < paths.length; i += 100) await sb.storage.from(BUCKET).remove(paths.slice(i, i + 100));
  // Also catch anything left in the user's folder.
  const { data: left } = await sb.storage.from(BUCKET).list(userId, { limit: 1000 });
  if (left?.length) await sb.storage.from(BUCKET).remove(left.map((o) => `${userId}/${o.name}`));
  const { error } = await sb.rpc("delete_my_account");
  if (error) throw error;
  await sb.auth.signOut();
}
