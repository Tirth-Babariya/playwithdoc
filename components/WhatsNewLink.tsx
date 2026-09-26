"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LATEST } from "@/lib/changelog";

const KEY = "pwd-seen-update";
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/** Marks the current update as seen (used on the What's new page). */
export function MarkSeen() {
  useEffect(() => { try { localStorage.setItem(KEY, LATEST); } catch { /* private mode */ } }, []);
  return null;
}

/** Nav link with a small dot while there's an update the visitor hasn't looked at. */
export function WhatsNewLink({ label = "What’s new" }: { label?: string }) {
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    const seen = read();
    // First-ever visit: nothing is "new" to someone who has never seen the site before.
    if (seen === null) { try { localStorage.setItem(KEY, LATEST); } catch { /* ignore */ } setFresh(false); }
    else setFresh(seen !== LATEST);
    const on = (e: StorageEvent) => { if (e.key === KEY) setFresh(read() !== LATEST); };
    window.addEventListener("storage", on);
    return () => window.removeEventListener("storage", on);
  }, []);
  return (
    <Link href="/whats-new" className="nav-new" onClick={() => setFresh(false)}>
      {label}{fresh && <i className="new-dot" aria-label="New updates" />}
    </Link>
  );
}
