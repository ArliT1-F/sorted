// Patterns for personal data that people usually want to black out before
// sending a document. Used by the redactor to suggest boxes.

export type PiiKind = "email" | "phone" | "iban" | "card" | "date" | "id" | "number" | "mrz" | "custom";

export type PiiMatch = { kind: PiiKind; start: number; end: number; text: string };

export const PII_LABELS: Record<PiiKind, string> = {
  email: "Email",
  phone: "Phone",
  iban: "IBAN / account",
  card: "Card number",
  date: "Date",
  id: "ID number",
  number: "Long number",
  mrz: "Passport machine line",
  custom: "Your words",
};

function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48;
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const RULES: { kind: PiiKind; re: RegExp; test?: (m: string) => boolean }[] = [
  { kind: "mrz", re: /[A-Z0-9<]{2,}<<[A-Z0-9<]{5,}/g },
  { kind: "email", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  { kind: "iban", re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,4})?\b/g },
  {
    kind: "card",
    re: /\b(?:\d[ -]?){12,18}\d\b/g,
    test: (m) => {
      const d = m.replace(/\D/g, "");
      return d.length >= 13 && d.length <= 19 && luhn(d);
    },
  },
  { kind: "phone", re: /(?:\+|00)\d{1,3}[\s.-]?(?:\(?\d{1,4}\)?[\s.-]?){2,5}\d{2,4}|\b0\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}\b/g },
  { kind: "date", re: /\b(?:0?[1-9]|[12]\d|3[01])[./-](?:0?[1-9]|1[0-2])[./-](?:19|20)\d{2}\b|\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g },
  // Letter + 8 digits + letter (e.g. Albanian personal number), and common passport/ID shapes.
  { kind: "id", re: /\b[A-Z]\d{8}[A-Z]\b|\b[A-Z]{1,2}\d{6,9}\b/g },
  { kind: "number", re: /\b\d{6,}\b/g },
];

export function findPii(text: string, enabled: Set<PiiKind>, custom: string[] = []): PiiMatch[] {
  const out: PiiMatch[] = [];
  const taken: [number, number][] = [];
  const overlaps = (s: number, e: number) => taken.some(([a, b]) => s < b && e > a);
  const push = (kind: PiiKind, s: number, e: number) => {
    if (e <= s || overlaps(s, e)) return;
    taken.push([s, e]);
    out.push({ kind, start: s, end: e, text: text.slice(s, e) });
  };
  const mrz = RULES[0];
  if (enabled.has("mrz")) for (const m of text.matchAll(mrz.re)) push("mrz", m.index!, m.index! + m[0].length);
  for (const r of RULES.slice(1)) {
    if (!enabled.has(r.kind)) continue;
    for (const m of text.matchAll(r.re)) {
      if (r.test && !r.test(m[0])) continue;
      push(r.kind, m.index!, m.index! + m[0].length);
    }
  }
  // Custom words run last so they never block a fuller built-in match (e.g. a name inside an email).
  for (const w of custom.map((c) => c.trim()).filter(Boolean)) {
    const re = new RegExp(w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    for (const m of text.matchAll(re)) push("custom", m.index!, m.index! + m[0].length);
  }
  return out.sort((a, b) => a.start - b.start);
}
