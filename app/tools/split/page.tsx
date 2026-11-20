"use client";
import { useMemo, useState } from "react";
import { PageHead } from "@/components/PageHead";
import { VaultGate } from "@/components/VaultGate";
import { useRecords } from "@/components/useRecords";
import { useToast } from "@/components/FileDrop";
import { computeSplit, type Method, type Scenario } from "@/lib/split";
import { copyText } from "@/lib/download";

const uid = () => Math.random().toString(36).slice(2, 9);
const example = (): Scenario => ({
  name: "Our flat",
  rent: 900,
  method: "hybrid",
  commonShare: 40,
  currency: "EUR",
  people: [
    { id: uid(), name: "Ana", room: 16, income: 1400, extras: 40, occupants: 1 },
    { id: uid(), name: "Besi", room: 12, income: 1100, extras: 0, occupants: 2 },
    { id: uid(), name: "Dren", room: 10, income: 900, extras: 0, occupants: 1 },
  ],
  bills: [
    { id: uid(), name: "Electricity", amount: 85, split: "occupants" },
    { id: uid(), name: "Internet", amount: 30, split: "equal" },
  ],
});

const METHODS: { id: Method; label: string; help: string }[] = [
  { id: "hybrid", label: "Shared + room size", help: "Shared spaces split equally, private rooms by size. Usually feels fairest." },
  { id: "room", label: "By room size", help: "Bigger room, bigger share." },
  { id: "income", label: "By income", help: "Common for couples: each pays the same share of what they earn." },
  { id: "equal", label: "Equal", help: "Everyone pays the same." },
];

export default function SplitPage() {
  return (
    <div className="wrap">
      <PageHead account title="Fair split" lede="Split rent and bills between flatmates or partners. Every share shows the sum behind it, so the conversation is about the method, not the maths." />
      <VaultGate what="Fair split">
        <Split />
      </VaultGate>
    </div>
  );
}

function Split() {
  const { items, add, update, remove, error } = useRecords<Scenario>("split");
  const [s, setS] = useState<Scenario>(example());
  const [savedId, setSavedId] = useState<string | null>(null);
  const toast = useToast();
  const lines = useMemo(() => computeSplit(s), [s]);
  const total = lines.reduce((a, l) => a + l.total, 0);
  const max = Math.max(1, ...lines.map((l) => l.total));
  const cur = s.currency;
  const f2 = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const setP = (id: string, k: string, v: string | number) => setS((x) => ({ ...x, people: x.people.map((p) => (p.id === id ? { ...p, [k]: v } : p)) }));
  const setB = (id: string, k: string, v: string | number) => setS((x) => ({ ...x, bills: x.bills.map((b) => (b.id === id ? { ...b, [k]: v } : b)) }));
  const summary = `${s.name}: ${METHODS.find((m) => m.id === s.method)!.label} split of ${f2(s.rent)} ${cur} rent${s.bills.length ? " plus bills" : ""}\n` + lines.map((l) => `${l.person.name}: ${f2(l.total)} ${cur}\n  - ${l.why.join("\n  - ")}`).join("\n");

  return (
    <div className="work">
      <div>
        <div className="panel">
          <div className="grid3">
            <div><label htmlFor="sn" style={{ marginTop: 0 }}>Name</label><input id="sn" value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} /></div>
            <div><label htmlFor="rt" style={{ marginTop: 0 }}>Monthly rent</label><input id="rt" type="number" min="0" inputMode="decimal" value={s.rent || ""} onChange={(e) => setS({ ...s, rent: Number(e.target.value) })} /></div>
            <div><label htmlFor="cy" style={{ marginTop: 0 }}>Currency</label><select id="cy" value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })}>{["EUR", "ALL", "USD", "GBP", "CHF"].map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
          <label>Method</label>
          <div className="chips">{METHODS.map((m) => <button key={m.id} className="chip" aria-pressed={s.method === m.id} onClick={() => setS({ ...s, method: m.id })}>{m.label}</button>)}</div>
          <p className="hint" style={{ marginTop: 0 }}>{METHODS.find((m) => m.id === s.method)!.help}</p>
          {s.method === "hybrid" && (
            <>
              <label htmlFor="cs">Share of rent for shared spaces: {s.commonShare}%</label>
              <input id="cs" type="range" min="0" max="80" step="5" value={s.commonShare} onChange={(e) => setS({ ...s, commonShare: Number(e.target.value) })} style={{ padding: 0 }} />
            </>
          )}
        </div>
        <div className="panel">
          <h2>People</h2>
          <div className="scroll">
            <table>
              <thead>
                <tr><th>Name</th>{s.method !== "income" && <th className="n">Room m²</th>}{s.method === "income" && <th className="n">Income</th>}<th className="n">Extras</th><th className="n">People</th><th /></tr>
              </thead>
              <tbody>
                {s.people.map((p) => (
                  <tr key={p.id}>
                    <td><input aria-label="Name" value={p.name} onChange={(e) => setP(p.id, "name", e.target.value)} style={{ minWidth: 90 }} /></td>
                    {s.method !== "income" && <td><input aria-label="Room size" type="number" min="0" value={p.room || ""} onChange={(e) => setP(p.id, "room", Number(e.target.value))} style={{ width: 80 }} /></td>}
                    {s.method === "income" && <td><input aria-label="Income" type="number" min="0" value={p.income || ""} onChange={(e) => setP(p.id, "income", Number(e.target.value))} style={{ width: 100 }} /></td>}
                    <td><input aria-label="Extras" title="Own bathroom, parking, balcony" type="number" min="0" value={p.extras || ""} onChange={(e) => setP(p.id, "extras", Number(e.target.value))} style={{ width: 80 }} /></td>
                    <td><input aria-label="People in room" type="number" min="1" value={p.occupants} onChange={(e) => setP(p.id, "occupants", Number(e.target.value))} style={{ width: 64 }} /></td>
                    <td><button className="btn small quiet" aria-label={`Remove ${p.name}`} onClick={() => setS({ ...s, people: s.people.filter((x) => x.id !== p.id) })}>✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="hint">Extras: a fixed amount someone pays on top for a private bathroom, parking or balcony. People: how many live in that room (for usage-based bills).</p>
          <button className="btn small" onClick={() => setS({ ...s, people: [...s.people, { id: uid(), name: `Person ${s.people.length + 1}`, room: 10, income: 0, extras: 0, occupants: 1 }] })}>Add person</button>
        </div>
        <div className="panel">
          <h2>Monthly bills</h2>
          {s.bills.map((b) => (
            <div key={b.id} className="row" style={{ marginBottom: 8, flexWrap: "nowrap" }}>
              <input aria-label="Bill" value={b.name} onChange={(e) => setB(b.id, "name", e.target.value)} />
              <input aria-label="Amount" type="number" min="0" value={b.amount || ""} onChange={(e) => setB(b.id, "amount", Number(e.target.value))} style={{ width: 100, flex: "none" }} />
              <select aria-label="Split" value={b.split} onChange={(e) => setB(b.id, "split", e.target.value)} style={{ width: 130, flex: "none" }}>
                <option value="equal">Equally</option>
                <option value="occupants">Per person</option>
              </select>
              <button className="btn small quiet" aria-label={`Remove ${b.name}`} onClick={() => setS({ ...s, bills: s.bills.filter((x) => x.id !== b.id) })}>✕</button>
            </div>
          ))}
          <button className="btn small" onClick={() => setS({ ...s, bills: [...s.bills, { id: uid(), name: "Water", amount: 0, split: "occupants" }] })}>Add bill</button>
        </div>
      </div>
      <div className="sticky">
        <div className="panel">
          <h2>{lines.length ? `${f2(total)} ${cur} a month, split ${lines.length} ways` : "Add people to split"}</h2>
          {lines.map((l) => (
            <div key={l.person.id} style={{ marginBottom: 16 }}>
              <div className="row" style={{ justifyContent: "space-between" }}>
                <strong>{l.person.name}</strong>
                <strong style={{ fontSize: 20, whiteSpace: "nowrap" }}>{f2(l.total)} {cur}</strong>
              </div>
              <div style={{ height: 12, background: "var(--line)", borderRadius: 6, overflow: "hidden", margin: "6px 0", display: "flex" }}>
                <span style={{ width: `${(l.rent / max) * 100}%`, background: "var(--blue)" }} />
                <span style={{ width: `${(l.bills / max) * 100}%`, background: "var(--yellow)" }} />
              </div>
              <details>
                <summary className="muted" style={{ fontSize: 14, cursor: "pointer" }}>Rent {f2(l.rent)} + bills {f2(l.bills)}: show working</summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 14 }}>{l.why.map((w) => <li key={w}>{w}</li>)}</ul>
              </details>
            </div>
          ))}
          <div className="row">
            <button className="btn pri" onClick={async () => {
              if (savedId) { await update(savedId, s); toast.show("Saved"); }
              else { const r = await add(s); if (r) { setSavedId(r.id); toast.show("Saved"); } }
            }}>{savedId ? "Save changes" : "Save this split"}</button>
            <button className="btn quiet" onClick={async () => toast.show((await copyText(summary)) ? "Copied, paste it in the group chat" : "Copy blocked")}>Copy summary</button>
          </div>
          {error && <p className="err">{error}</p>}
        </div>
        {items.length > 0 && (
          <div className="panel">
            <h3>Saved splits</h3>
            {items.map((r) => (
              <div key={r.id} className="row" style={{ justifyContent: "space-between", padding: "6px 0" }}>
                <span>{r.data.name} <span className="muted">· {r.data.people.length} people</span></span>
                <span className="row">
                  <button className="btn small" onClick={() => { setS(r.data); setSavedId(r.id); }}>Open</button>
                  <button className="btn small quiet" onClick={() => { if (window.confirm("Delete this split?")) { remove(r.id); if (savedId === r.id) setSavedId(null); } }}>Delete</button>
                </span>
              </div>
            ))}
            <button className="btn small quiet" style={{ marginTop: 6 }} onClick={() => { setS(example()); setSavedId(null); }}>New split</button>
          </div>
        )}
      </div>
      {toast.node}
    </div>
  );
}
