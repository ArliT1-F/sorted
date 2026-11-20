// Lossless metadata removal for JPEG and PNG. Other formats are re-encoded by
// the caller through a canvas, which drops all metadata.

/** Removes APP1-APP15 (EXIF, XMP, ICC, Photoshop/IPTC, etc.) and COM segments. Keeps APP0 (JFIF). */
export function stripJpeg(buf: ArrayBuffer): Uint8Array<ArrayBuffer> {
  const d = new Uint8Array(buf);
  if (d[0] !== 0xff || d[1] !== 0xd8) throw new Error("Not a JPEG file");
  const out: Uint8Array[] = [d.subarray(0, 2)];
  let i = 2;
  while (i < d.length) {
    if (d[i] !== 0xff) throw new Error("Corrupt JPEG marker");
    let marker = d[i + 1];
    while (marker === 0xff) {
      i++;
      marker = d[i + 1];
    }
    if (marker === 0xda) {
      // Start of scan: the rest is image data, copy it unchanged.
      out.push(d.subarray(i));
      break;
    }
    if (marker === 0xd9) {
      out.push(d.subarray(i, i + 2));
      break;
    }
    if (marker >= 0xd0 && marker <= 0xd7) {
      out.push(d.subarray(i, i + 2));
      i += 2;
      continue;
    }
    const len = (d[i + 2] << 8) | d[i + 3];
    const seg = d.subarray(i, i + 2 + len);
    const isApp = marker >= 0xe1 && marker <= 0xef;
    const isCom = marker === 0xfe;
    if (!isApp && !isCom) out.push(seg);
    i += 2 + len;
  }
  const total = out.reduce((s, x) => s + x.length, 0);
  const res = new Uint8Array(total);
  let o = 0;
  for (const x of out) {
    res.set(x, o);
    o += x.length;
  }
  return res;
}

/** Reads the EXIF orientation tag (1-8) from a JPEG, or 1 if absent. */
export function jpegOrientation(buf: ArrayBuffer): number {
  const d = new DataView(buf);
  if (d.getUint16(0) !== 0xffd8) return 1;
  let i = 2;
  while (i + 4 < d.byteLength) {
    const marker = d.getUint16(i);
    const len = d.getUint16(i + 2);
    if (marker === 0xffe1 && d.getUint32(i + 4) === 0x45786966) {
      const t = i + 10;
      const le = d.getUint16(t) === 0x4949;
      const ifd = t + d.getUint32(t + 4, le);
      const n = d.getUint16(ifd, le);
      for (let k = 0; k < n; k++) {
        const e = ifd + 2 + k * 12;
        if (d.getUint16(e, le) === 0x0112) return d.getUint16(e + 8, le);
      }
      return 1;
    }
    if (marker === 0xffda) break;
    i += 2 + len;
  }
  return 1;
}

const PNG_DROP = new Set(["tEXt", "iTXt", "zTXt", "eXIf", "tIME", "iCCP"]);

/** Removes text, EXIF, time and ICC chunks from a PNG. */
export function stripPng(buf: ArrayBuffer): Uint8Array<ArrayBuffer> {
  const d = new Uint8Array(buf);
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!sig.every((b, k) => d[k] === b)) throw new Error("Not a PNG file");
  const view = new DataView(buf);
  const out: Uint8Array[] = [d.subarray(0, 8)];
  let i = 8;
  while (i < d.length) {
    const len = view.getUint32(i);
    const type = String.fromCharCode(d[i + 4], d[i + 5], d[i + 6], d[i + 7]);
    const chunk = d.subarray(i, i + 12 + len);
    if (!PNG_DROP.has(type)) out.push(chunk);
    i += 12 + len;
    if (type === "IEND") break;
  }
  const res = new Uint8Array(out.reduce((s, x) => s + x.length, 0));
  let o = 0;
  for (const x of out) {
    res.set(x, o);
    o += x.length;
  }
  return res;
}
