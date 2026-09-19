import Link from "next/link";

export default function NotFound() {
  return (
    <div className="container" style={{ padding: "120px 24px", textAlign: "center" }}>
      <h1 style={{ fontSize: 56, letterSpacing: "-0.04em" }}>404</h1>
      <p className="lead" style={{ margin: "12px 0 28px" }}>That tool doesn’t exist — yet.</p>
      <Link href="/" className="btn btn-primary">Back to all tools</Link>
    </div>
  );
}
