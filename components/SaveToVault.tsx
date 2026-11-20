"use client";
import Link from "next/link";
import { useState } from "react";
import { useVault } from "./VaultProvider";
import { uploadFile } from "@/lib/vault";

/** Button that saves a generated file to the encrypted vault, or explains how to. */
export function SaveToVault({ blob, name, folder = "Other" }: { blob: Blob; name: string; folder?: string }) {
  const v = useVault();
  const [state, setState] = useState<"idle" | "busy" | "done" | "err">("idle");
  if (v.state === "unconfigured") return null;
  if (v.state !== "unlocked")
    return (
      <Link className="btn quiet" href={v.user ? "/vault" : "/login?mode=signup"} title="Sign in and unlock your vault to save here">
        {v.user ? "Unlock vault to save" : "Save to vault (free account)"}
      </Link>
    );
  return (
    <button
      className="btn quiet"
      disabled={state === "busy" || state === "done"}
      onClick={async () => {
        setState("busy");
        try {
          await uploadFile(v.key!, v.user!.id, blob, { name, type: blob.type, size: blob.size, folder });
          setState("done");
        } catch {
          setState("err");
        }
      }}
    >
      {state === "busy" ? "Encrypting…" : state === "done" ? "Saved to vault" : state === "err" ? "Save failed, retry" : "Save to vault"}
    </button>
  );
}
