"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHead } from "@/components/PageHead";
import { VaultGate } from "@/components/VaultGate";
import { useVault } from "@/components/VaultProvider";
import { FileDrop, useToast } from "@/components/FileDrop";
import { FOLDERS, deleteFile, fetchFile, listFiles, updateFileMeta, uploadFile, type VaultFile } from "@/lib/vault";
import { downloadBlob, formatBytes } from "@/lib/download";

export default function VaultPage() {
  return (
    <div className="wrap">
      <PageHead account title="Document vault" lede="Scans of IDs, contracts, receipts and policies in one place. Each file is encrypted on this device before upload, so only you can open it." />
      <VaultGate what="the document vault">
        <Vault />
      </VaultGate>
    </div>
  );
}

function Vault() {
  const { key, user } = useVault();
  const [files, setFiles] = useState<VaultFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [folder, setFolder] = useState("All");
  const [upFolder, setUpFolder] = useState("IDs");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; f: VaultFile } | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      setFiles(await listFiles(key!));
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load files.");
    } finally {
      setLoading(false);
    }
  }, [key]);
  useEffect(() => {
    load();
  }, [load]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);

  const shown = useMemo(
    () => files.filter((f) => (folder === "All" || f.meta.folder === folder) && (!q || (f.meta.name + " " + (f.meta.note ?? "")).toLowerCase().includes(q.toLowerCase()))),
    [files, folder, q],
  );
  const counts = useMemo(() => Object.fromEntries(FOLDERS.map((x) => [x, files.filter((f) => f.meta.folder === x).length])), [files]);
  const total = files.reduce((s, f) => s + f.meta.size, 0);

  const upload = async (list: File[]) => {
    setErr("");
    for (const file of list) {
      if (file.size > 50 * 1024 * 1024) {
        setErr(`${file.name} is over 50 MB.`);
        continue;
      }
      setBusy(`Encrypting ${file.name}…`);
      try {
        const f = await uploadFile(key!, user!.id, file, { name: file.name, type: file.type, size: file.size, folder: upFolder });
        setFiles((x) => [f, ...x]);
      } catch (e) {
        setErr(e instanceof Error ? e.message : `Could not upload ${file.name}.`);
      }
    }
    setBusy(null);
    toast.show(list.length === 1 ? "Saved and encrypted" : `${list.length} files saved`);
  };

  const open = async (f: VaultFile, download: boolean) => {
    setBusy(`Decrypting ${f.meta.name}…`);
    try {
      const blob = await fetchFile(key!, f);
      if (download || !/^(image\/|application\/pdf)/.test(f.meta.type)) downloadBlob(blob, f.meta.name);
      else setPreview({ url: URL.createObjectURL(blob), f });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not open the file.");
    }
    setBusy(null);
  };

  return (
    <div className="work">
      <div className="sticky">
        <div className="panel">
          <h2>Add documents</h2>
          <label htmlFor="uf">Put in folder</label>
          <select id="uf" value={upFolder} onChange={(e) => setUpFolder(e.target.value)}>
            {FOLDERS.map((x) => <option key={x}>{x}</option>)}
          </select>
          <div style={{ marginTop: 12 }}>
            <FileDrop multiple onFiles={upload} title="Drop scans, PDFs or photos" sub="Up to 50 MB each. Encrypted before upload." />
          </div>
          {busy && <p className="muted" style={{ marginTop: 10 }}>{busy}</p>}
          {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
        </div>
        <div className="panel">
          <div className="stats" style={{ marginBottom: 0 }}>
            <div className="stat"><b>{files.length}</b><span>documents</span></div>
            <div className="stat"><b>{formatBytes(total)}</b><span>stored</span></div>
          </div>
        </div>
      </div>
      <div>
        {preview && (
          <div className="panel" style={{ marginBottom: 16 }}>
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <strong>{preview.f.meta.name}</strong>
              <div className="row">
                <button className="btn small" onClick={() => open(preview.f, true)}>Download</button>
                <button className="btn small" onClick={() => setPreview(null)}>Close</button>
              </div>
            </div>
            {preview.f.meta.type.startsWith("image/") ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.url} alt={preview.f.meta.name} style={{ borderRadius: 8 }} />
            ) : (
              <iframe src={preview.url} title={preview.f.meta.name} style={{ width: "100%", height: "70vh", border: 0, borderRadius: 8 }} />
            )}
          </div>
        )}
        <div className="chips" role="group" aria-label="Folders">
          {["All", ...FOLDERS].map((x) => (
            <button key={x} className="chip" aria-pressed={folder === x} onClick={() => setFolder(x)}>
              {x} {x !== "All" && counts[x] ? <span className="pill">{counts[x]}</span> : null}
            </button>
          ))}
        </div>
        <input type="search" placeholder="Search names and notes" aria-label="Search documents" value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 12 }} />
        {loading ? (
          <p className="empty">Decrypting your list…</p>
        ) : shown.length === 0 ? (
          <p className="empty">{files.length ? "Nothing in this folder." : "No documents yet. Start with your passport or ID card scan."}</p>
        ) : (
          <ul className="list">
            {shown.map((f) => (
              <FileRow
                key={f.id}
                f={f}
                onOpen={() => open(f, false)}
                onDownload={() => open(f, true)}
                onSave={async (meta) => {
                  await updateFileMeta(key!, f.id, meta);
                  setFiles((x) => x.map((y) => (y.id === f.id ? { ...y, meta } : y)));
                }}
                onDelete={async () => {
                  if (!window.confirm(`Delete ${f.meta.name}? This can't be undone.`)) return;
                  await deleteFile(f);
                  setFiles((x) => x.filter((y) => y.id !== f.id));
                  toast.show("Deleted");
                }}
              />
            ))}
          </ul>
        )}
      </div>
      {toast.node}
    </div>
  );
}

function FileRow({ f, onOpen, onDownload, onSave, onDelete }: { f: VaultFile; onOpen: () => void; onDownload: () => void; onSave: (m: VaultFile["meta"]) => Promise<void>; onDelete: () => void }) {
  const [edit, setEdit] = useState(false);
  const [name, setName] = useState(f.meta.name);
  const [folder, setFolder] = useState(f.meta.folder);
  const [note, setNote] = useState(f.meta.note ?? "");
  if (edit)
    return (
      <li style={{ display: "block" }}>
        <div className="grid2">
          <div><label htmlFor={`n-${f.id}`}>Name</label><input id={`n-${f.id}`} value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label htmlFor={`f-${f.id}`}>Folder</label><select id={`f-${f.id}`} value={folder} onChange={(e) => setFolder(e.target.value)}>{FOLDERS.map((x) => <option key={x}>{x}</option>)}</select></div>
        </div>
        <label htmlFor={`o-${f.id}`}>Note</label>
        <input id={`o-${f.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. expires 2031, original in the blue folder" />
        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn small pri" onClick={async () => { await onSave({ ...f.meta, name: name.trim() || f.meta.name, folder, note }); setEdit(false); }}>Save</button>
          <button className="btn small" onClick={() => setEdit(false)}>Cancel</button>
        </div>
      </li>
    );
  return (
    <li>
      <div>
        <div className="t">{f.meta.name} <span className="pill blue">{f.meta.folder}</span></div>
        <div className="m">{formatBytes(f.meta.size)} · added {new Date(f.created_at).toLocaleDateString()}{f.meta.note ? ` · ${f.meta.note}` : ""}</div>
      </div>
      <div className="row">
        <button className="btn small" onClick={onOpen}>Open</button>
        <button className="btn small quiet" onClick={onDownload}>Download</button>
        <button className="btn small quiet" onClick={() => setEdit(true)}>Edit</button>
        <button className="btn small quiet" onClick={onDelete} aria-label={`Delete ${f.meta.name}`}>Delete</button>
      </div>
    </li>
  );
}
