const prod = process.env.NODE_ENV === "production";

// The point of this site: your files never leave the device. In production the browser itself enforces it —
// this page may only talk to its own origin (connect-src), so a bug or a tampered script still can't upload anything.
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self' data:",
  "connect-src 'self' blob: data:",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Lets phones / other devices on your LAN open the dev server (HMR would be blocked otherwise).
  allowedDevOrigins: ["10.*.*.*", "192.168.*.*", "172.*.*.*"],
  async headers() {
    if (!prod) return [];
    return [
      { source: "/(.*)", headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Referrer-Policy", value: "no-referrer" },
        { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(), interest-cohort=()" },
      ] },
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
      // Engines rarely change and the service worker versions them, so let browsers/CDN keep them for a week.
      { source: "/vendor/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800, stale-while-revalidate=86400" }] },
      { source: "/icons/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=604800" }] },
    ];
  },
};
export default nextConfig;
