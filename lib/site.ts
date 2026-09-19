/** Canonical site URL: set NEXT_PUBLIC_SITE_URL on Vercel once you have a custom domain (e.g. https://playwithdoc.com). */
export const SITE_URL: string =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
