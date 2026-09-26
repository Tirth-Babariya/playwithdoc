import Link from "next/link";
import { Icon, toolIcon } from "@/components/Icon";
import { MarkSeen } from "@/components/WhatsNewLink";
import { CHANGELOG } from "@/lib/changelog";
import { pageMeta } from "@/lib/seo";
import { getTool } from "@/lib/tools";

export const metadata = {
  ...pageMeta({ path: "/whats-new", title: "What’s new — latest free PDF and document tools", description: "See the newest tools and improvements on PlayWithDoc: QR codes, document properties, Markdown conversions and more. Free and private." }),
};
metadata.alternates = { canonical: "/whats-new", types: { "application/atom+xml": "/whats-new/feed.xml" } };

const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("en", { dateStyle: "long", timeZone: "UTC" });

export default function WhatsNew() {
  return (
    <div className="container narrow wn">
      <MarkSeen />
      <header className="tool-head">
        <span className="chip chip-sm chip-any"><Icon name="bell" size={12} /> Updates</span>
        <h1>What’s new</h1>
        <p className="lead">The newest tools and improvements. Everything stays free, private and on your device. <a href="/whats-new/feed.xml">Subscribe with RSS</a>.</p>
      </header>
      <ol className="wn-list">
        {CHANGELOG.map((c, i) => (
          <li key={c.id} className="card wn-item" id={c.id}>
            <div className="wn-top">
              <time dateTime={c.date}>{fmt(c.date)}</time>
              {i === 0 && <span className="new-chip">Latest</span>}
            </div>
            <h2>{c.title}</h2>
            <p className="muted">{c.summary}</p>
            <ul>{c.points.map((p, k) => <li key={k}><Icon name="check" size={14} />{p}</li>)}</ul>
            {!!c.tools?.length && (
              <div className="wn-tools">
                {c.tools.map((s) => { const t = getTool(s); return t ? <Link key={s} href={`/tools/${s}`} className="btn btn-secondary btn-sm"><Icon name={toolIcon(t.slug, t.cat)} size={14} /> {t.name}</Link> : null; })}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
