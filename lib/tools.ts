export type Tool = { href: string; name: string; short: string; blurb: string; account: boolean; color: string };

export const TOOLS: Tool[] = [
  { href: "/tools/redact", name: "Redactor", short: "Black out IDs and numbers", blurb: "Hide names, ID numbers, bank details and addresses in a PDF or photo before you send it. The output is flattened, so nothing can be un-hidden.", account: false, color: "ink" },
  { href: "/tools/scam", name: "Scam check", short: "Is this message a scam?", blurb: "Paste a text, email or link. See each warning sign it carries and what to do next.", account: false, color: "red" },
  { href: "/tools/contract", name: "Contract reader", short: "The parts that cost you", blurb: "Paste or upload a lease, phone contract or terms. Renewals, notice periods, fees and penalties are pulled out and highlighted.", account: false, color: "blue" },
  { href: "/tools/metadata", name: "Photo cleaner", short: "Remove hidden location data", blurb: "Photos carry GPS location, phone model and dates. See what's in yours and strip it before posting or selling online.", account: false, color: "yellow" },
  { href: "/vault", name: "Document vault", short: "Your papers, encrypted", blurb: "Keep scans of IDs, contracts and receipts in one place, encrypted on your device so only you can open them.", account: true, color: "ink" },
  { href: "/tools/ledger", name: "Lent & owed", short: "Who has your stuff", blurb: "Track things and money you lent or borrowed, with a polite reminder message ready to send.", account: true, color: "yellow" },
  { href: "/tools/inventory", name: "Home inventory", short: "Ready for an insurance claim", blurb: "Room by room list of what you own, with photos, receipts and values. Export it in seconds after a theft or fire.", account: true, color: "blue" },
  { href: "/tools/split", name: "Fair split", short: "Rent and bills, explained", blurb: "Split rent by room size, income or both, plus bills. Every share shows the sum behind it, so nobody argues.", account: true, color: "red" },
  { href: "/tools/forms", name: "Form filler", short: "Type it once, copy forever", blurb: "Store the details every form asks for: addresses, jobs, education, references. Copy any field with one click.", account: true, color: "ink" },
];
