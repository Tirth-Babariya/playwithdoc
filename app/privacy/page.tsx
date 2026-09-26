import type { Metadata } from "next";
import { pageMeta } from "@/lib/seo";
import Link from "next/link";

export const metadata: Metadata = pageMeta({ path: "/privacy", title: "Privacy", description: "PlayWithDoc processes your files on your own device. Nothing is uploaded, and there are no accounts, ads or analytics." });

export default function Privacy() {
  return (
    <div className="container tool-page legal">
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">PlayWithDoc</Link><span>/</span><span>Privacy</span></nav>
      <h1>Privacy</h1>
      <p className="lead">The short version: your files never leave your device.</p>

      <h2>Your files</h2>
      <p>Every tool runs inside your browser. Files you add are read into your device’s memory, processed there, and disappear when you close or refresh the tab. They are never uploaded to PlayWithDoc or to anyone else. The site tells your browser to refuse connections to other websites, and each tool page shows a live counter of uploads made by the page (it stays at zero).</p>

      <h2>What is stored on your device</h2>
      <ul>
        <li><b>Preferences:</b> your theme (light, dark or system).</li>
        <li><b>Recent tools:</b> the names of tools you used last, to speed up search. Never file names or contents.</li>
        <li><b>Saved signatures:</b> only if you tick “Remember on this device”. You can delete them any time from the signature window.</li>
        <li><b>Offline copy:</b> the app itself, saved by your browser so it works without internet. It contains no personal data.</li>
      </ul>
      <p>All of this stays in your browser. Clearing site data removes it.</p>

      <h2>What we don’t do</h2>
      <p>No accounts, no advertising, no tracking cookies and no third-party analytics. Fonts and processing engines are served from this site itself.</p>

      <h2>Hosting</h2>
      <p>Like any website, the host that serves these pages may keep standard technical request logs (for example, IP address and requested page) for security and reliability. Those logs never include your files, because your files are never sent.</p>

      <h2>Your responsibility</h2>
      <p>Tools such as Unlock PDF are meant for documents you have the right to open. Always proofread OCR and conversion results before relying on them.</p>

      <h2>Contact</h2>
      <p>Questions? Reach out via <a href="https://github.com/Tirth-Babariya/" target="_blank" rel="noopener noreferrer">GitHub</a>.</p>
    </div>
  );
}
