"use client";

import { useEffect, useState } from "react";
import { getLast, getOutgoing, installNetGuard, subscribeNet } from "@/lib/netguard";
import { Icon } from "./Icon";

/** Live proof-of-privacy: counts uploads made by this page's own code (should stay at 0). */
export function NetBadge({ compact = false }: { compact?: boolean }) {
  const [n, setN] = useState(0);
  const [last, setLast] = useState("");
  const [open, setOpen] = useState(false);
  useEffect(() => { installNetGuard(); setN(getOutgoing()); return subscribeNet(() => { setN(getOutgoing()); setLast(getLast()); }); }, []);
  const clean = n === 0;

  return (
    <div className={`netbadge${compact ? " compact" : ""}${clean ? "" : " dirty"}`}>
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="nb-dot" />
        {clean ? "0 uploads this visit" : `${n} outgoing request${n === 1 ? "" : "s"}`}
        <Icon name="shield" size={13} />
      </button>
      {open && (
        <div className="nb-pop" role="dialog" aria-label="Privacy details">
          <b>Nothing leaves your device</b>
          <p>This page hasn’t sent any request carrying data since you opened it{clean ? "" : " — apart from the ones counted above"}. Files are read and converted by your browser.</p>
          <p>The site also tells your browser to block connections to any other website (a <code>connect-src 'self'</code> policy), so even a bug couldn’t upload a file.</p>
          {!clean && last && <p className="muted">Last one counted: <code>{last}</code></p>}
          <p className="muted">Check it yourself: open DevTools → Network while converting.</p>
        </div>
      )}
    </div>
  );
}
