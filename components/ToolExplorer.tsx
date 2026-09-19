"use client";

import { useState } from "react";
import { CATEGORIES, TOOLS } from "@/lib/tools";
import type { Category } from "@/lib/types";
import { ToolCard } from "./ToolCard";

export function ToolExplorer() {
  const [cat, setCat] = useState<Category | "all">("all");
  const [more, setMore] = useState(false);

  const pool = TOOLS.filter((t) => cat === "all" || t.cat === cat);
  // Every image↔image conversion is searchable; only the popular ones get a card by default.
  const list = pool.filter((t) => more || cat !== "all" || !(t.cat === "image" && !t.featured));
  const hidden = pool.length - list.length;

  return (
    <div>
      <div className="tabs" role="tablist" aria-label="Tool categories">
        <button role="tab" aria-selected={cat === "all"} className={cat === "all" ? "on" : ""} onClick={() => setCat("all")}>All</button>
        {CATEGORIES.map((c) => (
          <button key={c.id} role="tab" aria-selected={cat === c.id} className={cat === c.id ? "on" : ""} onClick={() => setCat(c.id)}>{c.label}</button>
        ))}
      </div>
      <div className="grid" role="tabpanel">
        {list.map((t) => <ToolCard key={t.slug} tool={t} />)}
      </div>
      {hidden > 0 && (
        <div className="more"><button className="btn btn-secondary" onClick={() => setMore(true)}>Show {hidden} more image conversions</button></div>
      )}
    </div>
  );
}
