"use client";
import { useState } from "react";
import { copyText, downloadBlob } from "@/lib/download";

export function RecoveryCode({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="stackform">
      <h2>Save your recovery code</h2>
      <p>
        If you forget your vault passphrase, this code is the only way back in. Write it down or store it in a password manager. It
        won&apos;t be shown again.
      </p>
      <p className="code" aria-label="Recovery code">{code}</p>
      <div className="row">
        <button className="btn" type="button" onClick={async () => setCopied(await copyText(code))}>{copied ? "Copied" : "Copy"}</button>
        <button className="btn" type="button" onClick={() => downloadBlob(new Blob([`Sorted vault recovery code\n\n${code}\n\nKeep this somewhere safe and private.\n`], { type: "text/plain" }), "sorted-recovery-code.txt")}>
          Download as text
        </button>
      </div>
      <label className="check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I&apos;ve saved my recovery code
      </label>
      <button className="btn pri" type="button" disabled={!saved} onClick={onDone}>Continue</button>
    </div>
  );
}
