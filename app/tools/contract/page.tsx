"use client";
import { useMemo, useRef, useState } from "react";
import { PageHead } from "@/components/PageHead";
import { FileDrop } from "@/components/FileDrop";
import { CATEGORIES, readContract } from "@/lib/contract";
import { pdfToText } from "@/lib/download";

const SAMPLE = `RESIDENTIAL TENANCY AGREEMENT

1. Term. The tenancy starts on 1 December 2026 for an initial term of 12 months. After the initial term, this agreement renews automatically for successive 12 month periods unless either party gives notice.

2. Rent. The rent is €650 per month, payable in advance on the 1st of each month. The landlord may increase the rent once per year in line with inflation (CPI), with 30 days' written notice.

3. Deposit. The tenant pays a deposit of €1,300. The deposit is returned within 30 days after the end of the tenancy, less any deductions for damage. The cleaning fee of €120 is non-refundable.

4. Late payment. Rent paid more than 5 days late incurs a late fee of €40 plus interest at 8% per year.

5. Ending the tenancy. The tenant may terminate this agreement with two months' written notice. If the tenant leaves during the initial term, an early termination fee equal to one month's rent applies.

6. Repairs. The tenant shall be responsible for minor repairs and maintenance up to €100 per repair. The landlord is not liable for loss or damage to the tenant's belongings.

7. Disputes. This agreement is governed by Albanian law, and disputes are subject to the jurisdiction of the courts of Tirana.

8. Changes. The landlord reserves the right to amend these terms with 30 days' notice.`;

export default function Contract() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [focus, setFocus] = useState<number | null>(null);
  const docRef = useRef<HTMLDivElement>(null);
  const r = useMemo(() => (text.trim().length > 40 ? readContract(text) : null), [text]);

  const load = async (f: File) => {
    setErr("");
    setBusy("Reading…");
    try {
      const t = /\.pdf$/i.test(f.name) || f.type === "application/pdf" ? await pdfToText(f) : await f.text();
      if (t.trim().length < 40) setErr("No text found. If it's a scanned PDF, copy the text from it instead.");
      setText(t);
    } catch {
      setErr("Couldn't read that file. Try a PDF with text, or a .txt file.");
    }
    setBusy("");
  };

  const jump = (start: number) => {
    setFocus(start);
    requestAnimationFrame(() => docRef.current?.querySelector(`[data-s="${start}"]`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };

  const catOf = (id: string) => CATEGORIES.find((c) => c.id === id)!;

  return (
    <div className="wrap">
      <PageHead title="Contract reader" lede="Paste or upload a lease, phone or gym contract, or a site's terms. The clauses that cost people money are pulled out and highlighted in the text. It's a reading aid, not legal advice." />
      {!r ? (
        <div className="work">
          <div>
            <label htmlFor="ct" style={{ marginTop: 0 }}>Contract text</label>
            <textarea id="ct" rows={14} value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste the contract here" />
            <div className="row" style={{ marginTop: 10 }}>
              <button className="btn quiet" onClick={() => setText(SAMPLE)}>Try a sample lease</button>
            </div>
          </div>
          <div>
            <FileDrop accept=".pdf,.txt,application/pdf,text/plain" onFiles={(f) => load(f[0])} title="Or drop a PDF or text file" sub="Read on your device, never uploaded" />
            {busy && <p className="muted" style={{ marginTop: 10 }}>{busy}</p>}
            {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
            <div className="panel" style={{ marginTop: 16 }}>
              <h2>What it looks for</h2>
              <p className="muted" style={{ margin: 0 }}>{CATEGORIES.map((c) => c.title).join(" · ")}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="work" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.2fr)" }}>
          <div>
            <div className="stats">
              <div className="stat"><b>{CATEGORIES.filter((c) => c.tone === "warn" && r.byCat[c.id].length).length}</b><span>things to watch</span></div>
              <div className="stat"><b>{r.figures.filter((f) => f.kind === "money").length}</b><span>amounts of money</span></div>
              <div className="stat"><b>{Math.max(1, Math.round(r.words / 230))} min</b><span>to read in full</span></div>
            </div>
            {r.missing.map((m) => <p key={m} className="sig w" style={{ fontWeight: 600 }}>{m}</p>)}
            {CATEGORIES.filter((c) => r.byCat[c.id].length).map((c) => (
              <details key={c.id} className="cat" open={c.tone === "warn"}>
                <summary>
                  <span className={c.tone === "warn" ? "pill red" : "pill blue"}>{c.tone === "warn" ? "Watch" : "Note"}</span>
                  {c.title}
                  <span className="cnt muted">{r.byCat[c.id].length}</span>
                </summary>
                <div className="body">
                  <p className="muted" style={{ fontSize: 14 }}>{c.why}</p>
                  {r.byCat[c.id].map((cl) => (
                    <div key={cl.start} className="cl" role="button" tabIndex={0} onClick={() => jump(cl.start)} onKeyDown={(e) => e.key === "Enter" && jump(cl.start)}>
                      {cl.text.length > 260 ? cl.text.slice(0, 260) + "…" : cl.text}
                    </div>
                  ))}
                </div>
              </details>
            ))}
            {r.figures.length > 0 && (
              <div className="panel" style={{ marginTop: 14 }}>
                <h3>Every number in it</h3>
                <div className="chips">
                  {Array.from(new Map(r.figures.map((f) => [f.text.toLowerCase(), f])).values()).slice(0, 40).map((f) => (
                    <button key={f.start} className="chip" onClick={() => { const cl = r.clauses.find((c) => f.start >= c.start && f.start < c.end); if (cl) jump(cl.start); }}>
                      <span className={f.kind === "money" ? "pill yellow" : f.kind === "percent" ? "pill red" : "pill blue"}>{f.kind === "money" ? "€" : f.kind === "percent" ? "%" : "time"}</span>
                      {f.text}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="row" style={{ margin: "16px 0 40px" }}>
              <button className="btn quiet" onClick={() => setText("")}>Read another</button>
            </div>
          </div>
          <div className="sticky">
            <div className="doc" ref={docRef}>
              {(() => {
                const nodes: React.ReactNode[] = [];
                let pos = 0;
                for (const cl of r.clauses) {
                  if (cl.start > pos) nodes.push(text.slice(pos, cl.start));
                  if (cl.cats.length) {
                    const warn = cl.cats.some((id) => catOf(id).tone === "warn");
                    nodes.push(
                      <mark key={cl.start} data-s={cl.start} className={`${warn ? "warn" : ""} ${focus === cl.start ? "focus" : ""}`} title={cl.cats.map((id) => catOf(id).title).join(", ")}>
                        {text.slice(cl.start, cl.end)}
                      </mark>,
                    );
                  } else nodes.push(text.slice(cl.start, cl.end));
                  pos = cl.end;
                }
                nodes.push(text.slice(pos));
                return nodes;
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
