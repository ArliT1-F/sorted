// Fair rent and bills splitting. Every number comes with the reason behind it.

export type Method = "equal" | "room" | "income" | "hybrid";
export type Person = { id: string; name: string; room: number; income: number; extras: number; occupants: number };
export type Bill = { id: string; name: string; amount: number; split: "equal" | "occupants" };
export type Scenario = { name: string; rent: number; method: Method; commonShare: number; people: Person[]; bills: Bill[]; currency: string };
export type Line = { person: Person; rent: number; bills: number; total: number; why: string[] };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Splits an amount by weights and fixes rounding so the parts add up exactly. */
export function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const w = sum > 0 ? weights : weights.map(() => 1);
  const s = sum > 0 ? sum : w.length;
  const cents = Math.round(total * 100);
  const raw = w.map((x) => (cents * x) / s);
  const floor = raw.map(Math.floor);
  let left = cents - floor.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => [r - floor[i], i] as const).sort((a, b) => b[0] - a[0]);
  for (const [, i] of order) {
    if (left <= 0) break;
    floor[i]++;
    left--;
  }
  return floor.map((c) => c / 100);
}

export function computeSplit(s: Scenario): Line[] {
  const ppl = s.people;
  if (!ppl.length) return [];
  const extrasTotal = ppl.reduce((a, p) => a + (p.extras || 0), 0);
  const base = Math.max(0, s.rent - extrasTotal);
  let rentParts: number[];
  const why: string[][] = ppl.map(() => []);
  const fmt = (n: number) => `${round2(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${s.currency}`;
  const totalRoom = ppl.reduce((a, p) => a + (p.room || 0), 0);
  const totalIncome = ppl.reduce((a, p) => a + (p.income || 0), 0);

  if (s.method === "equal") {
    rentParts = allocate(base, ppl.map(() => 1));
    ppl.forEach((_, i) => why[i].push(`Equal share of ${fmt(base)}: 1 of ${ppl.length}`));
  } else if (s.method === "room") {
    rentParts = allocate(base, ppl.map((p) => p.room || 0));
    ppl.forEach((p, i) => why[i].push(`Room ${p.room} m² of ${totalRoom} m² total = ${((p.room / (totalRoom || 1)) * 100).toFixed(1)}% of ${fmt(base)}`));
  } else if (s.method === "income") {
    rentParts = allocate(base, ppl.map((p) => p.income || 0));
    ppl.forEach((p, i) => why[i].push(`Income is ${((p.income / (totalIncome || 1)) * 100).toFixed(1)}% of the household's, so pays that share of ${fmt(base)}`));
  } else {
    const common = (base * Math.min(100, Math.max(0, s.commonShare))) / 100;
    const priv = base - common;
    const c = allocate(common, ppl.map(() => 1));
    const r = allocate(priv, ppl.map((p) => p.room || 0));
    rentParts = c.map((x, i) => round2(x + r[i]));
    ppl.forEach((p, i) => {
      why[i].push(`Shared spaces (${s.commonShare}% of rent = ${fmt(common)}) split equally: ${fmt(c[i])}`);
      why[i].push(`Private room ${p.room} m² of ${totalRoom} m² = ${fmt(r[i])}`);
    });
  }
  ppl.forEach((p, i) => {
    if (p.extras) {
      rentParts[i] = round2(rentParts[i] + p.extras);
      why[i].push(`Plus ${fmt(p.extras)} for extras (own bathroom, parking, balcony)`);
    }
  });

  const billParts = ppl.map(() => 0);
  for (const b of s.bills) {
    const w = b.split === "occupants" ? ppl.map((p) => Math.max(1, p.occupants || 1)) : ppl.map(() => 1);
    const parts = allocate(b.amount, w);
    parts.forEach((x, i) => {
      billParts[i] = round2(billParts[i] + x);
      why[i].push(`${b.name}: ${fmt(x)}${b.split === "occupants" ? ` (${w[i]} of ${w.reduce((a, c) => a + c, 0)} people)` : " (equal)"}`);
    });
  }
  return ppl.map((p, i) => ({ person: p, rent: rentParts[i], bills: billParts[i], total: round2(rentParts[i] + billParts[i]), why: why[i] }));
}
