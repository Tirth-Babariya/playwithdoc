import { FormatChip } from "@/components/FormatChip";
import { Hero } from "@/components/Hero";
import { Icon } from "@/components/Icon";
import { ToolExplorer } from "@/components/ToolExplorer";
import { UniversalDrop } from "@/components/UniversalDrop";
import { FORMATS, type Fmt } from "@/lib/formats";
import { ROADMAP, TOOLS } from "@/lib/tools";

const MARQUEE = (Object.keys(FORMATS) as Fmt[]).filter((f) => f !== "zip");

const FAQ = [
  ["Is it really free? What’s the catch?", "There’s no catch and no limit on files, pages or size. Everything runs on your own device, so it costs us nothing to serve you. There are no accounts, watermarks or daily quotas."],
  ["Are my files uploaded anywhere?", "No. Files are read and converted by your browser using WebAssembly and JavaScript. They are never sent to a server — open your browser’s network tab while converting and you’ll see nothing leaving your device."],
  ["How does Compress PDF work without a server?", "Lossless mode rewrites the file structure and keeps text selectable (small savings). Balanced and Smallest re-render pages as optimized images — which is where the big savings on scans and photo-heavy PDFs come from — so text is no longer selectable in those modes. If the result isn’t smaller, we keep your original."],
  ["How good are Word ⇄ PDF conversions?", "Word to PDF keeps text, headings, lists, tables and images. PDF to Word keeps text and headings. Both simplify complex layouts, fonts and floating objects — they’re built for speed, privacy and everyday documents, not pixel-perfect desktop publishing."],
  ["Does it work on scanned PDFs?", "Yes. OCR PDF makes a scan searchable and selectable, and Scan to Text extracts the words — recognition runs on your device in 9 languages. Quality depends on the scan; always proofread."],
  ["How can I be sure nothing is uploaded?", "Three ways: the live counter on every tool page, your browser’s Network tab, and a security policy the site sends that makes the browser refuse connections to any other website. Files stay in memory and disappear when you close the tab."],
  ["Does it work offline?", "Yes — it’s built offline-first. The first time you visit, PlayWithDoc saves the whole app to your device, so every PDF, image and Office tool works with no connection, even ones you never opened. The big OCR and HEIC engines (about 24 MB) download only if you ask, from the “Offline ready” menu. New versions install quietly and wait for you to reload."],
  ["What are the limits?", "Your device’s memory. Typical documents and photos are instant; very large files (hundreds of MB) may be slow on phones."],
] as const;

const STEPS = [
  ["01", "Press ⌘/Ctrl K", "Or drop a file — PlayWithDoc detects it and lists every format it can become."],
  ["02", "Type what you want", "“jpg to pdf”, “compress”, “heic”. Fuzzy, forgiving, keyboard-first."],
  ["03", "Enter. Done.", "Sensible defaults mean most conversions start instantly and finish in seconds."],
];

export default function Home() {
  const nTools = TOOLS.length;
  return (
    <>
      <Hero />
      <UniversalDrop />

      <div className="marquee" aria-label="Supported formats">
        <div className="marquee-track">
          {[...MARQUEE, ...MARQUEE].map((f, i) => <FormatChip key={i} f={f} size="lg" />)}
        </div>
      </div>

      <section className="container sec" id="why">
        <div className="sec-head" data-reveal>
          <span className="eyebrow">Why PlayWithDoc</span>
          <h2>The fastest way from <span className="grad">A to B.</span></h2>
          <p className="lead">Built for people who just want the file converted — no ads, no queues, no “upgrade to continue”.</p>
        </div>

        <div className="bento">
          <div className="card b-wide b-priv">
            <div className="b-txt">
              <span className="b-ico"><Icon name="shield" size={20} /></span>
              <h3>Your files never leave your device</h3>
              <p>Every tool runs locally in your browser. No upload, no server copy, nothing to delete afterwards. Contracts, IDs, invoices — convert them without a second thought.</p>
            </div>
            <div className="b-vis" aria-hidden>
              <div className="net">
                <div className="net-head"><i /><i /><i /><span>Network</span></div>
                <div className="net-row"><span>playwithdoc</span><em>document</em></div>
                <div className="net-row"><span>/tools/jpg-to-pdf</span><em>fetch</em></div>
                <div className="net-row ok"><span>your-photos.jpg → PDF</span><em>0 bytes uploaded</em></div>
              </div>
            </div>
          </div>

          <div className="card b-cmd" data-reveal style={{ "--i": 1 } as React.CSSProperties}>
            <span className="b-ico"><Icon name="command" size={20} /></span>
            <h3>One shortcut for {nTools}+ conversions</h3>
            <p>Press <kbd>Ctrl</kbd><kbd>K</kbd> (or <kbd>Ctrl</kbd><kbd>S</kbd>), type “jpg to pdf” and hit enter. Two seconds from any page.</p>
            <div className="mini-pal" aria-hidden>
              <div className="mp-in"><Icon name="search" size={14} /> jpg to pd<i className="caret" /></div>
              <div className="mp-row on"><FormatChip f="jpg" size="sm" /> JPG to PDF <kbd>↵</kbd></div>
              <div className="mp-row"><FormatChip f="heic" size="sm" /> HEIC to PDF</div>
              <div className="mp-row"><FormatChip f="png" size="sm" /> PNG to PDF</div>
            </div>
          </div>

          <div className="card b-pipe" data-reveal style={{ "--i": 2 } as React.CSSProperties}>
            <span className="b-ico"><Icon name="link" size={20} /></span>
            <h3>Pipe results into the next tool</h3>
            <p>Converted a Word file? Send the PDF straight into Compress or Merge — no download, no re-upload, no clicks in between.</p>
            <div className="pipe" aria-hidden><FormatChip f="docx" /><Icon name="arrow" size={14} /><FormatChip f="pdf" /><Icon name="arrow" size={14} /><span className="chip chip-md chip-any">SMALLER PDF</span></div>
          </div>

          <div className="card b-drop" data-reveal style={{ "--i": 3 } as React.CSSProperties}>
            <span className="b-ico"><Icon name="sparkle" size={20} /></span>
            <h3>Drop first, decide later</h3>
            <p>Not sure what tool you need? Drop the file — PlayWithDoc shows every format it can become.</p>
          </div>

          <div className="card b-off" data-reveal style={{ "--i": 4 } as React.CSSProperties}>
            <span className="b-ico"><Icon name="zap" size={20} /></span>
            <h3>Instant. No queue.</h3>
            <p>Nothing to upload or wait for. Your own device does the work, so results land in seconds.</p>
          </div>

          <div className="card b-free" data-reveal style={{ "--i": 5 } as React.CSSProperties}>
            <span className="b-ico"><Icon name="infinity" size={20} /></span>
            <h3>Free. Actually.</h3>
            <p>No account, no watermark, no file limits, no “3 tasks per day”.</p>
          </div>
        </div>
      </section>

      <section className="container sec" id="tools">
        <div className="sec-head" data-reveal>
          <span className="eyebrow">All tools</span>
          <h2>{nTools} conversions. Zero friction.</h2>
          <p className="lead">Every everyday PDF, image and document tool — free, fast and private.</p>
        </div>
        <ToolExplorer />
      </section>

      <section className="container sec">
        <div className="sec-head" data-reveal>
          <span className="eyebrow">How it feels</span>
          <h2>Three moves. That’s it.</h2>
        </div>
        <div className="steps">
          {STEPS.map(([n, t, d]) => (
            <div className="card step" key={n} data-reveal style={{ "--i": Number(n) } as React.CSSProperties}><span className="step-n">{n}</span><h3>{t}</h3><p>{d}</p></div>
          ))}
        </div>
      </section>

      <section className="container sec">
        <div className="sec-head" data-reveal>
          <span className="eyebrow">Compared</span>
          <h2>PlayWithDoc vs. typical online converters</h2>
        </div>
        <div className="card cmp-wrap" data-reveal>
          <div className="cmp-scroll">
          <table className="cmp">
            <thead><tr><th /><th className="us">PlayWithDoc</th><th>Typical converter sites</th></tr></thead>
            <tbody>
              {[
                ["Your files are uploaded", "Never", "Always"],
                ["Account required", "No", "Often, after a few uses"],
                ["Daily / size limits", "None", "Common on free tiers"],
                ["Wait for upload & download", "None — instant", "Depends on your connection"],
                ["Jump to any tool", "One keystroke", "Menus & page loads"],
                ["Send output into another tool", "One click", "Download, then re-upload"],
              ].map(([a, b, c]) => (
                <tr key={a}><td>{a}</td><td className="us"><Icon name="check" size={15} /> {b}</td><td>{c}</td></tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      </section>

      <section className="container sec" id="faq">
        <div className="sec-head" data-reveal><span className="eyebrow">FAQ</span><h2>Straight answers</h2></div>
        <div className="faq" data-reveal>
          {FAQ.map(([q, a]) => (
            <details key={q}><summary>{q}<Icon name="plus" size={16} /></summary><p>{a}</p></details>
          ))}
        </div>
        <p className="roadmap"><b>On the roadmap:</b> {ROADMAP.join(" · ")}</p>
      </section>

      <section className="container cta">
        <div className="card cta-in" data-reveal>
          <h2>Convert something now.</h2>
          <p className="muted">Press <kbd>Ctrl</kbd><kbd>K</kbd> anywhere on this site.</p>
        </div>
      </section>
    </>
  );
}
