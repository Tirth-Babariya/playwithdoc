import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FlowChips } from "@/components/FormatChip";
import { Icon } from "@/components/Icon";
import { ToolCard } from "@/components/ToolCard";
import { NetBadge } from "@/components/NetBadge";
import { MetaPanel } from "@/components/MetaPanel";
import { QrMaker } from "@/components/QrMaker";
import { QrReader } from "@/components/QrReader";
import { ToolView } from "@/components/ToolView";
import { guidesForTool } from "@/lib/guides";
import { helpFor, jsonLd } from "@/lib/help";
import { pageMeta } from "@/lib/seo";
import { getTool, TOOLS } from "@/lib/tools";

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = getTool((await params).slug);
  if (!t) return {};
  return pageMeta({
    path: `/tools/${t.slug}`,
    title: `${t.name} — free, private, no upload`,
    description: `${t.desc} Free, no sign-up, and your files never leave your device.`,
    ogTitle: `${t.name} · PlayWithDoc`,
  });
}

export default async function ToolPage({ params }: { params: Promise<{ slug: string }> }) {
  const tool = getTool((await params).slug);
  if (!tool) notFound();
  const help = helpFor(tool);
  const guides = guidesForTool(tool.slug);
  const related = TOOLS.filter((t) => t.slug !== tool.slug && t.cat === tool.cat && (t.featured || tool.cat !== "image")).slice(0, 6);

  return (
    <div className="container tool-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(tool, help)) }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">PlayWithDoc</Link><Icon name="arrow" size={11} /><Link href="/#tools">Tools</Link><Icon name="arrow" size={11} /><span>{tool.name}</span>
      </nav>
      <header className="tool-head">
        <FlowChips from={tool.from} to={tool.to} flow={tool.flow} size="lg" />
        <h1>{tool.name}</h1>
        <p className="lead">{tool.desc}</p>
      </header>

      {tool.custom === "qr-maker" ? <QrMaker /> : tool.custom === "qr-reader" ? <QrReader /> : tool.custom === "metadata" ? <MetaPanel /> : <ToolView slug={tool.slug} />}

      <div className="assure">
        <span><Icon name="lock" size={15} /> Never uploaded</span>
        <span><Icon name="zap" size={15} /> Instant, no queue</span>
        <span><Icon name="infinity" size={15} /> Free, unlimited</span>
        <span><Icon name="user" size={15} /> No sign-up</span>
        <NetBadge />
      </div>

      {!tool.custom && (
      <section className="how">
        <h2>How it works</h2>
        <ol>
          <li><b>Add</b><span>Drop, browse or paste your {tool.from.length > 3 ? "images" : tool.from.map((f) => f.toUpperCase()).join("/")} file{tool.multi ? "s" : ""}.</span></li>
          <li><b>{tool.options?.length || tool.pages ? "Tweak" : "Convert"}</b><span>{tool.options?.length || tool.pages ? "Pick your options — sensible defaults are already set." : "It starts automatically — no settings to think about."}</span></li>
          <li><b>Download</b><span>Save the result, or send it straight into another tool.</span></li>
        </ol>
      </section>
      )}

      <section className="about">
        <h2>About {tool.name}</h2>
        {help.about.map((p, i) => <p key={i}>{p}</p>)}
        <h3>Tips</h3>
        <ul>{help.tips.map((t, i) => <li key={i}><Icon name="check" size={14} />{t}</li>)}</ul>
        <h3>Questions</h3>
        <div className="faq faq-sm">
          {help.faq.map((f) => <details key={f.q}><summary>{f.q}<Icon name="plus" size={16} /></summary><p>{f.a}</p></details>)}
        </div>
      </section>

      {guides.length > 0 && (
        <section className="related">
          <h2>Guides</h2>
          <div className="guide-grid">
            {guides.map((g) => (
              <Link key={g.slug} href={`/guides/${g.slug}`} className="card guide-card">
                <b>{g.title}</b><span className="muted">{g.description}</span><span className="guide-meta">{g.minutes} min read</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {related.length > 0 && (
        <section className="related">
          <h2>Related tools</h2>
          <div className="grid">{related.map((t) => <ToolCard key={t.slug} tool={t} />)}</div>
        </section>
      )}
    </div>
  );
}
