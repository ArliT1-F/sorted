"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { getVaultRow, type VaultKeyRow } from "@/lib/vault";

export type VaultState = "unconfigured" | "loading" | "signed-out" | "no-vault" | "locked" | "unlocked";

type Ctx = {
  state: VaultState;
  user: User | null;
  row: VaultKeyRow | null;
  key: CryptoKey | null;
  setKey: (k: CryptoKey | null) => void;
  refresh: () => Promise<void>;
  lock: () => void;
  error: string | null;
};

const VaultCtx = createContext<Ctx | null>(null);

export function VaultProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [row, setRow] = useState<VaultKeyRow | null>(null);
  const [key, setKey] = useState<CryptoKey | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!supabaseConfigured) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase().auth.getSession();
      const u = data.session?.user ?? null;
      setUser(u);
      setRow(u ? await getVaultRow() : null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach the server.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supabaseConfigured) return;
    refresh();
    const { data } = supabase().auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        setUser(null);
        setRow(null);
        setKey(null);
      } else if (event === "SIGNED_IN" && session?.user && session.user.id !== user?.id) {
        refresh();
      }
    });
    return () => data.subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lock after 30 minutes without interaction.
  useEffect(() => {
    if (!key) return;
    let t = setTimeout(() => setKey(null), 30 * 60_000);
    const bump = () => {
      clearTimeout(t);
      t = setTimeout(() => setKey(null), 30 * 60_000);
    };
    window.addEventListener("pointerdown", bump);
    window.addEventListener("keydown", bump);
    return () => {
      clearTimeout(t);
      window.removeEventListener("pointerdown", bump);
      window.removeEventListener("keydown", bump);
    };
  }, [key]);

  const state: VaultState = !supabaseConfigured ? "unconfigured" : loading ? "loading" : !user ? "signed-out" : !row ? "no-vault" : key ? "unlocked" : "locked";

  const value = useMemo<Ctx>(() => ({ state, user, row, key, setKey, refresh, lock: () => setKey(null), error }), [state, user, row, key, refresh, error]);
  return <VaultCtx.Provider value={value}>{children}</VaultCtx.Provider>;
}

export function useVault(): Ctx {
  const c = useContext(VaultCtx);
  if (!c) throw new Error("useVault outside provider");
  return c;
}
