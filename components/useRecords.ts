"use client";
import { useCallback, useEffect, useState } from "react";
import { useVault } from "./VaultProvider";
import { deleteRecord, insertRecord, listRecords, updateRecord, type Rec } from "@/lib/vault";

/** Encrypted CRUD for one tool's records. */
export function useRecords<T>(kind: string) {
  const { key } = useVault();
  const [items, setItems] = useState<Rec<T>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      setItems(await listRecords<T>(key, kind));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load.");
    } finally {
      setLoading(false);
    }
  }, [key, kind]);

  useEffect(() => {
    reload();
  }, [reload]);

  const wrap = async <R,>(fn: () => Promise<R>): Promise<R | undefined> => {
    try {
      setError(null);
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong saving.");
      return undefined;
    }
  };

  const add = (data: T) =>
    wrap(async () => {
      const r = await insertRecord(key!, kind, data);
      setItems((x) => [...x, r]);
      return r;
    });
  const update = (id: string, data: T) =>
    wrap(async () => {
      await updateRecord(key!, id, data);
      setItems((x) => x.map((r) => (r.id === id ? { ...r, data, updated_at: new Date().toISOString() } : r)));
    });
  const remove = (id: string) =>
    wrap(async () => {
      await deleteRecord(id);
      setItems((x) => x.filter((r) => r.id !== id));
    });

  return { items, loading, error, add, update, remove, reload };
}
