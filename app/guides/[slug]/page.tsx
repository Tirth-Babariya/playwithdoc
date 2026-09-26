import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/Icon";
import { GUIDES, getGuide } from "@/lib/guides";
import { pageMeta } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import { getTool } from "@/lib/tools";

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const g = getGuide((await params).slug);
  if (!g) return {};
  return pageMeta({ path: `/guides/${g.slug}`, title: g.title, description: g.description, ogTitle: `${g.title} · PlayWithDoc`, type: "article" });
}

export default async function GuidePage({ params }: { params: Promise<{ slug: string }> }) {
  const g = getGuide((await params).slug);
  if (!g) notFound();
  const tool = getTool(g.tool)!;
  const related = g.related.map((s) => getGuide(s)).filter(Boolean);
  const url = `${SITE_URL}/guides/${g.slug}`;

  const jsonLd = [
    {
      "@context": "https://schema.org", "@type": "HowTo", name: g.title, description: g.description,
      totalTime: `PT${g.minutes}M`, tool: [{ "@type": "HowToTool", name: `${tool.name} (PlayWithDoc)` }],
      step: g.steps.map((s, i) => ({ "@type": "HowToStep", position: i + 1, name: s.title, text: s.body })),
    },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: g.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })) },
    {
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "PlayWithDoc", item: SITE_URL },
        { "@type": "ListItem", position: 2, name: "Guides", item: `${SITE_URL}/guides` },
        { "@type": "ListItem", position: 3, name: g.title, item: url },
      ],
    },
  ];

  return (
    <div className="container tool-page">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href="/">PlayWithDoc</Link><Icon name="arrow" size={11} /><Link href="/guides">Guides</Link><Icon name="arrow" size={11} /><span>{tool.name}</span>
      </nav>

      <article className="guide">
        <header>
          <div className="guide-badges">
            <span>{g.minutes} min read</span><span>Free</span><span><Icon name="lock" size={12} /> Nothing uploaded</span>
          </div>
          <h1>{g.title}</h1>
          <p className="lead">{g.intro}</p>
        </header>

        <div className="guide-short">
          <b>The short answer</b>
          <p>{g.short}</p>
          <Link href={`/tools/${tool.slug}`} className="btn btn-primary">Open {tool.name} <Icon name="arrow" size={16} /></Link>
        </div>

        <h2>Step by step</h2>
        <ol className="guide-steps">
          {g.steps.map((s, i) => (
            <li key={s.title}>
              <span className="guide-num">{i + 1}</span>
              <div><h3>{s.title}</h3><p>{s.body}</p></div>
            </li>
          ))}
        </ol>

        <h2>Tips</h2>
        <ul className="guide-tips">
          {g.tips.map((t) => <li key={t}><Icon name="check" size={15} />{t}</li>)}
        </ul>

        <div className="guide-cta card">
          <div><b>Ready to try it?</b><p className="muted">{tool.short} Free, and your file never leaves your device.</p></div>
          <Link href={`/tools/${tool.slug}`} className="btn btn-primary btn-lg">Open {tool.name} <Icon name="arrow" size={16} /></Link>
        </div>

        <h2>Questions</h2>
        <div className="faq faq-sm">
          {g.faq.map((f) => <details key={f.q}><summary>{f.q}<Icon name="plus" size={16} /></summary><p>{f.a}</p></details>)}
        </div>

        <p className="guide-proof"><Icon name="shield" size={15} /> Wondering how a site can do this without uploading anything? <Link href="/prove-it">See the proof</Link>.</p>
      </article>

      {related.length > 0 && (
        <section className="related">
          <h2>More guides</h2>
          <div className="guide-grid">
            {related.map((r) => r && (
              <Link key={r.slug} href={`/guides/${r.slug}`} className="card guide-card">
                <b>{r.title}</b>
                <span className="muted">{r.description}</span>
                <span className="guide-meta">{r.minutes} min read</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
