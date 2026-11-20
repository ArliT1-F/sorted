"use client";
import { useMemo, useState } from "react";
import { PageHead } from "@/components/PageHead";
import { VaultGate } from "@/components/VaultGate";
import { useRecords } from "@/components/useRecords";
import { useToast } from "@/components/FileDrop";
import { copyText } from "@/lib/download";
import type { Rec } from "@/lib/vault";

type Entry = { direction: "lent" | "borrowed"; type: "item" | "money"; what: string; amount: number; currency: string; person: string; date: string; returned: boolean; returnedOn?: string; note: string };

const today = () => new Date().toISOString().slice(0, 10);
const blank = (): Entry => ({ direction: "lent", type: "item", what: "", amount: 0, currency: "EUR", person: "", date: today(), returned: false, note: "" });
const ago = (d: string) => {
  const n = Math.round((Date.now() - new Date(d).getTime()) / 864e5);
  return n < 1 ? "today" : n < 45 ? `${n} day${n === 1 ? "" : "s"} ago` : n < 700 ? `${Math.round(n / 30.4)} months ago` : `${(n / 365).toFixed(1)} years ago`;
};
const money = (n: number, c: string) => `${n.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${c}`;

function messages(e: Entry): { label: string; text: string }[] {
  const first = e.person.split(" ")[0];
  const thing = e.type === "money" ? money(e.amount, e.currency) : `my ${e.what}`;
  const when = new Date(e.date).toLocaleDateString(undefined, { day: "numeric", month: "long" });
  return [
    { label: "Friendly", text: `Hey ${first}! Hope you're well. Just a quick one: do you still have ${thing}${e.type === "money" && e.what ? ` (for ${e.what})` : ""} from ${when}? No rush, just let me know when works for you 🙂` },
    { label: "Clear", text: `Hi ${first}, I'd like to sort out ${thing} from ${when}. Could you ${e.type === "money" ? "send it back" : "return it"} by the end of next week? Thanks!` },
    { label: "Final", text: `Hi ${first}, I've asked a couple of times about ${thing} from ${when}. I need it back now. Please ${e.type === "money" ? "transfer it" : "return it"} by ${new Date(Date.now() + 5 * 864e5).toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}.` },
  ];
}

export default function LedgerPage() {
  return (
    <div className="wrap">
      <PageHead account title="Lent & owed" lede="Things and money you lent or borrowed, in one place. When it's time to ask, a polite message is ready to copy." />
      <VaultGate what="Lent & owed">
        <Ledger />
      </VaultGate>
    </div>
  );
}

function Ledger() {
  const { items, loading, error, add, update, remove } = useRecords<Entry>("ledger");
  const [form, setForm] = useState<Entry>(blank());
  const [editing, setEditing] = useState<string | null>(null);
  const [filter, setFilter] = useState<"open" | "settled" | "all">("open");
  const [remind, setRemind] = useState<Rec<Entry> | null>(null);
  const toast = useToast();

  const open = items.filter((r) => !r.data.returned);
  const owedToMe = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of open) if (r.data.type === "money") m[r.data.currency] = (m[r.data.currency] ?? 0) + (r.data.direction === "lent" ? 1 : -1) * r.data.amount;
    return m;
  }, [open]);
  const itemsOut = open.filter((r) => r.data.type === "item" && r.data.direction === "lent").length;
  const iOwe = open.filter((r) => r.data.direction === "borrowed").length;
  const shown = items
    .filter((r) => (filter === "all" ? true : filter === "open" ? !r.data.returned : r.data.returned))
    .sort((a, b) => a.data.date.localeCompare(b.data.date));
  const people = Array.from(new Set(items.map((r) => r.data.person))).filter(Boolean);

  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setForm((f) => ({ ...f, [k]: v }));

  return (
    <div className="work">
      <form
        className="panel sticky"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.person.trim() || (form.type === "item" ? !form.what.trim() : !form.amount)) return;
          if (editing) await update(editing, form);
          else await add(form);
          toast.show(editing ? "Saved" : "Added");
          setEditing(null);
          setForm(blank());
        }}
      >
        <h2>{editing ? "Edit entry" : "Add an entry"}</h2>
        <div className="chips" role="group" aria-label="Direction">
          <button type="button" className="chip" aria-pressed={form.direction === "lent"} onClick={() => set("direction", "lent")}>I lent</button>
          <button type="button" className="chip" aria-pressed={form.direction === "borrowed"} onClick={() => set("direction", "borrowed")}>I borrowed</button>
          <span style={{ width: 12 }} />
          <button type="button" className="chip" aria-pressed={form.type === "item"} onClick={() => set("type", "item")}>A thing</button>
          <button type="button" className="chip" aria-pressed={form.type === "money"} onClick={() => set("type", "money")}>Money</button>
        </div>
        <label htmlFor="pp">{form.direction === "lent" ? "Who has it" : "Who it's from"}</label>
        <input id="pp" list="people" value={form.person} onChange={(e) => set("person", e.target.value)} required />
        <datalist id="people">{people.map((p) => <option key={p} value={p} />)}</datalist>
        {form.type === "money" ? (
          <div className="grid2">
            <div><label htmlFor="am">Amount</label><input id="am" type="number" min="0" step="0.01" inputMode="decimal" value={form.amount || ""} onChange={(e) => set("amount", Number(e.target.value))} required /></div>
            <div><label htmlFor="cu">Currency</label><select id="cu" value={form.currency} onChange={(e) => set("currency", e.target.value)}>{["EUR", "ALL", "USD", "GBP", "CHF"].map((c) => <option key={c}>{c}</option>)}</select></div>
          </div>
        ) : null}
        <label htmlFor="wh">{form.type === "money" ? "What for (optional)" : "What"}</label>
        <input id="wh" value={form.what} onChange={(e) => set("what", e.target.value)} placeholder={form.type === "money" ? "Concert tickets" : "Power drill, book, tent"} required={form.type === "item"} />
        <label htmlFor="dt">When</label>
        <input id="dt" type="date" value={form.date} onChange={(e) => set("date", e.target.value)} />
        <label htmlFor="nt">Note</label>
        <input id="nt" value={form.note} onChange={(e) => set("note", e.target.value)} placeholder="Optional" />
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn pri">{editing ? "Save changes" : "Add"}</button>
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setForm(blank()); }}>Cancel</button>}
        </div>
        {error && <p className="err" style={{ marginTop: 10 }}>{error}</p>}
      </form>
      <div>
        <div className="stats">
          {Object.keys(owedToMe).length === 0 ? (
            <div className="stat"><b>0</b><span>money outstanding</span></div>
          ) : (
            Object.entries(owedToMe).map(([c, v]) => (
              <div key={c} className="stat"><b style={{ color: v < 0 ? "var(--red)" : undefined }}>{money(Math.abs(v), c)}</b><span>{v >= 0 ? "owed to you" : "you owe"}</span></div>
            ))
          )}
          <div className="stat"><b>{itemsOut}</b><span>things lent out</span></div>
          <div className="stat"><b>{iOwe}</b><span>you need to return</span></div>
        </div>
        {remind && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <h2 style={{ margin: 0 }}>Message for {remind.data.person}</h2>
              <button className="btn small" onClick={() => setRemind(null)}>Close</button>
            </div>
            {messages(remind.data).map((m) => (
              <div key={m.label} className="card" style={{ marginTop: 12 }}>
                <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                  <strong>{m.label}</strong>
                  <button className="btn small" onClick={async () => toast.show((await copyText(m.text)) ? "Copied" : "Copy blocked, select the text")}>Copy</button>
                </div>
                <p style={{ margin: 0 }}>{m.text}</p>
              </div>
            ))}
          </div>
        )}
        <div className="chips" role="group" aria-label="Filter">
          {(["open", "settled", "all"] as const).map((f) => (
            <button key={f} className="chip" aria-pressed={filter === f} onClick={() => setFilter(f)}>{f === "open" ? "Outstanding" : f === "settled" ? "Returned" : "All"}</button>
          ))}
        </div>
        {loading ? (
          <p className="empty">Decrypting…</p>
        ) : shown.length === 0 ? (
          <p className="empty">{items.length ? "Nothing here." : "Nothing tracked yet. Lent a book or paid for someone's ticket? Add it."}</p>
        ) : (
          <ul className="list">
            {shown.map((r) => {
              const e = r.data;
              return (
                <li key={r.id}>
                  <div>
                    <div className="t">
                      {e.type === "money" ? money(e.amount, e.currency) : e.what}{" "}
                      <span className={e.direction === "lent" ? "pill blue" : "pill yellow"}>{e.direction === "lent" ? `${e.person} has it` : `you owe ${e.person}`}</span>
                      {e.returned && <span className="pill green" style={{ marginLeft: 6 }}>Returned</span>}
                    </div>
                    <div className="m">
                      {e.type === "money" && e.what ? `${e.what} · ` : ""}
                      {new Date(e.date).toLocaleDateString()} ({ago(e.date)}){e.note ? ` · ${e.note}` : ""}
                    </div>
                  </div>
                  <div className="row">
                    {!e.returned && e.direction === "lent" && <button className="btn small pri" onClick={() => setRemind(r)}>Ask for it back</button>}
                    <button className="btn small quiet" onClick={() => update(r.id, { ...e, returned: !e.returned, returnedOn: e.returned ? undefined : today() })}>
                      {e.returned ? "Reopen" : "Returned"}
                    </button>
                    <button className="btn small quiet" onClick={() => { setEditing(r.id); setForm(e); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                    <button className="btn small quiet" onClick={() => window.confirm("Delete this entry?") && remove(r.id)}>Delete</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {toast.node}
    </div>
  );
}
