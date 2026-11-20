# Sorted

Nine free tools for everyday paperwork.

**No account needed (runs fully in the browser, nothing uploaded)**
- **Redactor**: black out ID numbers, IBANs, emails, phones, card numbers and passport lines in PDFs and photos. Auto-detects in text PDFs; drag to cover anything else. The output is flattened to images, so hidden text is really gone.
- **Scam check**: rule-based analysis of a pasted message and its links (look-alike domains, shorteners, risky TLDs, urgency, payment and credential requests…). Includes a few Albanian keywords.
- **Contract reader**: paste or upload a PDF/TXT; highlights renewals, notice periods, lock-ins, fees, penalties, price changes, liability, disputes and data clauses, and lists every amount, duration and percentage.
- **Photo cleaner**: shows GPS location, device, dates and owner tags, then strips them. JPEG and PNG are cleaned losslessly; other formats are re-encoded. The result is re-checked.

**With a free account (encrypted on the device before upload)**
- **Document vault**: encrypted file storage with folders, notes, preview and search.
- **Lent & owed**: things and money lent or borrowed, with ready-to-copy reminder messages.
- **Home inventory**: room-by-room list with photos/receipts, totals, CSV export and print.
- **Fair split**: rent by room size, income, equal, or shared+room hybrid, plus bills, with the working shown.
- **Form filler**: reusable cards (personal, addresses, jobs, education, references) with one-click copy.

## How the encryption works

- Each user has a random 256-bit **data key**. Every record and file is encrypted with it (AES-256-GCM, WebCrypto) in the browser.
- The data key is stored only **wrapped**: once with a key derived from the user's **vault passphrase** (PBKDF2-SHA256, 600k iterations) and once with a one-time **recovery code** shown at setup.
- The server (Supabase) only ever holds ciphertext. Row Level Security and storage policies restrict each user to their own rows and folder.
- The sign-in password and the vault passphrase are separate. Resetting the password by email doesn't affect the vault. **If a user loses both the passphrase and the recovery code, their data can't be recovered, by design.**
- The vault locks after 30 minutes of inactivity, or on reload.
- Not encrypted: the tool name of each record (`kind`), timestamps, and file sizes.

## Setup

### 1. Supabase
1. Create a project at [supabase.com](https://supabase.com) (the free tier is fine).
2. Open **SQL Editor**, paste `supabase/schema.sql` and run it. This creates the tables, RLS policies, the private `vault` storage bucket and the account-deletion function.
3. Go to **Authentication → URL Configuration**. Set **Site URL** to your domain (e.g. `https://sorted.vercel.app`) and add `https://YOUR-DOMAIN/reset` and `https://YOUR-DOMAIN/vault` to **Redirect URLs**. Add the `http://localhost:3000/...` equivalents for local development.
4. Under **Authentication → Providers → Email**, keep "Confirm email" on (recommended). For real traffic, set up custom SMTP, because Supabase's built-in mailer is heavily rate-limited.
5. Copy the **Project URL** and the **publishable/anon key** from **Project Settings → API**.

### 2. Run locally
```bash
cp .env.example .env.local   # fill in the two values
npm install                  # also copies the PDF.js worker into /public
npm run dev
npm test                     # unit tests for the crypto and tool logic
```

### 3. Deploy to Vercel
1. Push the folder to a GitHub repo and import it in Vercel (framework: Next.js, default settings).
2. Add the environment variables `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. Deploy, then put the production URL into Supabase's Site URL and Redirect URLs (step 1.3).

Without the env vars, the site still builds and the four instant tools work. Account pages show a "not set up" notice.

## Project layout
```
app/                 pages (all client-side; every tool is its own route)
  tools/<tool>/      redact, scam, contract, metadata, ledger, inventory, split, forms
  vault/ login/ reset/ account/
components/          VaultProvider (auth + key state), VaultGate (sign-in/unlock UI), useRecords (encrypted CRUD)
lib/crypto.ts        key wrapping, AES-GCM helpers
lib/vault.ts         Supabase records/files API (encrypt before write, decrypt after read)
lib/pii.ts scam.ts contract.ts metadata.ts split.ts   pure tool logic (unit-tested)
supabase/schema.sql  database, RLS, storage bucket and policies
tests/               node:test unit tests
```

## Known limits and next steps
- The scam check and contract reader are pattern-based. They explain what they find but can't guarantee anything. An optional AI mode could be added later with a server route and API key.
- Scanned PDFs and photos have no text layer, so redaction there is manual. Adding OCR (e.g. tesseract.js) would enable auto-detection.
- HEIC photos only open in browsers that support them (mainly Safari).
- Supabase's free plan allows 50 MB per file and 1 GB of storage in total.
- Before launch: add a privacy policy and terms page, rate limiting or CAPTCHA on sign-up (Supabase has built-in hCaptcha/Turnstile support), and a Content-Security-Policy header.
