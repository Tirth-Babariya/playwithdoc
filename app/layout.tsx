import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { PaletteProvider } from "@/components/CommandPalette";
import { Effects } from "@/components/Effects";
import { ToastProvider } from "@/components/Toast";
import { Footer, Header } from "@/components/Header";
import { GOOGLE_VERIFICATION, SITE_NAME } from "@/lib/seo";
import { SITE_URL } from "@/lib/site";
import "./globals.css";
import "./premium.css";
import "./premium2.css";
import "./premium3.css";
import "./premium4.css";
import "./premium5.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: "PlayWithDoc — Convert anything to anything. Privately.", template: "%s · PlayWithDoc" },
  description: "Free PDF and file tools that run entirely in your browser. Merge, split, compress and convert PDF, Word, Excel and images with one keystroke. No sign-up, no uploads.",
  applicationName: "PlayWithDoc",
  openGraph: { title: "PlayWithDoc — Convert anything to anything", description: "Every PDF and image tool, free, private and one keystroke away.", type: "website", siteName: SITE_NAME, locale: "en_US" },
  twitter: { card: "summary_large_image", title: "PlayWithDoc — Convert anything to anything", description: "Every PDF and image tool, free, private and one keystroke away." },
  verification: { google: GOOGLE_VERIFICATION },
  authors: [{ name: "Tirth Babariya", url: "https://github.com/Tirth-Babariya/" }],
  creator: "Tirth Babariya",
  category: "utilities",
  robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: light)", color: "#ffffff" }, { media: "(prefers-color-scheme: dark)", color: "#000000" }],
};

const themeScript = `(function(){try{var t=localStorage.getItem('af-theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);var e=document.documentElement;e.dataset.theme=d?'dark':'light';e.dataset.pref=t}catch(_){}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <head><script dangerouslySetInnerHTML={{ __html: themeScript }} /></head>
      <body>
        <ToastProvider>
          <PaletteProvider>
            <Effects />
            <Header />
            <main>{children}</main>
            <Footer />
          </PaletteProvider>
        </ToastProvider>
      </body>
    </html>
  );
}
