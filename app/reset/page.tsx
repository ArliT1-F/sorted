"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { supabase, supabaseConfigured } from "@/lib/supabase";

export default function Reset() {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!supabaseConfigured) return <div className="wrap head"><h1>Accounts aren&apos;t set up yet</h1></div>;
  return (
    <div className="wrap">
      <div className="head" style={{ maxWidth: 560, margin: "0 auto" }}>
        <h1>Choose a new password</h1>
        <p className="lede">This is your sign-in password. Your vault passphrase stays the same.</p>
      </div>
      <form
        className="gate"
        onSubmit={async (e) => {
          e.preventDefault();
          setErr("");
          if (pw.length < 8) return setErr("Use at least 8 characters.");
          setBusy(true);
          const { error } = await supabase().auth.updateUser({ password: pw });
          setBusy(false);
          if (error) return setErr(error.message + " The reset link may have expired; request a new one.");
          router.replace("/vault");
        }}
      >
        <label htmlFor="np">New password</label>
        <input id="np" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
        <button className="btn pri" style={{ marginTop: 18 }} disabled={busy}>{busy ? "Saving…" : "Save password"}</button>
      </form>
    </div>
  );
}
