"use client";
import { useState } from "react";
import { PageHead } from "@/components/PageHead";
import { VaultGate } from "@/components/VaultGate";
import { useRecords } from "@/components/useRecords";
import { useToast } from "@/components/FileDrop";
import { copyText } from "@/lib/download";

type Field = { label: string; value: string };
type Card = { section: string; title: string; fields: Field[] };

const TEMPLATES: Record<string, { title: string; fields: string[] }> = {
  Personal: { title: "Personal details", fields: ["Full name", "Date of birth", "Place of birth", "Nationality", "Phone", "Email"] },
  Address: { title: "Home address", fields: ["Street and number", "City", "Postcode", "Country", "Lived here from", "Lived here until"] },
  Job: { title: "Job", fields: ["Employer", "Job title", "Start date", "End date", "Employer address", "Manager name", "Manager contact", "Reason for leaving"] },
  Education: { title: "Education", fields: ["School / university", "Qualification", "Field of study", "Start date", "End date", "Grade"] },
  Reference: { title: "Reference", fields: ["Name", "Relationship", "Company", "Phone", "Email"] },
  Vehicle: { title: "Vehicle", fields: ["Make and model", "Registration plate", "Year", "VIN"] },
  Other: { title: "Other details", fields: ["Label", ""] },
};
const SECTIONS = Object.keys(TEMPLATES);

export default function FormsPage() {
  return (
    <div className="wrap">
      <PageHead account title="Form filler" lede="Store the details every application, rental form and job portal asks for. Type them once, then copy any field with one click." />
      <VaultGate what="the form filler">
        <Forms />
      </VaultGate>
    </div>
  );
}

function Forms() {
  const { items, loading, error, add, update, remove } = useRecords<Card>("forms");
  const [editing, setEditing] = useState<{ id: string | null; card: Card } | null>(null);
  const [q, setQ] = useState("");
  const [sec, setSec] = useState("All");
  const toast = useToast();

  const copy = async (text: string, what: string) => toast.show((await copyText(text)) ? `Copied ${what}` : "Copy blocked, select the text");
  const shown = items.filter((r) => (sec === "All" || r.data.section === sec) && (!q || JSON.stringify(r.data).toLowerCase().includes(q.toLowerCase())));
  const startNew = (s: string) => setEditing({ id: null, card: { section: s, title: TEMPLATES[s].title, fields: TEMPLATES[s].fields.map((l) => ({ label: l, value: "" })) } });

  return (
    <div>
      <div className="panel" style={{ marginBottom: 18 }}>
        <div className="row" style={{ justifyContent: "space-between" }}>
          <strong>Add a card</strong>
          <div className="row">{SECTIONS.map((s) => <button key={s} className="btn small" onClick={() => startNew(s)}>+ {s}</button>)}</div>
        </div>
      </div>
      {editing && (
        <form
          className="panel"
          style={{ marginBottom: 18 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const card = { ...editing.card, fields: editing.card.fields.filter((f) => f.label.trim() || f.value.trim()) };
            if (editing.id) await update(editing.id, card);
            else await add(card);
            setEditing(null);
            toast.show("Saved");
          }}
        >
          <div className="grid2">
            <div><label htmlFor="ct" style={{ marginTop: 0 }}>Card title</label><input id="ct" value={editing.card.title} onChange={(e) => setEditing({ ...editing, card: { ...editing.card, title: e.target.value } })} /></div>
            <div><label htmlFor="cs" style={{ marginTop: 0 }}>Section</label><select id="cs" value={editing.card.section} onChange={(e) => setEditing({ ...editing, card: { ...editing.card, section: e.target.value } })}>{SECTIONS.map((s) => <option key={s}>{s}</option>)}</select></div>
          </div>
          {editing.card.fields.map((f, i) => (
            <div key={i} className="grid2" style={{ alignItems: "end" }}>
              <div><label htmlFor={`l${i}`}>Field</label><input id={`l${i}`} value={f.label} onChange={(e) => { const fields = [...editing.card.fields]; fields[i] = { ...f, label: e.target.value }; setEditing({ ...editing, card: { ...editing.card, fields } }); }} /></div>
              <div className="row" style={{ flexWrap: "nowrap" }}>
                <div style={{ flex: 1 }}>
                  <label htmlFor={`v${i}`}>Value</label>
                  <input id={`v${i}`} value={f.value} onChange={(e) => { const fields = [...editing.card.fields]; fields[i] = { ...f, value: e.target.value }; setEditing({ ...editing, card: { ...editing.card, fields } }); }} />
                </div>
                <button type="button" className="btn small quiet" aria-label="Remove field" onClick={() => setEditing({ ...editing, card: { ...editing.card, fields: editing.card.fields.filter((_, k) => k !== i) } })}>✕</button>
              </div>
            </div>
          ))}
          <div className="row" style={{ marginTop: 14 }}>
            <button type="button" className="btn small" onClick={() => setEditing({ ...editing, card: { ...editing.card, fields: [...editing.card.fields, { label: "", value: "" }] } })}>Add field</button>
            <span style={{ flex: 1 }} />
            <button className="btn pri">Save card</button>
            <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
          </div>
          {error && <p className="err">{error}</p>}
        </form>
      )}
      <div className="row" style={{ marginBottom: 10 }}>
        <input type="search" placeholder="Search everything" aria-label="Search cards" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
      </div>
      <div className="chips" role="group" aria-label="Sections">
        {["All", ...SECTIONS].map((s) => <button key={s} className="chip" aria-pressed={sec === s} onClick={() => setSec(s)}>{s}</button>)}
      </div>
      {loading ? (
        <p className="empty">Decrypting…</p>
      ) : shown.length === 0 ? (
        <p className="empty">{items.length ? "No cards match." : "Start with Personal and your current Address. Job portals and rental applications always ask for these."}</p>
      ) : (
        <div className="cards" style={{ marginBottom: 56 }}>
          {shown.map((r) => (
            <div key={r.id} className="card">
              <div className="row" style={{ justifyContent: "space-between", marginBottom: 6 }}>
                <h3 style={{ margin: 0 }}>{r.data.title}</h3>
                <span className="pill blue">{r.data.section}</span>
              </div>
              {r.data.fields.map((f, i) => (
                <div key={i} className="field">
                  <div><small>{f.label}</small><span>{f.value || <span className="muted">empty</span>}</span></div>
                  {f.value && <button className="btn small quiet" onClick={() => copy(f.value, f.label.toLowerCase())}>Copy</button>}
                </div>
              ))}
              <div className="row" style={{ marginTop: 10 }}>
                <button className="btn small" onClick={() => copy(r.data.fields.filter((f) => f.value).map((f) => `${f.label}: ${f.value}`).join("\n"), "the whole card")}>Copy all</button>
                <button className="btn small quiet" onClick={() => { setEditing({ id: r.id, card: structuredClone(r.data) }); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                <button className="btn small quiet" onClick={() => window.confirm(`Delete ${r.data.title}?`) && remove(r.id)}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {toast.node}
    </div>
  );
}
