"use client";

import Link from "next/link";
import { Icon, Logo } from "./Icon";
import { usePalette } from "./CommandPalette";
import { OfflineStatus } from "./OfflineStatus";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  const { open, mod } = usePalette();
  return (
    <header className="hdr">
      <div className="container hdr-in">
        <Link href="/" className="brand" aria-label="PlayWithDoc home">
          <Logo /> <span className="wordmark">PlayWith<i>Doc</i></span>
        </Link>
        <nav className="hdr-nav" aria-label="Primary">
          <Link href="/#tools">Tools</Link>
          <Link href="/recipes">Recipes</Link>
          <Link href="/#why">Why PlayWithDoc</Link>
          <Link href="/#faq">FAQ</Link>
        </nav>
        <span className="grow" />
        <button className="hdr-search" onClick={() => open()} aria-label="Search conversions">
          <Icon name="search" size={15} />
          <span>Search tools…</span>
          <kbd>{mod}</kbd><kbd>K</kbd>
        </button>
        <OfflineStatus />
        <ThemeToggle />
        <a className="hdr-gh" href="https://github.com/Tirth-Babariya/playwithdoc" target="_blank" rel="noopener noreferrer" aria-label="PlayWithDoc source code on GitHub" title="View the source on GitHub">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" /></svg>
        </a>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="ftr">
      <div className="container ftr-in">
        <div>
          <Link href="/" className="brand"><Logo size={22} /> <span className="wordmark">PlayWith<i>Doc</i></span></Link>
          <p className="muted">Every conversion, one keystroke away.<br />Free. No sign-up. Your files stay on your device.</p>
        </div>
        <div className="ftr-cols">
          <div><h4>PDF</h4><Link href="/tools/merge-pdf">Merge</Link><Link href="/tools/split-pdf">Split</Link><Link href="/tools/compress-pdf">Compress</Link><Link href="/tools/organize-pdf">Organize</Link></div>
          <div><h4>Convert</h4><Link href="/tools/jpg-to-pdf">JPG to PDF</Link><Link href="/tools/word-to-pdf">Word to PDF</Link><Link href="/tools/pdf-to-word">PDF to Word</Link><Link href="/tools/pdf-to-jpg">PDF to JPG</Link></div>
          <div><h4>Images</h4><Link href="/tools/heic-to-jpg">HEIC to JPG</Link><Link href="/tools/png-to-jpg">PNG to JPG</Link><Link href="/tools/webp-to-png">WEBP to PNG</Link><Link href="/tools/compress-image">Compress image</Link></div>
        </div>
      </div>
      <div className="container ftr-base">
        <span>© {new Date().getFullYear()} PlayWithDoc</span>
        <span className="ftr-built">
          Built by{" "}
          <a href="https://github.com/Tirth-Babariya/" target="_blank" rel="noopener noreferrer">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5A11.5 11.5 0 0 0 .5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.69 1.25 3.35.96.1-.75.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.42-2.7 5.4-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 23.5 12 11.5 11.5 0 0 0 12 .5Z" /></svg>
            Tirth Babariya
          </a>
        </span>
        <span>Processing happens 100% in your browser. · <Link href="/privacy">Privacy</Link></span>
      </div>
    </footer>
  );
}
