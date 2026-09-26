import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";
import { SITE_URL } from "@/lib/site";
import { TOOLS } from "@/lib/tools";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: SITE_URL, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/recipes`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/guides`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${SITE_URL}/whats-new`, lastModified: now, changeFrequency: "weekly", priority: 0.6 },
    { url: `${SITE_URL}/prove-it`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
    ...GUIDES.map((g) => ({ url: `${SITE_URL}/guides/${g.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${SITE_URL}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.3 },
    ...TOOLS.map((t) => ({ url: `${SITE_URL}/tools/${t.slug}`, lastModified: now, changeFrequency: "monthly" as const, priority: t.featured ? 0.9 : 0.6 })),
  ];
}
