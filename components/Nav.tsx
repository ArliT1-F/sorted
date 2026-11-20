"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { TOOLS } from "@/lib/tools";
import { useVault } from "./VaultProvider";

export function Nav() {
  const path = usePathname();
  const v = useVault();
  const [open, setOpen] = useState(false);
  return (
    <header className="nav">
      <div className="wrap navrow">
        <Link href="/" className="logo" onClick={() => setOpen(false)}>
          <span className="mark" aria-hidden>S</span>Sorted
        </Link>
        <button className="btn menu" aria-expanded={open} aria-controls="toolmenu" onClick={() => setOpen(!open)}>
          Tools
        </button>
        <nav id="toolmenu" className={open ? "tools open" : "tools"} aria-label="Tools">
          {TOOLS.map((t) => (
            <Link key={t.href} href={t.href} aria-current={path === t.href ? "page" : undefined} onClick={() => setOpen(false)}>
              {t.name}
            </Link>
          ))}
        </nav>
        <div className="acct">
          {v.state === "unlocked" && (
            <button className="btn small" onClick={v.lock} title="Lock your vault">
              Lock
            </button>
          )}
          {v.state === "signed-out" || v.state === "unconfigured" ? (
            <Link className="btn small pri" href="/login">Sign in</Link>
          ) : v.user ? (
            <Link className="btn small" href="/account">Account</Link>
          ) : null}
        </div>
      </div>
    </header>
  );
}
