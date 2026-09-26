import { CHANGELOG } from "@/lib/changelog";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function GET() {
  const entries = CHANGELOG.map((c) => `  <entry>
    <id>${SITE_URL}/whats-new#${c.id}</id>
    <title>${esc(c.title)}</title>
    <link href="${SITE_URL}/whats-new#${c.id}"/>
    <updated>${c.date}T12:00:00Z</updated>
    <summary>${esc(c.summary)}</summary>
    <content type="html">${esc(`<ul>${c.points.map((p) => `<li>${esc(p)}</li>`).join("")}</ul>`)}</content>
  </entry>`).join("\n");
  const xml = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <id>${SITE_URL}/whats-new</id>
  <title>PlayWithDoc — What’s new</title>
  <link href="${SITE_URL}/whats-new"/>
  <link rel="self" href="${SITE_URL}/whats-new/feed.xml"/>
  <updated>${CHANGELOG[0].date}T12:00:00Z</updated>
  <author><name>Tirth Babariya</name></author>
${entries}
</feed>
`;
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8" } });
}
