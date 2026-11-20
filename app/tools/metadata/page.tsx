"use client";
import { useEffect, useState } from "react";
import { PageHead } from "@/components/PageHead";
import { FileDrop } from "@/components/FileDrop";
import { SaveToVault } from "@/components/SaveToVault";
import { stripJpeg, stripPng, jpegOrientation } from "@/lib/metadata";
import { baseName, downloadBlob, formatBytes } from "@/lib/download";

type Found = { label: string; value: string; risky?: boolean }[];
type Item = { id: string; file: File; url: string; found: Found; gps?: { lat: number; lon: number }; clean?: Blob; cleanName?: string; method?: string; left?: number; err?: string };

async function readMeta(file: File): Promise<{ found: Found; gps?: { lat: number; lon: number } }> {
  const exifr = (await import("exifr")).default;
  let tags: Record<string, unknown> | undefined;
  try {
    tags = await exifr.parse(file, { tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: false, mergeOutput: true, translateValues: true });
  } catch {
    tags = undefined;
  }
  const found: Found = [];
  let gps: { lat: number; lon: number } | undefined;
  if (!tags) return { found };
  const t = tags as Record<string, unknown>;
  if (typeof t.latitude === "number" && typeof t.longitude === "number") {
    gps = { lat: t.latitude, lon: t.longitude };
    found.push({ label: "Location", value: `${t.latitude.toFixed(5)}, ${t.longitude.toFixed(5)}`, risky: true });
  }
  const date = t.DateTimeOriginal ?? t.CreateDate ?? t.ModifyDate;
  if (date) found.push({ label: "Taken", value: date instanceof Date ? date.toLocaleString() : String(date) });
  if (t.Make || t.Model) found.push({ label: "Device", value: [t.Make, t.Model].filter(Boolean).join(" "), risky: false });
  if (t.LensModel) found.push({ label: "Lens", value: String(t.LensModel) });
  if (t.Software) found.push({ label: "Software", value: String(t.Software) });
  for (const k of ["Artist", "Copyright", "OwnerName", "CameraOwnerName", "Creator", "By-line", "BodySerialNumber", "SerialNumber"]) {
    if (t[k]) found.push({ label: k.replace(/([a-z])([A-Z])/g, "$1 $2"), value: String(t[k]), risky: true });
  }
  if (t.GPSAltitude) found.push({ label: "Altitude", value: `${Math.round(Number(t.GPSAltitude))} m` });
  const shown = new Set(["latitude", "longitude", "DateTimeOriginal", "CreateDate", "ModifyDate", "Make", "Model", "LensModel", "Software", "GPSAltitude"]);
  const other = Object.keys(t).filter((k) => !shown.has(k)).length;
  if (other) found.push({ label: "Other tags", value: `${other} more technical fields` });
  return { found, gps };
}

async function reencode(file: File, type: "image/jpeg" | "image/png"): Promise<Blob> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const c = document.createElement("canvas");
  c.width = bmp.width;
  c.height = bmp.height;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Encode failed"))), type, 0.95));
}

async function clean(file: File): Promise<{ blob: Blob; name: string; method: string }> {
  const buf = await file.arrayBuffer();
  const isJpg = /jpe?g$/i.test(file.type) || /\.jpe?g$/i.test(file.name);
  const isPng = file.type === "image/png" || /\.png$/i.test(file.name);
  if (isJpg) {
    if (jpegOrientation(buf) === 1) return { blob: new Blob([stripJpeg(buf)], { type: "image/jpeg" }), name: `${baseName(file.name)}-clean.jpg`, method: "Lossless: image data untouched" };
    return { blob: await reencode(file, "image/jpeg"), name: `${baseName(file.name)}-clean.jpg`, method: "Re-saved at 95% quality to keep it upright" };
  }
  if (isPng) return { blob: new Blob([stripPng(buf)], { type: "image/png" }), name: `${baseName(file.name)}-clean.png`, method: "Lossless: image data untouched" };
  return { blob: await reencode(file, "image/jpeg"), name: `${baseName(file.name)}-clean.jpg`, method: "Converted to JPEG (95% quality)" };
}

export default function Metadata() {
  const [items, setItems] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => items.forEach((i) => URL.revokeObjectURL(i.url)), [items]);

  const add = async (files: File[]) => {
    setBusy(true);
    const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(jpe?g|png|webp|heic|heif|tiff?)$/i.test(f.name));
    const next: Item[] = [];
    for (const file of imgs) {
      const id = crypto.randomUUID();
      const { found, gps } = await readMeta(file);
      let it: Item = { id, file, url: URL.createObjectURL(file), found, gps };
      try {
        const c = await clean(file);
        const after = await readMeta(new File([c.blob], c.name, { type: c.blob.type }));
        it = { ...it, clean: c.blob, cleanName: c.name, method: c.method, left: after.found.length };
      } catch {
        it.err = /heic|heif/i.test(file.name) ? "This browser can't open HEIC photos. On iPhone, set Camera → Formats → Most Compatible, or share the photo as JPEG." : "Couldn't clean this file.";
      }
      next.push(it);
    }
    setItems((x) => [...next, ...x]);
    setBusy(false);
  };

  const withGps = items.filter((i) => i.gps).length;

  return (
    <div className="wrap">
      <PageHead title="Photo cleaner" lede="Photos from phones usually record exactly where they were taken, plus the phone model and time. See what yours give away, then download clean copies to post, sell or send." />
      <div className="work" style={{ gridTemplateColumns: "minmax(0,1fr) minmax(0,1.5fr)" }}>
        <div className="sticky">
          <FileDrop multiple accept="image/*" onFiles={add} title="Drop photos to check" sub="JPG, PNG, WebP. Several at once is fine." />
          {busy && <p className="muted" style={{ marginTop: 10 }}>Checking…</p>}
          {items.length > 0 && (
            <div className="panel" style={{ marginTop: 16 }}>
              <div className="stats" style={{ marginBottom: 12 }}>
                <div className="stat"><b>{items.length}</b><span>photos</span></div>
                <div className="stat"><b style={{ color: withGps ? "var(--red)" : undefined }}>{withGps}</b><span>show a location</span></div>
              </div>
              <div className="row">
                <button className="btn pri" onClick={() => items.forEach((i, k) => i.clean && setTimeout(() => downloadBlob(i.clean!, i.cleanName!), k * 300))}>Download all clean</button>
                <button className="btn quiet" onClick={() => setItems([])}>Clear</button>
              </div>
            </div>
          )}
          <p className="hint" style={{ marginTop: 14 }}>Most social networks strip location when you post, but messaging apps, email, marketplaces and file sharing often don&apos;t.</p>
        </div>
        <div>
          {items.length === 0 ? (
            <div className="panel"><p className="empty" style={{ padding: "40px 0" }}>Your photos and what they reveal appear here.</p></div>
          ) : (
            items.map((i) => (
              <div key={i.id} className="photo">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={i.url} alt="" />
                <div>
                  <div className="t" style={{ fontWeight: 700, overflowWrap: "anywhere" }}>
                    {i.file.name} <span className="muted" style={{ fontWeight: 400, fontSize: 14 }}>{formatBytes(i.file.size)}</span>
                  </div>
                  {i.found.length === 0 ? (
                    <p className="ok" style={{ margin: "6px 0" }}>No hidden data found.</p>
                  ) : (
                    <dl className="kv">
                      {i.found.map((f) => (
                        <div key={f.label} style={{ display: "contents" }}>
                          <dt>{f.label}</dt>
                          <dd style={f.risky ? { color: "var(--red)", fontWeight: 600 } : undefined}>
                            {f.value}
                            {f.label === "Location" && i.gps && (
                              <> · <a href={`https://www.openstreetmap.org/?mlat=${i.gps.lat}&mlon=${i.gps.lon}#map=17/${i.gps.lat}/${i.gps.lon}`} target="_blank" rel="noreferrer">see on map</a></>
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  {i.err && <p className="err">{i.err}</p>}
                  {i.clean && (
                    <>
                      <p className="hint" style={{ margin: "4px 0 8px" }}>
                        Clean copy {formatBytes(i.clean.size)} · {i.method} · {i.left === 0 ? <span className="ok">verified: nothing left</span> : `${i.left} field(s) remain`}
                      </p>
                      <div className="row">
                        <button className="btn small pri" onClick={() => downloadBlob(i.clean!, i.cleanName!)}>Download clean</button>
                        <SaveToVault blob={i.clean} name={i.cleanName!} folder="Photos" />
                      </div>
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
