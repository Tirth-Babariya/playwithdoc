import type { Metadata } from "next";

export const SITE_NAME = "PlayWithDoc";

/**
 * Google Search Console "HTML tag" verification token. It is meant to be public — it sits in the page's HTML for
 * anyone to read — and only proves that this site's owner controls the Search Console property.
 * Forks can override it with NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION.
 */
export const GOOGLE_VERIFICATION = process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION || "a8def0hqLo1cUbvcdekTOHOxBZDnDbyJJyF9p7ynOao";

/** Per-page metadata: unique title + description, a canonical URL, and matching Open Graph / Twitter cards. */
export function pageMeta(o: { path: string; title: string; description: string; ogTitle?: string; type?: "website" | "article" }): Metadata {
  const social = o.ogTitle ?? o.title;
  return {
    title: o.title,
    description: o.description,
    alternates: { canonical: o.path },
    openGraph: { title: social, description: o.description, url: o.path, siteName: SITE_NAME, type: o.type ?? "website" },
    twitter: { card: "summary_large_image", title: social, description: o.description },
  };
}
