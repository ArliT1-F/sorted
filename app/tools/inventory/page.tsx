"use client";
import { useEffect, useMemo, useState } from "react";
import { PageHead } from "@/components/PageHead";
import { VaultGate } from "@/components/VaultGate";
import { useVault } from "@/components/VaultProvider";
import { useRecords } from "@/components/useRecords";
import { useToast } from "@/components/FileDrop";
import { deleteFile, fetchFile, uploadFile } from "@/lib/vault";
import { downloadBlob } from "@/lib/download";

type Thing = { name: string; room: string; category: string; value: number; currency: string; purchased: string; brand: string; serial: string; note: string; files: { id: string; path: string; name: string; type: string }[] };

const ROOMS = ["Living room", "Kitchen", "Bedroom", "Bathroom", "Office", "Hallway", "Garage", "Garden", "Storage"];
const CATS = ["Electronics", "Furniture", "Appliances", "Jewellery", "Clothing", "Art & decor", "Tools", "Sports", "Instruments", "Other"];
const blank = (room = "Living room"): Thing => ({ name: "", room, category: "Electronics", value: 0, currency: "EUR", purchased: "", brand: "", serial: "", note: "", files: [] });

export default function InventoryPage() {
  return (
    <div className="wrap">
      <PageHead account title="Home inventory" lede="A room-by-room record of what you own, with photos, receipts and serial numbers. After a theft, fire or flood, export the list for your insurer in seconds." />
      <VaultGate what="the home inventory">
        <Inventory />
      </VaultGate>
    </div>
  );
}

function useThumb(f?: { path: string; type: string; name: string }) {
  const { key } = useVault();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!f || !f.type.startsWith("image/") || !key) return;
    let u: string | null = null;
    let live = true;
    fetchFile(key, { path: f.path, meta: { name: f.name, type: f.type, size: 0, folder: "Home" } }).then((b) => {
      u = URL.createObjectURL(b);
      if (live) setUrl(u);
    }).catch(() => {});
    return () => {
      live = false;
      if (u) URL.revokeObjectURL(u);
    };
  }, [f, key]);
  return url;
}

function Thumb({ f }: { f: Thing["files"][number] }) {
  const url = useThumb(f);
  // eslint-disable-next-line @next/next/no-img-element
  return url ? <img src={url} alt={f.name} /> : <span className="pill">{f.type.startsWith("image/") ? "…" : "PDF"}</span>;
}

function Inventory() {
  const { key, user } = useVault();
  const { items, loading, error, add, update, remove } = useRecords<Thing>("inventory");
  const [form, setForm] = useState<Thing>(blank());
  const [editing, setEditing] = useState<string | null>(null);
  const [room, setRoom] = useState("All");
  const [busy, setBusy] = useState("");
  const toast = useToast();

  const byRoom = useMemo(() => {
    const m = new Map<string, { n: number; v: Record<string, number> }>();
    for (const r of items) {
      const e = m.get(r.data.room) ?? { n: 0, v: {} };
      e.n++;
      e.v[r.data.currency] = (e.v[r.data.currency] ?? 0) + (r.data.value || 0);
      m.set(r.data.room, e);
    }
    return m;
  }, [items]);
  const totals = useMemo(() => {
    const t: Record<string, number> = {};
    for (const r of items) t[r.data.currency] = (t[r.data.currency] ?? 0) + (r.data.value || 0);
    return t;
  }, [items]);
  const missingProof = items.filter((r) => r.data.files.length === 0).length;
  const shown = items.filter((r) => room === "All" || r.data.room === room).sort((a, b) => b.data.value - a.data.value);
  const rooms = Array.from(new Set([...ROOMS, ...items.map((r) => r.data.room)]));
  const set = <K extends keyof Thing>(k: K, v: Thing[K]) => setForm((f) => ({ ...f, [k]: v }));

  const attach = async (files: FileList | null) => {
    if (!files) return;
    for (const file of Array.from(files)) {
      setBusy(`Encrypting ${file.name}…`);
      try {
        const vf = await uploadFile(key!, user!.id, file, { name: file.name, type: file.type, size: file.size, folder: "Home", note: form.name });
        setForm((f) => ({ ...f, files: [...f.files, { id: vf.id, path: vf.path, name: file.name, type: file.type }] }));
      } catch {
        toast.show(`Couldn't upload ${file.name}`);
      }
    }
    setBusy("");
  };

  const exportCsv = () => {
    const esc = (s: string | number) => `"${String(s).replace(/"/g, '""')}"`;
    const rows = [["Item", "Room", "Category", "Brand / model", "Serial number", "Purchased", "Value", "Currency", "Photos/receipts", "Note"]];
    for (const r of items) {
      const d = r.data;
      rows.push([d.name, d.room, d.category, d.brand, d.serial, d.purchased, String(d.value || ""), d.currency, String(d.files.length), d.note]);
    }
    downloadBlob(new Blob(["﻿" + rows.map((r) => r.map(esc).join(",")).join("\r\n")], { type: "text/csv" }), `home-inventory-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <div className="work">
      <form
        className="panel sticky noprint"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.name.trim()) return;
          if (editing) await update(editing, form);
          else await add(form);
          toast.show(editing ? "Saved" : "Added");
          setEditing(null);
          setForm(blank(form.room));
        }}
      >
        <h2>{editing ? "Edit item" : "Add an item"}</h2>
        <label htmlFor="nm">Item</label>
        <input id="nm" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="65-inch TV, sofa, laptop" required />
        <div className="grid2">
          <div><label htmlFor="rm">Room</label><input id="rm" list="rooms" value={form.room} onChange={(e) => set("room", e.target.value)} /></div>
          <div><label htmlFor="ca">Type</label><select id="ca" value={form.category} onChange={(e) => set("category", e.target.value)}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <datalist id="rooms">{rooms.map((r) => <option key={r} value={r} />)}</datalist>
        <div className="grid2">
          <div><label htmlFor="va">Value (to replace)</label><input id="va" type="number" min="0" step="1" inputMode="decimal" value={form.value || ""} onChange={(e) => set("value", Number(e.target.value))} /></div>
          <div><label htmlFor="cu">Currency</label><select id="cu" value={form.currency} onChange={(e) => set("currency", e.target.value)}>{["EUR", "ALL", "USD", "GBP", "CHF"].map((c) => <option key={c}>{c}</option>)}</select></div>
        </div>
        <div className="grid2">
          <div><label htmlFor="br">Brand / model</label><input id="br" value={form.brand} onChange={(e) => set("brand", e.target.value)} /></div>
          <div><label htmlFor="pu">Bought</label><input id="pu" type="month" value={form.purchased} onChange={(e) => set("purchased", e.target.value)} /></div>
        </div>
        <label htmlFor="se">Serial number</label>
        <input id="se" value={form.serial} onChange={(e) => set("serial", e.target.value)} placeholder="Helps police and insurers" />
        <label htmlFor="ph">Photos and receipt</label>
        <input id="ph" type="file" accept="image/*,application/pdf" multiple onChange={(e) => { attach(e.target.files); e.target.value = ""; }} />
        {busy && <p className="hint">{busy}</p>}
        {form.files.length > 0 && (
          <div className="thumbs">
            {form.files.map((f) => (
              <button type="button" key={f.id} className="btn quiet small" title="Remove" onClick={async () => { await deleteFile(f); set("files", form.files.filter((x) => x.id !== f.id)); }}>
                {f.name.slice(0, 18)} ✕
              </button>
            ))}
          </div>
        )}
        <label htmlFor="no">Note</label>
        <input id="no" value={form.note} onChange={(e) => set("note", e.target.value)} />
        <div className="row" style={{ marginTop: 16 }}>
          <button className="btn pri" disabled={!!busy}>{editing ? "Save changes" : "Add item"}</button>
          {editing && <button type="button" className="btn" onClick={() => { setEditing(null); setForm(blank()); }}>Cancel</button>}
        </div>
        {error && <p className="err">{error}</p>}
      </form>
      <div>
        <div className="stats">
          {Object.keys(totals).length ? Object.entries(totals).map(([c, v]) => <div key={c} className="stat"><b>{Math.round(v).toLocaleString()} {c}</b><span>total value</span></div>) : <div className="stat"><b>0</b><span>total value</span></div>}
          <div className="stat"><b>{items.length}</b><span>items</span></div>
          <div className="stat"><b style={{ color: missingProof ? "var(--amber)" : undefined }}>{missingProof}</b><span>without photo or receipt</span></div>
        </div>
        <div className="row noprint" style={{ marginBottom: 6 }}>
          <button className="btn small" onClick={exportCsv} disabled={!items.length}>Export spreadsheet (CSV)</button>
          <button className="btn small quiet" onClick={() => window.print()} disabled={!items.length}>Print list</button>
        </div>
        <div className="chips noprint" role="group" aria-label="Rooms">
          <button className="chip" aria-pressed={room === "All"} onClick={() => setRoom("All")}>All rooms</button>
          {Array.from(byRoom.keys()).map((r) => (
            <button key={r} className="chip" aria-pressed={room === r} onClick={() => setRoom(r)}>{r} <span className="pill">{byRoom.get(r)!.n}</span></button>
          ))}
        </div>
        {loading ? (
          <p className="empty">Decrypting…</p>
        ) : shown.length === 0 ? (
          <p className="empty">Start with the expensive things: TV, laptop, phone, bike, jewellery. A photo of each plus its receipt is all an insurer needs.</p>
        ) : (
          <ul className="list">
            {shown.map((r) => {
              const d = r.data;
              return (
                <li key={r.id}>
                  <div>
                    <div className="t">{d.name} <span className="pill">{d.room}</span></div>
                    <div className="m">
                      {[d.category, d.brand, d.purchased && `bought ${d.purchased}`, d.serial && `S/N ${d.serial}`].filter(Boolean).join(" · ")}
                    </div>
                    {d.files.length > 0 && <div className="thumbs">{d.files.slice(0, 4).map((f) => <Thumb key={f.id} f={f} />)}</div>}
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 800, fontSize: 18, whiteSpace: "nowrap" }}>{d.value ? `${d.value.toLocaleString()} ${d.currency}` : "No value"}</div>
                    <div className="row noprint" style={{ justifyContent: "flex-end", marginTop: 6 }}>
                      <button className="btn small quiet" onClick={() => { setEditing(r.id); setForm(d); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Edit</button>
                      <button className="btn small quiet" onClick={async () => { if (!window.confirm(`Delete ${d.name} and its photos?`)) return; for (const f of d.files) await deleteFile(f).catch(() => {}); await remove(r.id); }}>Delete</button>
                    </div>
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
