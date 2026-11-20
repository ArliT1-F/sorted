import Link from "next/link";
import { TOOLS } from "@/lib/tools";

export default function Home() {
  const instant = TOOLS.filter((t) => !t.account);
  const saved = TOOLS.filter((t) => t.account);
  return (
    <>
      <section className="hero">
        <div className="wrap">
          <div>
            <h1>Paperwork, sorted.</h1>
            <p>Nine free tools for the admin everyone has to deal with: documents to send, messages to check, contracts to read, and records to keep.</p>
            <div className="row" style={{ marginTop: 22 }}>
              <Link className="btn" style={{ background: "#fff", color: "#141414", borderColor: "#fff" }} href="/tools/redact">Try the redactor</Link>
              <Link className="btn" style={{ color: "#fff", borderColor: "#fff" }} href="/login?mode=signup">Create a free account</Link>
            </div>
          </div>
          <ul>
            <li>Quick tools run in your browser. Your files never leave your device.</li>
            <li>Saved items are encrypted with your own passphrase before upload. We can&apos;t read them.</li>
            <li>No ads, no tracking, no upsells.</li>
          </ul>
        </div>
      </section>
      <section className="shelf">
        <div className="wrap">
          <h2>Use right now, no account</h2>
          <div className="folders">
            {instant.map((t) => (
              <Link key={t.href} href={t.href} className="folder" data-c={t.color}>
                <h3>{t.name}</h3>
                <div className="s">{t.short}</div>
                <p>{t.blurb}</p>
                <span className="go">Open →</span>
              </Link>
            ))}
          </div>
          <h2>Keep it in your account</h2>
          <div className="folders">
            {saved.map((t) => (
              <Link key={t.href} href={t.href} className="folder" data-c={t.color}>
                <h3>{t.name}</h3>
                <div className="s">{t.short}</div>
                <p>{t.blurb}</p>
                <span className="go">Open →</span>
              </Link>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
