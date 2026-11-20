"use client";
import Link from "next/link";
import { useState, type ReactNode } from "react";
import { useVault } from "./VaultProvider";
import { createVault, unlockWithPassphrase, resetWithRecovery } from "@/lib/vault";
import { passphraseScore } from "@/lib/crypto";
import { RecoveryCode } from "./RecoveryCode";

/** Renders children only when the user is signed in and the vault is unlocked. */
export function VaultGate({ children, what }: { children: ReactNode; what: string }) {
  const v = useVault();
  if (v.state === "unlocked") return <>{children}</>;
  return (
    <div className="gate">
      {v.state === "unconfigured" && (
        <p>Accounts aren&apos;t set up on this server yet. The site owner needs to add the Supabase settings (see the README).</p>
      )}
      {v.state === "loading" && <p className="muted">Checking your account…</p>}
      {v.state === "signed-out" && (
        <>
          <h2>Sign in to use {what}</h2>
          <p>Your entries are saved to your account, encrypted on this device before they&apos;re sent.</p>
          <div className="row">
            <Link className="btn pri" href="/login?mode=signup">Create a free account</Link>
            <Link className="btn" href="/login">Sign in</Link>
          </div>
        </>
      )}
      {v.state === "no-vault" && <CreateVault />}
      {v.state === "locked" && <Unlock />}
      {v.error && <p className="err">{v.error}</p>}
    </div>
  );
}

function CreateVault() {
  const v = useVault();
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [pending, setPending] = useState<CryptoKey | null>(null);
  const score = passphraseScore(p1);

  if (code && pending)
    return (
      <RecoveryCode
        code={code}
        onDone={async () => {
          await v.refresh();
          v.setKey(pending);
        }}
      />
    );

  return (
    <form
      className="stackform"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        if (score < 2) return setErr("Use a longer passphrase: at least 14 characters, or four random words.");
        if (p1 !== p2) return setErr("The two passphrases don't match.");
        setBusy(true);
        try {
          const r = await createVault(v.user!.id, p1);
          setPending(r.key);
          setCode(r.recoveryCode);
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Could not create the vault.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Set your vault passphrase</h2>
      <p>
        Everything you save is locked with this passphrase on your device. We never see it, so we can&apos;t read your files, and we
        can&apos;t reset it for you. You&apos;ll get a recovery code next.
      </p>
      <label htmlFor="vp1">Vault passphrase</label>
      <input id="vp1" type="password" autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} />
      <div className="meter" aria-hidden><span style={{ width: `${score * 25}%` }} data-s={score} /></div>
      <p className="hint">Tip: four unrelated words, like “lantern orbit cactus Durrës”.</p>
      <label htmlFor="vp2">Type it again</label>
      <input id="vp2" type="password" autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} />
      {err && <p className="err">{err}</p>}
      <button className="btn pri" disabled={busy}>{busy ? "Creating…" : "Create my vault"}</button>
    </form>
  );
}

function Unlock() {
  const v = useVault();
  const [p, setP] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [mode, setMode] = useState<"pass" | "recover">("pass");
  const [rc, setRc] = useState("");
  const [np, setNp] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [pending, setPending] = useState<CryptoKey | null>(null);

  if (code && pending)
    return (
      <RecoveryCode
        code={code}
        onDone={async () => {
          await v.refresh();
          v.setKey(pending);
        }}
      />
    );

  if (mode === "recover")
    return (
      <form
        className="stackform"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          if (passphraseScore(np) < 2) return setErr("Use a longer new passphrase.");
          setBusy(true);
          try {
            const r = await resetWithRecovery(v.row!, rc, np);
            setPending(r.key);
            setCode(r.recoveryCode);
          } catch (e) {
            setErr(e instanceof Error ? e.message : "Could not reset.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Reset with your recovery code</h2>
        <label htmlFor="rc">Recovery code</label>
        <input id="rc" value={rc} onChange={(e) => setRc(e.target.value)} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX" autoComplete="off" />
        <label htmlFor="np">New vault passphrase</label>
        <input id="np" type="password" autoComplete="new-password" value={np} onChange={(e) => setNp(e.target.value)} />
        {err && <p className="err">{err}</p>}
        <div className="row">
          <button className="btn pri" disabled={busy}>{busy ? "Checking…" : "Reset passphrase"}</button>
          <button type="button" className="btn" onClick={() => setMode("pass")}>Back</button>
        </div>
      </form>
    );

  return (
    <form
      className="stackform"
      onSubmit={async (e) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        try {
          v.setKey(await unlockWithPassphrase(v.row!, p));
        } catch (e) {
          setErr(e instanceof Error ? e.message : "Could not unlock.");
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Unlock your vault</h2>
      <p className="muted">Signed in as {v.user?.email}. Your vault locks itself after 30 minutes of inactivity.</p>
      <label htmlFor="up">Vault passphrase</label>
      <input id="up" type="password" autoComplete="current-password" autoFocus value={p} onChange={(e) => setP(e.target.value)} />
      {err && <p className="err">{err}</p>}
      <div className="row">
        <button className="btn pri" disabled={busy || !p}>{busy ? "Unlocking…" : "Unlock"}</button>
        <button type="button" className="btn link" onClick={() => setMode("recover")}>Forgot passphrase?</button>
      </div>
    </form>
  );
}
