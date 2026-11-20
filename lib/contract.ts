// Finds the clauses people most often regret not reading: renewals, notice
// periods, fees, penalties, lock-ins, liability, disputes, data sharing.

export type Category = { id: string; title: string; why: string; tone: "warn" | "info"; re: RegExp };

export const CATEGORIES: Category[] = [
  { id: "renewal", title: "Automatic renewal", tone: "warn", why: "It keeps running (and charging) unless you act.",
    re: /\b(auto(?:matically)?[- ]?renew\w*|renew(?:s|ed)? automatically|tacit(?:ly)? renew\w*|rolling (?:basis|contract)|continue(?:s)? (?:on a )?month[- ]to[- ]month|unless (?:either party|you) (?:gives?|provides?) notice)\b/i },
  { id: "notice", title: "Cancellation and notice", tone: "warn", why: "How and when you can get out.",
    re: /\b(cancel\w*|terminat\w* (?:this|the) (?:agreement|contract)|notice period|(?:written|prior) notice|give notice|days'? notice|months'? notice)\b/i },
  { id: "lockin", title: "Minimum term or lock-in", tone: "warn", why: "You may owe money if you leave early.",
    re: /\b(minimum (?:term|period|contract)|fixed[- ]term|lock[- ]in|initial term|early (?:termination|exit|cancellation)|remaining (?:term|months|payments))\b/i },
  { id: "fees", title: "Fees and charges", tone: "info", why: "Everything you'll pay beyond the headline price.",
    re: /\b(fees?|charges?|surcharge|administration|admin cost|service charge|commission|deposit|set[- ]?up cost|installation)\b/i },
  { id: "penalty", title: "Penalties and late payment", tone: "warn", why: "What happens if you pay late or break a rule.",
    re: /\b(penalt\w*|late (?:payment|fee)|interest (?:on|at)|default|liquidated damages|forfeit\w*|collection costs?)\b/i },
  { id: "price", title: "Price changes", tone: "warn", why: "Whether they can raise the price during the contract.",
    re: /\b((?:increase|change|adjust|revise)\w* (?:the |our )?(?:price|prices|fees|rent|charges|tariff)|price (?:increase|change|adjustment)|index(?:ed|ation)|in line with (?:inflation|CPI|RPI))\b/i },
  { id: "deposit", title: "Deposit and refunds", tone: "info", why: "What you get back, and when.",
    re: /\b(deposit|refund\w*|non[- ]refundable|reimburs\w*|returned within)\b/i },
  { id: "liability", title: "Liability limits", tone: "warn", why: "What they refuse to be responsible for.",
    re: /\b(not (?:be )?(?:liable|responsible)|limitation of liability|liability (?:is |shall be )?limited|indemnif\w*|hold harmless|as is|at your own risk|no warranty)\b/i },
  { id: "dispute", title: "Disputes and arbitration", tone: "warn", why: "You might be giving up the right to go to court.",
    re: /\b(arbitrat\w*|class action|jury trial|governing law|jurisdiction|courts? of|dispute resolution|waive\w* (?:the|your|any) right)\b/i },
  { id: "data", title: "Your data", tone: "info", why: "Who gets your personal information.",
    re: /\b(personal data|share (?:your )?(?:information|data)|third[- ]part(?:y|ies)|marketing (?:purposes|communications)|sell (?:your )?(?:data|information)|cookies)\b/i },
  { id: "changes", title: "They can change the terms", tone: "warn", why: "Terms you agreed to may not stay the same.",
    re: /\b((?:may|can|reserves? the right to) (?:amend|modify|change|update) (?:these|this|the) (?:terms|agreement|contract)|at (?:our|its) (?:sole )?discretion|without (?:prior )?notice)\b/i },
  { id: "duties", title: "Your obligations", tone: "info", why: "What you have to do to stay within the contract.",
    re: /\b(you (?:must|shall|agree to|are required to)|tenant shall|the customer shall|responsible for (?:all )?(?:repairs|maintenance|damage)|insurance (?:must|shall))\b/i },
];

export type Clause = { start: number; end: number; text: string; cats: string[] };
export type Figure = { kind: "money" | "duration" | "percent"; text: string; start: number };
export type Reading = { clauses: Clause[]; byCat: Record<string, Clause[]>; figures: Figure[]; missing: string[]; words: number };

export function splitClauses(text: string): { start: number; end: number; text: string }[] {
  const out: { start: number; end: number; text: string }[] = [];
  // Split on sentence ends and on blank lines / numbered items, keeping offsets.
  const re = /[^.;\n]+(?:[.;](?!\d)|\n|$)/g;
  let buf = "";
  let bufStart = -1;
  for (const m of text.matchAll(re)) {
    const piece = m[0];
    if (!piece.trim()) continue;
    if (bufStart < 0) bufStart = m.index!;
    buf += piece;
    // Avoid splitting on abbreviations like "e.g." or "No."
    if (/(?:^|[\s(.])(?:[a-z]|No|Art|Sec|cl|approx|incl|Mr|Mrs|Dr|vs|etc)\.$/i.test(buf.trim()) && !/\n/.test(piece)) continue;
    if (buf.trim().length < 12 && !/\n/.test(piece)) continue;
    const lead = buf.length - buf.trimStart().length;
    out.push({ start: bufStart + lead, end: bufStart + buf.trimEnd().length, text: buf.trim() });
    buf = "";
    bufStart = -1;
  }
  if (buf.trim()) out.push({ start: bufStart, end: bufStart + buf.trimEnd().length, text: buf.trim() });
  return out;
}

export function findFigures(text: string): Figure[] {
  const f: Figure[] = [];
  const money = /(?:[€$£]\s?\d[\d.,\s]*\d|\d[\d.,\s]*\d?\s?(?:EUR|USD|GBP|ALL|lek[ëe]?|euros?|dollars?|pounds?)\b|\b(?:EUR|USD|GBP|ALL)\s?\d[\d.,]*)/gi;
  const dur = /\b(\d{1,3}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirty|sixty|ninety)\s?(?:\(\d+\)\s?)?(?:calendar |business |working )?(days?|weeks?|months?|years?)\b/gi;
  const pct = /\b\d{1,3}(?:[.,]\d+)?\s?%|\b\d{1,3}(?:[.,]\d+)? per ?cent\b/gi;
  for (const m of text.matchAll(money)) f.push({ kind: "money", text: m[0].trim(), start: m.index! });
  for (const m of text.matchAll(dur)) f.push({ kind: "duration", text: m[0], start: m.index! });
  for (const m of text.matchAll(pct)) f.push({ kind: "percent", text: m[0], start: m.index! });
  return f.sort((a, b) => a.start - b.start);
}

export function readContract(text: string): Reading {
  const parts = splitClauses(text);
  const clauses: Clause[] = parts.map((p) => ({ ...p, cats: CATEGORIES.filter((c) => c.re.test(p.text)).map((c) => c.id) }));
  const byCat: Record<string, Clause[]> = {};
  for (const c of CATEGORIES) byCat[c.id] = clauses.filter((x) => x.cats.includes(c.id));
  const missing: string[] = [];
  if (!byCat.notice.length) missing.push("No cancellation or notice terms found. Ask how you can end this contract.");
  if (!byCat.fees.length && !byCat.deposit.length) missing.push("No fees or charges found. Check that the price is all-inclusive.");
  return { clauses, byCat, figures: findFigures(text), missing, words: (text.match(/\S+/g) || []).length };
}
