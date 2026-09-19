import type { Metadata } from "next";
import Link from "next/link";
import { FlowChips } from "@/components/FormatChip";
import { Icon, toolIcon } from "@/components/Icon";
import { GUIDES } from "@/lib/guides";
import { getTool } from "@/lib/tools";

export const metadata: Metadata = {
  title: "How-to guides — PDFs, photos and forms",
  description: "Short, practical guides: reduce a PDF to under 200 KB, sign a PDF without uploading it, make a passport photo, fill a form, and more. Free and private.",
};

export default function GuidesIndex() {
  return (
    <div className="container tool-page">
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">PlayWithDoc</Link><Icon name="arrow" size={11} /><span>Guides</span></nav>
      <header className="tool-head">
        <span className="chip chip-lg chip-any">GUIDES</span>
        <h1>How-to guides</h1>
        <p className="lead">Short, step-by-step answers to the things people search for most — each one ends at a free tool that does the job on your own device.</p>
      </header>

      <div className="guide-grid">
        {GUIDES.map((g) => {
          const t = getTool(g.tool)!;
          return (
            <Link key={g.slug} href={`/guides/${g.slug}`} className="card guide-card">
              <span className="tool-top">
                <span className="tool-ico"><Icon name={toolIcon(t.slug, t.cat)} size={18} /></span>
                <FlowChips from={t.from} to={t.to} size="sm" />
              </span>
              <b>{g.title}</b>
              <span className="muted">{g.description}</span>
              <span className="guide-meta">{g.minutes} min read · {g.steps.length} steps</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
