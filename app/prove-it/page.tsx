import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { ProveIt } from "@/components/ProveIt";

export const metadata: Metadata = {
  title: "Prove it — your files never leave your device",
  description: "Don’t take our word for it. A live demo of how PlayWithDoc works with no uploads: watch the network, give it a file, and try to make it send data away.",
};

export default function ProveItPage() {
  return (
    <div className="container tool-page">
      <nav className="crumbs" aria-label="Breadcrumb"><Link href="/">PlayWithDoc</Link><Icon name="arrow" size={11} /><span>Prove it</span></nav>
      <header className="tool-head">
        <span className="chip chip-lg chip-any"><Icon name="shield" size={13} /> &nbsp;VERIFY IT YOURSELF</span>
        <h1>Don’t take our word for it.</h1>
        <p className="lead">Every converter says “your files are safe”. Here you can check. Watch what this page requests, give it a file, and try to make it send something away.</p>
      </header>
      <ProveIt />
      <div className="proof-cta card">
        <div><b>Convinced?</b><p className="muted">Try a tool and keep the Network tab open.</p></div>
        <Link href="/#tools" className="btn btn-primary">Browse the tools <Icon name="arrow" size={16} /></Link>
      </div>
    </div>
  );
}
