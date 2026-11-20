"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { PageHead } from "@/components/PageHead";
import { FileDrop } from "@/components/FileDrop";
import { SaveToVault } from "@/components/SaveToVault";
import { findPii, PII_LABELS, type PiiKind } from "@/lib/pii";
import { baseName, downloadBlob, loadPdfjs } from "@/lib/download";

type Rect = { x: number; y: number; w: number; h: number }; // fractions of page size
type Word = Rect & { str: string };
type Page = { url: string; canvas: HTMLCanvasElement; wPt: number; hPt: number; words: Word[] };
type Box = Rect & { id: string; page: number; manual: boolean; kind?: PiiKind; text?: string };

const KINDS: PiiKind[] = ["email", "phone", "iban", "card", "id", "date", "number", "mrz"];
const MAX_PX = 1600;

function canvasToBlob(c: HTMLCanvasElement, type: string, q?: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Export failed"))), type, q));
}

export default function Redact() {
  const [name, setName] = useState("");
  const [isPdf, setIsPdf] = useState(false);
  const [pages, setPages] = useState<Page[]>([]);
  const [manual, setManual] = useState<Box[]>([]);
  const [off, setOff] = useState<Set<string>>(new Set());
  const [kinds, setKinds] = useState<Set<PiiKind>>(new Set(["email", "phone", "iban", "card", "id", "mrz"]));
  const [words, setWords] = useState("");
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [out, setOut] = useState<{ blob: Blob; name: string } | null>(null);
  const history = useRef<Box[][]>([]);

  useEffect(() => () => pages.forEach((p) => URL.revokeObjectURL(p.url)), [pages]);

  const load = async (file: File) => {
    setErr("");
    setOut(null);
    setManual([]);
    setOff(new Set());
    history.current = [];
    setName(file.name);
    try {
      if (file.type === "application/pdf" || /\.pdf$/i.test(file.name)) {
        setIsPdf(true);
        setBusy("Reading PDF…");
        const pdfjs = await loadPdfjs();
        const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise;
        const list: Page[] = [];
        for (let i = 1; i <= Math.min(doc.numPages, 60); i++) {
          setBusy(`Rendering page ${i} of ${doc.numPages}…`);
          const page = await doc.getPage(i);
          const base = page.getViewport({ scale: 1 });
          const scale = Math.min(2.5, MAX_PX / base.width);
          const vp = page.getViewport({ scale });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(vp.width);
          canvas.height = Math.floor(vp.height);
          await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport: vp }).promise;
          const tc = await page.getTextContent();
          const ws: Word[] = [];
          for (const it of tc.items) {
            if (!("str" in it) || !it.str.trim()) continue;
            const t = pdfjs.Util.transform(vp.transform, it.transform);
            const fh = Math.hypot(t[2], t[3]);
            const x = t[4];
            const y = t[5] - fh;
            const w = it.width * scale;
            ws.push({ str: it.str, x: x / vp.width, y: (y - fh * 0.15) / vp.height, w: w / vp.width, h: (fh * 1.3) / vp.height });
          }
          const url = URL.createObjectURL(await canvasToBlob(canvas, "image/png"));
          list.push({ url, canvas, wPt: base.width, hPt: base.height, words: ws });
        }
        if (doc.numPages > 60) setErr("Only the first 60 pages were loaded.");
        setPages(list);
      } else {
        setIsPdf(false);
        setBusy("Loading image…");
        const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
        const s = Math.min(1, 3000 / Math.max(bmp.width, bmp.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(bmp.width * s);
        canvas.height = Math.round(bmp.height * s);
        canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
        const url = URL.createObjectURL(await canvasToBlob(canvas, "image/png"));
        setPages([{ url, canvas, wPt: canvas.width, hPt: canvas.height, words: [] }]);
      }
    } catch (e) {
      setErr(e instanceof Error && /password/i.test(e.message) ? "This PDF is password-protected. Remove the password first." : "Couldn't open that file. Try a PDF, JPG, PNG or WebP.");
      setPages([]);
    }
    setBusy("");
  };

  // Detected boxes: run the patterns over each page's text, mapping characters back to word boxes.
  const detected = useMemo(() => {
    const res: Box[] = [];
    const ctx = typeof document !== "undefined" ? document.createElement("canvas").getContext("2d") : null;
    if (ctx) ctx.font = "100px Helvetica, Arial, sans-serif";
    const mw = (t: string) => (ctx ? ctx.measureText(t).width : t.length);
    const custom = words.split(",").map((s) => s.trim()).filter((s) => s.length > 1);
    pages.forEach((p, pi) => {
      let text = "";
      const spans: { start: number; end: number; w: Word }[] = [];
      for (const w of p.words) {
        const start = text.length;
        text += w.str;
        spans.push({ start, end: text.length, w });
        text += " ";
      }
      for (const m of findPii(text, kinds, custom)) {
        for (const s of spans) {
          if (s.end <= m.start || s.start >= m.end) continue;
          // Map characters to x positions with proportional glyph widths.
          const full = mw(s.w.str) || 1;
          const i0 = Math.max(0, m.start - s.start);
          const i1 = Math.min(s.w.str.length, m.end - s.start);
          const a = mw(s.w.str.slice(0, i0)) / full;
          const b = mw(s.w.str.slice(0, i1)) / full;
          const padX = s.w.h * 0.15 * (pages[pi].canvas.height / pages[pi].canvas.width);
          res.push({ id: `${pi}:${m.start}:${s.start}`, page: pi, manual: false, kind: m.kind, text: m.text, x: s.w.x + s.w.w * a - padX, y: s.w.y, w: s.w.w * (b - a) + padX * 2, h: s.w.h });
        }
      }
    });
    return res;
  }, [pages, kinds, words]);

  const active = [...detected.filter((b) => !off.has(b.id)), ...manual];
  const textless = pages.length > 0 && isPdf && pages.every((p) => p.words.length === 0);

  const pushHistory = () => {
    history.current.push(manual);
    if (history.current.length > 50) history.current.shift();
  };

  const exportFile = async () => {
    setBusy("Flattening…");
    setErr("");
    try {
      const flat = pages.map((p, pi) => {
        const c = document.createElement("canvas");
        c.width = p.canvas.width;
        c.height = p.canvas.height;
        const ctx = c.getContext("2d")!;
        ctx.drawImage(p.canvas, 0, 0);
        ctx.fillStyle = "#000";
        for (const b of active.filter((x) => x.page === pi)) {
          const pad = 2;
          ctx.fillRect(b.x * c.width - pad, b.y * c.height - pad, b.w * c.width + pad * 2, b.h * c.height + pad * 2);
        }
        return c;
      });
      let blob: Blob;
      let outName: string;
      if (isPdf) {
        const { PDFDocument } = await import("pdf-lib");
        const doc = await PDFDocument.create();
        for (let i = 0; i < flat.length; i++) {
          const jpg = await (await canvasToBlob(flat[i], "image/jpeg", 0.92)).arrayBuffer();
          const img = await doc.embedJpg(jpg);
          const page = doc.addPage([pages[i].wPt, pages[i].hPt]);
          page.drawImage(img, { x: 0, y: 0, width: pages[i].wPt, height: pages[i].hPt });
        }
        doc.setProducer("Sorted redactor");
        doc.setCreator("Sorted redactor");
        blob = new Blob([(await doc.save()) as Uint8Array<ArrayBuffer>], { type: "application/pdf" });
        outName = `${baseName(name)}-redacted.pdf`;
      } else {
        blob = await canvasToBlob(flat[0], "image/png");
        outName = `${baseName(name)}-redacted.png`;
      }
      setOut({ blob, name: outName });
      downloadBlob(blob, outName);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Export failed.");
    }
    setBusy("");
  };

  const kindCounts = useMemo(() => {
    const c: Partial<Record<PiiKind, number>> = {};
    for (const b of detected) if (!off.has(b.id)) c[b.kind!] = (c[b.kind!] ?? 0) + 1;
    return c;
  }, [detected, off]);

  return (
    <div className="wrap">
      <PageHead title="Redactor" lede="Black out ID numbers, bank details, emails and anything else before you send a document. The result is flattened into an image, so the hidden text is gone, not just covered." />
      {!pages.length ? (
        <div className="work wide">
          <FileDrop accept="application/pdf,image/*" onFiles={(f) => load(f[0])} title="Drop a PDF or photo to redact" sub="PDF, JPG, PNG or WebP. It stays on your device." />
          {busy && <p className="muted">{busy}</p>}
          {err && <p className="err">{err}</p>}
          <div className="panel" style={{ marginBottom: 56 }}>
            <h2>How it works</h2>
            <p>For PDFs with text, Sorted finds emails, phone numbers, IBANs, card numbers, ID numbers and passport lines for you, shown in red. Drag on the page to cover anything else. Click a box to remove it.</p>
            <p className="muted" style={{ margin: 0 }}>Photos and scanned PDFs have no text layer, so you draw boxes by hand.</p>
          </div>
        </div>
      ) : (
        <div className="work" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.6fr)" }}>
          <div className="sticky">
            <div className="panel">
              <h2 style={{ overflowWrap: "anywhere" }}>{name}</h2>
              <p className="muted">{pages.length} page{pages.length > 1 ? "s" : ""} · {active.length} box{active.length === 1 ? "" : "es"}</p>
              {isPdf && !textless && (
                <>
                  <label>Find automatically</label>
                  <div className="chips">
                    {KINDS.map((k) => (
                      <button key={k} className="chip" aria-pressed={kinds.has(k)} onClick={() => setKinds((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; })}>
                        {PII_LABELS[k]} {kindCounts[k] ? <span className="pill red">{kindCounts[k]}</span> : null}
                      </button>
                    ))}
                  </div>
                  <label htmlFor="words">Also hide these words</label>
                  <input id="words" value={words} onChange={(e) => setWords(e.target.value)} placeholder="Your name, street, company (comma separated)" />
                </>
              )}
              {textless && <p className="hint">No text layer found (it&apos;s a scan), so draw boxes by dragging on the page.</p>}
              {!isPdf && <p className="hint">Drag on the photo to cover anything you want hidden.</p>}
              <div className="row" style={{ marginTop: 16 }}>
                <button className="btn pri" onClick={exportFile} disabled={!!busy || active.length === 0}>{busy || "Download redacted copy"}</button>
                <button className="btn quiet" disabled={!history.current.length} onClick={() => setManual(history.current.pop() ?? [])}>Undo</button>
              </div>
              <div className="row" style={{ marginTop: 8 }}>
                {out && <SaveToVault blob={out.blob} name={out.name} folder="IDs" />}
                <button className="btn quiet" onClick={() => { setPages([]); setOut(null); }}>Start over</button>
              </div>
              {err && <p className="err" style={{ marginTop: 10 }}>{err}</p>}
            </div>
            {detected.length > 0 && (
              <div className="panel">
                <h3>Found in the text</h3>
                <div style={{ maxHeight: 260, overflowY: "auto" }}>
                  {Array.from(new Map(detected.map((b) => [b.id.split(":").slice(0, 2).join(":"), b])).values()).map((b) => {
                    const ids = detected.filter((d) => d.id.startsWith(b.id.split(":").slice(0, 2).join(":") + ":")).map((d) => d.id);
                    const on = !off.has(ids[0]);
                    return (
                      <label key={b.id} className="check" style={{ margin: "6px 0" }}>
                        <input type="checkbox" checked={on} onChange={() => setOff((s) => { const n = new Set(s); ids.forEach((id) => (on ? n.add(id) : n.delete(id))); return n; })} />
                        <span style={{ overflowWrap: "anywhere" }}><span className="pill">{PII_LABELS[b.kind!]}</span> {b.text} <span className="muted">p.{b.page + 1}</span></span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="pages">
            {pages.map((p, pi) => (
              <PageView
                key={p.url}
                page={p}
                index={pi}
                boxes={active.filter((b) => b.page === pi)}
                onAdd={(r) => { pushHistory(); setManual((m) => [...m, { ...r, id: crypto.randomUUID(), page: pi, manual: true }]); setOut(null); }}
                onRemove={(b) => {
                  if (b.manual) { pushHistory(); setManual((m) => m.filter((x) => x.id !== b.id)); }
                  else setOff((s) => new Set(s).add(b.id));
                  setOut(null);
                }}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PageView({ page, index, boxes, onAdd, onRemove }: { page: Page; index: number; boxes: Box[]; onAdd: (r: Rect) => void; onRemove: (b: Box) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<Rect | null>(null);
  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const rect = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({ x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) });
  return (
    <div>
      <div className="pnum">Page {index + 1}</div>
      <div
        ref={ref}
        className="page"
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).classList.contains("box")) return;
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          start.current = pos(e);
          setDraft({ ...start.current, w: 0, h: 0 });
        }}
        onPointerMove={(e) => start.current && setDraft(rect(start.current, pos(e)))}
        onPointerUp={(e) => {
          if (!start.current) return;
          const r = rect(start.current, pos(e));
          start.current = null;
          setDraft(null);
          if (r.w > 0.006 && r.h > 0.004) onAdd(r);
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={page.url} alt={`Page ${index + 1}`} draggable={false} style={{ display: "block", width: "100%" }} />
        {boxes.map((b) => (
          <div
            key={b.id}
            className={b.manual ? "box" : "box sug"}
            title={b.manual ? "Click to remove" : `${PII_LABELS[b.kind!]}: click to keep visible`}
            style={{ left: `${b.x * 100}%`, top: `${b.y * 100}%`, width: `${b.w * 100}%`, height: `${b.h * 100}%` }}
            onClick={() => onRemove(b)}
          />
        ))}
        {draft && <div className="box draft" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%`, width: `${draft.w * 100}%`, height: `${draft.h * 100}%` }} />}
      </div>
    </div>
  );
}
