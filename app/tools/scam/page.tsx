"use client";
import { useMemo, useState } from "react";
import { PageHead } from "@/components/PageHead";
import { checkMessage } from "@/lib/scam";

const EXAMPLES = [
  { label: "Parcel text", text: "DHL: Your parcel is held at our depot due to an unpaid customs fee of €1.99. Pay within 24 hours or it will be returned: https://dhl-parcel-redelivery.top/pay" },
  { label: "Bank alert", text: "URGENT: Unusual sign-in detected. Your account has been suspended. Verify your identity immediately at http://raiffeisen-secure.verify-login.xyz and enter the one-time code we send you." },
  { label: "Family message", text: "Hi Mum, this is my new number, I dropped my phone in the toilet 🙈 Can you do me a favour? I need to pay a bill today, I'll pay you back tomorrow. Don't tell dad x" },
  { label: "Normal message", text: "Hi Ana, the meeting moved to Thursday 3pm. Same room. Agenda is in the shared folder, see you there." },
];

const ADVICE: Record<string, string[]> = {
  high: [
    "Don't click links, reply, or call numbers in the message.",
    "If it claims to be a company or bank, open their official app or type their website yourself.",
    "If it's from 'family', call them on the number you already have.",
    "If you already entered card details or a code, call your bank now and block the card.",
  ],
  medium: [
    "Check the sender another way before doing anything it asks.",
    "Don't share codes, passwords or card details.",
    "Go to the company's site or app directly instead of using the link.",
  ],
  low: ["Nothing obvious stands out, but trust your gut. If it asks for money or codes, check with the sender another way."],
};

export default function Scam() {
  const [text, setText] = useState("");
  const report = useMemo(() => (text.trim().length > 8 ? checkMessage(text) : null), [text]);
  const label = report ? { low: "Few warning signs", medium: "Be careful", high: "Likely a scam" }[report.level] : "";

  return (
    <div className="wrap">
      <PageHead title="Scam check" lede="Paste a text, email, WhatsApp or social media message. You'll see every warning sign it carries and what to do. Nothing is sent anywhere." />
      <div className="work">
        <div>
          <label htmlFor="msg" style={{ marginTop: 0 }}>The message</label>
          <textarea id="msg" rows={11} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the whole message here, including any links" />
          <p className="hint">Try an example:</p>
          <div className="chips">
            {EXAMPLES.map((x) => <button key={x.label} className="chip" onClick={() => setText(x.text)}>{x.label}</button>)}
            {text && <button className="chip" onClick={() => setText("")}>Clear</button>}
          </div>
          <p className="hint">This checks for known scam patterns. It can&apos;t prove a message is safe, and new scams appear all the time.</p>
        </div>
        <div>
          {!report ? (
            <div className="panel"><p className="empty" style={{ padding: "40px 0" }}>Your result appears here as you paste.</p></div>
          ) : (
            <>
              <div className={`verdict ${report.level}`} role="status">
                <b>{label}</b>
                <span>{report.signals.length} warning sign{report.signals.length === 1 ? "" : "s"} found · risk score {report.score} of 100</span>
                <div className="gauge"><span style={{ width: `${report.score}%` }} /></div>
              </div>
              {report.signals.length > 0 && (
                <div className="panel">
                  <h2>What we noticed</h2>
                  {report.signals.map((s) => (
                    <div key={s.id} className={s.weight >= 20 ? "sig" : "sig w"}>
                      <strong>{s.title}</strong>
                      {s.evidence && <> <q>{s.evidence}</q></>}
                      <div className="muted" style={{ fontSize: 15 }}>{s.detail}</div>
                    </div>
                  ))}
                </div>
              )}
              {report.links.length > 0 && (
                <div className="panel">
                  <h2>Links in the message</h2>
                  {report.links.map((l) => (
                    <div key={l.url} style={{ marginBottom: 12 }}>
                      <div style={{ overflowWrap: "anywhere", fontFamily: "ui-monospace, monospace", fontSize: 14 }}>
                        Real site: <strong>{l.host}</strong>
                      </div>
                      {l.flags.length ? (
                        <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>{l.flags.map((f) => <li key={f} style={{ color: "var(--red)" }}>{f}</li>)}</ul>
                      ) : (
                        <div className="muted" style={{ fontSize: 14 }}>No problems spotted in this address.</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <div className="panel">
                <h2>What to do</h2>
                <ul style={{ margin: 0, paddingLeft: 18 }}>{ADVICE[report.level].map((a) => <li key={a} style={{ marginBottom: 6 }}>{a}</li>)}</ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
