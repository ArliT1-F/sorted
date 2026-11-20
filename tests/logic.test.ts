import { test } from "node:test";
import assert from "node:assert/strict";
import * as C from "../lib/crypto.ts";
import { findPii } from "../lib/pii.ts";
import { checkMessage, analyzeLink } from "../lib/scam.ts";
import { readContract, splitClauses } from "../lib/contract.ts";
import { stripJpeg, stripPng, jpegOrientation } from "../lib/metadata.ts";
import { computeSplit, allocate } from "../lib/split.ts";

test("crypto roundtrip, wrong passphrase fails, recovery works", async () => {
  const raw = C.newRawKey();
  const w = await C.wrapRawKey(raw, "correct horse battery", 1000);
  const code = C.newRecoveryCode();
  const r = await C.wrapRawKey(raw, C.normalizeRecoveryCode(code), 1000);
  assert.deepEqual(await C.unwrapRawKey(w, "correct horse battery"), raw);
  await assert.rejects(C.unwrapRawKey(w, "wrong"));
  assert.deepEqual(await C.unwrapRawKey(r, C.normalizeRecoveryCode(code.toLowerCase().replace(/-/g, " "))), raw);
  const key = await C.importDataKey(raw);
  const e = await C.encryptJSON(key, { a: 1, s: "ë€" });
  assert.deepEqual(await C.decryptJSON(key, e.iv, e.ciphertext), { a: 1, s: "ë€" });
  const b = await C.encryptBytes(key, new Uint8Array([1, 2, 3]).buffer);
  assert.deepEqual(new Uint8Array(await C.decryptBytes(key, b.buffer)), new Uint8Array([1, 2, 3]));
  assert.match(code, /^([A-Z2-9]{5}-){4}[A-Z2-9]{5}$/);
});

test("pii", () => {
  const all = new Set(["email","phone","iban","card","date","id","number","mrz"] as const);
  const t = "Arben Hoxha, J12345678A, arben@mail.al, +355 69 123 4567, IBAN AL47 2121 1009 0000 0002 3569 8741, card 4111 1111 1111 1111, born 03/04/1990, P<ALBHOXHA<<ARBEN<<<<<<<<<";
  const kinds = findPii(t, all as any, ["Hoxha"]).map(m => m.kind);
  for (const k of ["custom","id","email","phone","iban","card","date","mrz"]) assert.ok(kinds.includes(k as any), k + " in " + kinds);
});

test("scam", () => {
  const bad = checkMessage("URGENT: Your PayPal account has been suspended. Verify within 24 hours at http://paypa1-secure-login.xyz/verify or enter your one-time code.");
  assert.equal(bad.level, "high");
  assert.ok(bad.links[0].flags.some(f => f.includes("Paypal")), JSON.stringify(bad.links));
  const ok = checkMessage("Hey, are we still meeting for coffee on Saturday at 10? See https://www.google.com/maps");
  assert.equal(ok.level, "low", JSON.stringify(ok));
  assert.equal(analyzeLink("https://www.paypal.com/signin").flags.length, 0);
  assert.ok(analyzeLink("bit.ly/abc").flags.length > 0);
});

test("contract", () => {
  const t = "1. Term. This agreement has a minimum term of 12 months and renews automatically for successive 12 month periods.\n2. Either party may cancel with 30 days' written notice. An early termination fee of €150 applies.\nLate payment incurs interest at 8% per year. We may change these terms at our sole discretion. Disputes are resolved by binding arbitration, e.g. in Tirana.";
  const r = readContract(t);
  for (const c of ["renewal","notice","lockin","fees","penalty","changes","dispute"]) assert.ok(r.byCat[c].length, c);
  assert.ok(r.figures.some(f => f.text.includes("150")));
  assert.ok(r.figures.some(f => f.kind === "percent"));
  const cl = splitClauses(t);
  for (const c of cl) assert.equal(t.slice(c.start, c.end), c.text);
  assert.ok(cl.some(c => c.text.includes("e.g. in Tirana")));
});

test("jpeg/png strip", () => {
  // SOI, APP0, APP1(Exif w/ orientation 6), COM, DQT, SOS ... EOI
  const exif = [0x45,0x78,0x69,0x66,0,0, 0x4d,0x4d,0,0x2a,0,0,0,8, 0,1, 0x01,0x12,0,3,0,0,0,1,0,6,0,0, 0,0,0,0];
  const app1 = [0xff,0xe1,0,exif.length+2,...exif];
  const jpg = new Uint8Array([0xff,0xd8, 0xff,0xe0,0,4,1,2, ...app1, 0xff,0xfe,0,4,9,9, 0xff,0xdb,0,4,7,7, 0xff,0xda,0,2,5,5,5,0xff,0xd9]);
  assert.equal(jpegOrientation(jpg.buffer), 6);
  const s = stripJpeg(jpg.buffer);
  assert.deepEqual([...s], [0xff,0xd8,0xff,0xe0,0,4,1,2,0xff,0xdb,0,4,7,7,0xff,0xda,0,2,5,5,5,0xff,0xd9]);
  const chunk = (t: string, data: number[]) => { const l=data.length; return [0,0,(l>>8)&255,l&255,...[...t].map(c=>c.charCodeAt(0)),...data,1,2,3,4]; };
  const png = new Uint8Array([137,80,78,71,13,10,26,10, ...chunk("IHDR",[1,2]), ...chunk("tEXt",[65]), ...chunk("IDAT",[9]), ...chunk("IEND",[])]);
  const p = stripPng(png.buffer);
  assert.equal(p.length, png.length - 13);
});

test("split", () => {
  assert.deepEqual(allocate(100, [1,1,1]), [33.34,33.33,33.33]);
  const lines = computeSplit({ name:"x", rent: 900, method:"hybrid", commonShare: 40, currency:"EUR",
    people:[{id:"a",name:"A",room:15,income:0,extras:50,occupants:1},{id:"b",name:"B",room:10,income:0,extras:0,occupants:2}],
    bills:[{id:"e",name:"Power",amount:90,split:"occupants"}] });
  const tot = lines.reduce((s,l)=>s+l.total,0);
  assert.equal(Math.round(tot*100)/100, 990);
  assert.equal(lines[1].bills, 60);
});
