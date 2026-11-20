// Rule-based scam signal checker. It explains each signal it finds; it cannot
// prove a message is safe, and the UI says so.

export type Signal = { id: string; title: string; detail: string; weight: number; evidence?: string };
export type LinkReport = { url: string; host: string; flags: string[] };
export type ScamReport = { score: number; level: "low" | "medium" | "high"; signals: Signal[]; links: LinkReport[] };

const BRANDS: Record<string, string[]> = {
  paypal: ["paypal.com"],
  amazon: ["amazon.com", "amazon.co.uk", "amazon.de", "amazon.it", "amazon.fr", "amazon.es"],
  apple: ["apple.com", "icloud.com"],
  microsoft: ["microsoft.com", "live.com", "outlook.com", "office.com"],
  google: ["google.com", "gmail.com"],
  netflix: ["netflix.com"],
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  whatsapp: ["whatsapp.com"],
  dhl: ["dhl.com"],
  fedex: ["fedex.com"],
  ups: ["ups.com"],
  usps: ["usps.com"],
  royalmail: ["royalmail.com"],
  revolut: ["revolut.com"],
  binance: ["binance.com"],
  coinbase: ["coinbase.com"],
  posta: ["postashqiptare.al"],
  raiffeisen: ["raiffeisen.al", "raiffeisen.at"],
};

const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "is.gd", "cutt.ly", "rb.gy", "ow.ly", "shorturl.at", "tiny.cc", "s.id", "rebrand.ly"];
const RISKY_TLDS = ["zip", "mov", "top", "xyz", "click", "icu", "live", "rest", "cfd", "sbs", "quest", "buzz", "monster", "cam", "gq", "tk", "ml", "cf", "ga", "support", "help"];

type TextRule = { id: string; title: string; detail: string; weight: number; re: RegExp };

const TEXT_RULES: TextRule[] = [
  { id: "urgency", title: "Pressure to act fast", detail: "Scams rush you so you don't stop to check.", weight: 18,
    re: /\b(urgent|immediately|right away|within (?:24|48|12) ?hours?|final (?:notice|warning|reminder)|last chance|act now|expires? today|urgjent|menjëherë)\b/i },
  { id: "suspended", title: "Threat to close or lock an account", detail: "Real companies rarely threaten suspension by message.", weight: 20,
    re: /\b(account (?:has been |will be |is )?(?:suspended|locked|disabled|closed|limited|on hold)|unusual (?:sign[- ]?in|activity)|verify your (?:account|identity)|llogaria juaj)\b/i },
  { id: "credentials", title: "Asks for passwords or codes", detail: "No bank, shop or government office asks for your password, PIN or one-time code.", weight: 30,
    re: /\b(password|passcode|\bPIN\b|one[- ]time (?:code|password)|OTP|verification code|security code|CVV|CVC|login details|seed phrase|recovery phrase|fjalëkalim|kodin)\b/i },
  { id: "payment", title: "Unusual way to pay", detail: "Gift cards, crypto and money transfer services are hard to reverse, which is why scammers want them.", weight: 30,
    re: /\b(gift ?cards?|itunes card|google play card|steam card|bitcoin|crypto(?:currency)?|USDT|wire transfer|western union|moneygram|bank transfer to (?:a|this) new)\b/i },
  { id: "prize", title: "Prize, lottery or inheritance", detail: "You can't win a lottery you didn't enter.", weight: 25,
    re: /\b(you(?:'ve| have)? won|winner|lottery|jackpot|prize|inheritance|beneficiary|unclaimed (?:funds|money)|fitues|fituat)\b/i },
  { id: "delivery", title: "Parcel fee or failed delivery", detail: "A classic: a small 'redelivery' or customs fee to steal card details.", weight: 18,
    re: /\b(parcel|package|delivery|shipment|customs)\b[\s\S]{0,80}\b(fee|pay|held|failed|unable|reschedule|confirm (?:your )?address)\b/i },
  { id: "newnumber", title: "'New number' family message", detail: "'Hi Mum, this is my new number' messages usually end in a request for money.", weight: 28,
    re: /\b(hi|hey|hello) (mum|mom|dad|mama|papa)\b|\b(this is my new number|lost my phone|new phone number)\b/i },
  { id: "refund", title: "Unexpected refund or tax rebate", detail: "Refund bait is used to collect card details.", weight: 15,
    re: /\b(refund|rebate|reimbursement|overpaid|tax return)\b/i },
  { id: "threat", title: "Legal threats", detail: "Threats of arrest or court by message are a pressure tactic.", weight: 22,
    re: /\b(arrest|warrant|police|legal action|lawsuit|court|prosecut\w*|fined?)\b/i },
  { id: "secrecy", title: "Asks you to keep it secret", detail: "Being told not to tell anyone is a strong warning sign.", weight: 22,
    re: /\b(don'?t tell (?:(?:your|my) )?(?:mum|mom|dad|parents|family|anyone|anybody)\b|keep (?:this|it) (?:confidential|secret|between us)|do not share this with)\b/i },
  { id: "job", title: "Easy money job offer", detail: "Pay for liking posts, reviewing products or 'tasks' is a known scam pattern.", weight: 20,
    re: /\b(work from home|earn \$?€?\d+[\s\S]{0,20}(?:per|a) (?:day|hour)|like (?:videos|posts) (?:and|to) earn|simple tasks?|part[- ]time job offer)\b/i },
  { id: "investment", title: "Guaranteed returns", detail: "Any investment that promises guaranteed or very high returns is a red flag.", weight: 25,
    re: /\b(guaranteed (?:returns?|profit|income)|double your (?:money|investment)|\d{2,3}% (?:return|profit|monthly)|risk[- ]free investment)\b/i },
  { id: "remote", title: "Asks to install remote-access apps", detail: "AnyDesk or TeamViewer would let a stranger control your device.", weight: 30,
    re: /\b(anydesk|teamviewer|quick ?support|rustdesk|install (?:this|the) app to (?:verify|fix))\b/i },
  { id: "moneyask", title: "Asks for money", detail: "A request to send money or pay something urgently should always be checked another way.", weight: 15,
    re: /\b(send (?:me )?(?:some )?money|transfer (?:me|the money)|pay (?:a|this|the) bill|lend me|i'?ll pay you back|need (?:some )?money)\b/i },
  { id: "generic", title: "Generic greeting", detail: "Real companies usually use your name.", weight: 6,
    re: /\b(dear (?:customer|client|user|member|sir\/madam|valued customer)|i nderuar klient)\b/i },
];

function registrable(host: string): string {
  const parts = host.split(".");
  const twoPart = ["co.uk", "com.au", "co.jp", "com.al", "org.uk", "co.nz", "com.br"];
  const last2 = parts.slice(-2).join(".");
  if (parts.length >= 3 && twoPart.includes(last2)) return parts.slice(-3).join(".");
  return last2;
}

function lev(a: string, b: string): number {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}

const deconfuse = (s: string) => s.replace(/0/g, "o").replace(/1/g, "l").replace(/rn/g, "m").replace(/vv/g, "w").replace(/3/g, "e").replace(/5/g, "s");

export function extractUrls(text: string): string[] {
  const re = /\b((?:https?:\/\/|www\.)[^\s<>"')\]]+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|org|info|biz|io|co|me|xyz|top|click|live|icu|al|uk|de|it|link|app|site|online|shop|zip|support|help)(?:\/[^\s<>"')\]]*)?)/gi;
  const seen = new Set<string>();
  for (const m of text.matchAll(re)) {
    const u = m[1].replace(/[.,;:!?]+$/, "");
    if (/@/.test(text.slice(Math.max(0, m.index! - 1), m.index!))) continue; // part of an email
    seen.add(u);
  }
  return [...seen];
}

export function analyzeLink(raw: string): LinkReport {
  const flags: string[] = [];
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : "http://" + raw);
  } catch {
    return { url: raw, host: raw, flags: ["Can't be read as a normal web address"] };
  }
  const host = url.hostname.toLowerCase();
  const reg = registrable(host);
  const label = reg.split(".")[0];
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) flags.push("Uses a raw IP address instead of a name");
  if (host.includes("xn--")) flags.push("Uses look-alike international characters (punycode)");
  if (SHORTENERS.includes(host)) flags.push("Link shortener hides the real destination");
  if (RISKY_TLDS.includes(host.split(".").pop()!)) flags.push(`.${host.split(".").pop()} addresses are often used for throwaway scam sites`);
  if (raw.includes("@") && /^https?:\/\/[^/]*@/i.test(raw)) flags.push("Has an @ in the address, which hides the real site");
  if (/^http:\/\//i.test(raw)) flags.push("Not a secure (https) link");
  if ((host.match(/-/g) || []).length >= 3) flags.push("Many hyphens in the site name");
  if (host.split(".").length >= 5) flags.push("Unusually deep subdomain chain");
  for (const [brand, domains] of Object.entries(BRANDS)) {
    if (domains.some((d) => reg === d)) continue;
    const tokens = (host + url.pathname).toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
    const near = (t: string) => {
      const d = deconfuse(t);
      if (brand.length <= 4) return d === brand;
      return d === brand || d.includes(brand) || (Math.abs(d.length - brand.length) <= 2 && lev(d, brand) <= (brand.length > 6 ? 2 : 1));
    };
    if (tokens.some(near)) {
      flags.push(`Mentions ${brand[0].toUpperCase() + brand.slice(1)} but the real site is ${domains[0]}, not ${reg}`);
      break;
    }
  }
  return { url: raw, host, flags };
}

export function checkMessage(text: string): ScamReport {
  const signals: Signal[] = [];
  for (const r of TEXT_RULES) {
    const m = text.match(r.re);
    if (m) signals.push({ id: r.id, title: r.title, detail: r.detail, weight: r.weight, evidence: m[0] });
  }
  const links = extractUrls(text).map(analyzeLink);
  const flagged = links.filter((l) => l.flags.length);
  if (flagged.length) {
    const w = Math.min(45, flagged.reduce((s, l) => s + l.flags.length * 12, 0));
    signals.push({ id: "links", title: "Suspicious link", detail: "See the link check below for what looks wrong.", weight: w, evidence: flagged[0].host });
  }
  const caps = text.replace(/[^A-Za-z]/g, "");
  if (caps.length > 40 && caps.replace(/[^A-Z]/g, "").length / caps.length > 0.45)
    signals.push({ id: "shouting", title: "Lots of capital letters", detail: "Shouting is a pressure tactic.", weight: 6 });
  if ((text.match(/!/g) || []).length >= 4)
    signals.push({ id: "exclaim", title: "Many exclamation marks", detail: "Common in bait messages.", weight: 5 });
  // Combinations are stronger than single hits.
  const ids = new Set(signals.map((s) => s.id));
  if (ids.has("urgency") && (ids.has("credentials") || ids.has("payment") || ids.has("links")))
    signals.push({ id: "combo", title: "Pressure plus a request", detail: "Rushing you and asking for money, codes or a click together is the core scam pattern.", weight: 20 });
  const score = Math.min(100, signals.reduce((s, x) => s + x.weight, 0));
  const level = score >= 50 ? "high" : score >= 20 ? "medium" : "low";
  signals.sort((a, b) => b.weight - a.weight);
  return { score, level, signals, links };
}
