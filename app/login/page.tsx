"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";
import { useVault } from "@/components/VaultProvider";

type Mode = "signin" | "signup" | "forgot";

export default function Login() {
  const router = useRouter();
  const v = useVault();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const m = new URLSearchParams(window.location.search).get("mode");
    if (m === "signup" || m === "forgot") setMode(m);
  }, []);

  useEffect(() => {
    if (v.user && v.state !== "loading") router.replace("/vault");
  }, [v.user, v.state, router]);

  if (!supabaseConfigured)
    return (
      <div className="wrap head">
        <h1>Accounts aren&apos;t set up yet</h1>
        <p className="lede">The site owner needs to add the Supabase settings described in the README. The quick tools still work.</p>
      </div>
    );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setMsg("");
    setBusy(true);
    const sb = supabase();
    try {
      if (mode === "signup") {
        if (pw.length < 8) throw new Error("Use at least 8 characters for your password.");
        const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: `${window.location.origin}/vault` } });
        if (error) throw error;
        if (!data.session) setMsg("Check your email to confirm your account, then sign in.");
        else await v.refresh();
      } else if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        await v.refresh();
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset` });
        if (error) throw error;
        setMsg("If that email has an account, a reset link is on its way.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wrap">
      <div className="head" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1>{mode === "signup" ? "Create your account" : mode === "forgot" ? "Reset your password" : "Sign in"}</h1>
        {mode === "signup" && <p className="lede">Free. After this you&apos;ll set a separate vault passphrase that encrypts everything you save.</p>}
      </div>
      <form className="gate" onSubmit={submit}>
        <label htmlFor="em">Email</label>
        <input id="em" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        {mode !== "forgot" && (
          <>
            <label htmlFor="pw">Password</label>
            <input id="pw" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required value={pw} onChange={(e) => setPw(e.target.value)} />
          </>
        )}
        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
        {msg && <p className="ok" style={{ marginTop: 12 }}>{msg}</p>}
        <button className="btn pri" style={{ marginTop: 18, width: "100%" }} disabled={busy}>
          {busy ? "Please wait…" : mode === "signup" ? "Create account" : mode === "forgot" ? "Send reset link" : "Sign in"}
        </button>
        <div className="row" style={{ marginTop: 14, justifyContent: "space-between" }}>
          {mode !== "signin" && <button type="button" className="btn link" onClick={() => setMode("signin")}>I have an account</button>}
          {mode !== "signup" && <button type="button" className="btn link" onClick={() => setMode("signup")}>Create an account</button>}
          {mode === "signin" && <button type="button" className="btn link" onClick={() => setMode("forgot")}>Forgot password?</button>}
        </div>
        {mode === "forgot" && (
          <p className="hint" style={{ marginTop: 12 }}>
            Resetting your account password doesn&apos;t touch your vault. Your files stay locked with your vault passphrase.
          </p>
        )}
      </form>
      <p className="hint" style={{ textAlign: "center", marginBottom: 48 }}><Link href="/">Back to the tools</Link></p>
    </div>
  );
}
