"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useVault } from "@/components/VaultProvider";
import { VaultGate } from "@/components/VaultGate";
import { RecoveryCode } from "@/components/RecoveryCode";
import { supabase } from "@/lib/supabase";
import { changePassphrase, deleteEverything } from "@/lib/vault";
import { passphraseScore } from "@/lib/crypto";

export default function Account() {
  const v = useVault();
  const router = useRouter();
  return (
    <div className="wrap">
      <div className="head">
        <h1>Your account</h1>
        {v.user && <p className="lede">Signed in as {v.user.email}</p>}
      </div>
      <VaultGate what="your account settings">
        <div className="work" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)" }}>
          <ChangePass />
          <div>
            <div className="panel">
              <h2>Sign out</h2>
              <p className="muted">Signing out also locks your vault on this device.</p>
              <button className="btn" onClick={async () => { await supabase().auth.signOut(); router.replace("/"); }}>Sign out</button>
            </div>
            <DeleteAll />
          </div>
        </div>
      </VaultGate>
    </div>
  );
}

function ChangePass() {
  const v = useVault();
  const [oldP, setOldP] = useState("");
  const [p1, setP1] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [code, setCode] = useState<string | null>(null);
  if (code) return <div className="panel"><RecoveryCode code={code} onDone={async () => { setCode(null); await v.refresh(); }} /></div>;
  return (
    <form
      className="panel"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        if (passphraseScore(p1) < 2) return setErr("Use a longer new passphrase.");
        setBusy(true);
        try {
          const r = await changePassphrase(v.row!, oldP, p1);
          v.setKey(r.key);
          setOldP("");
          setP1("");
          setCode(r.recoveryCode);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Could not change it.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Change vault passphrase</h2>
      <p className="muted">Your files aren&apos;t re-encrypted; only the lock on your key changes, so this is instant. You&apos;ll get a new recovery code and the old one stops working.</p>
      <label htmlFor="op">Current passphrase</label>
      <input id="op" type="password" autoComplete="current-password" value={oldP} onChange={(e) => setOldP(e.target.value)} />
      <label htmlFor="np1">New passphrase</label>
      <input id="np1" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
      {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
      <button className="btn pri" style={{ marginTop: 16 }} disabled={busy || !oldP || !p1}>{busy ? "Saving…" : "Change passphrase"}</button>
    </form>
  );
}

function DeleteAll() {
  const v = useVault();
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <div className="panel">
      <h2>Delete my account</h2>
      <p className="muted">Permanently deletes every file, every saved entry and your account. This can&apos;t be undone.</p>
      <label htmlFor="del">Type DELETE to confirm</label>
      <input id="del" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
      <button
        className="btn danger"
        style={{ marginTop: 14 }}
        disabled={confirm !== "DELETE" || busy}
        onClick={async () => {
          setBusy(true);
          try {
            await deleteEverything(v.user!.id);
            router.replace("/");
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not delete.");
            setBusy(false);
          }
        }}
      >
        {busy ? "Deleting…" : "Delete everything"}
      </button>
    </div>
  );
}
