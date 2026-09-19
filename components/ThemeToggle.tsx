"use client";

import { useEffect, useState } from "react";
import { Icon } from "./Icon";

type Pref = "system" | "light" | "dark";
const OPTIONS: { v: Pref; icon: string; label: string }[] = [
  { v: "system", icon: "monitor", label: "System theme" },
  { v: "light", icon: "sun", label: "Light theme" },
  { v: "dark", icon: "moon", label: "Dark theme" },
];

function apply(pref: Pref) {
  const dark = pref === "dark" || (pref === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.documentElement.dataset.pref = pref;
}

export function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("system");

  useEffect(() => {
    try { setPref((localStorage.getItem("af-theme") as Pref) || "system"); } catch {}
  }, []);

  useEffect(() => {
    if (pref !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [pref]);

  const choose = (v: Pref) => {
    setPref(v);
    apply(v);
    try { localStorage.setItem("af-theme", v); } catch {}
  };

  return (
    <div className="theme" role="radiogroup" aria-label="Theme">
      {OPTIONS.map((o) => (
        <button key={o.v} role="radio" aria-checked={pref === o.v} aria-label={o.label} title={o.label} className={pref === o.v ? "on" : ""} onClick={() => choose(o.v)}>
          <Icon name={o.icon} size={15} />
        </button>
      ))}
    </div>
  );
}
