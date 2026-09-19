import { baseName } from "../formats";
import type { Ctx, Result } from "../types";
import { loadScript, pdfBlob, UserError } from "./common";

/** Runs qpdf (WebAssembly) on one file and returns the output bytes. Each call gets a fresh virtual filesystem. */
export async function qpdfRun(file: File, args: string[]): Promise<Uint8Array> {
  await loadScript("/vendor/qpdf/qpdf.js");
  const create = (window as any).Module;
  const log: string[] = [];
  let status = 0;
  // This qpdf build binds to console.* when it starts, so capture BEFORE creating it; that lets us show a useful message.
  const saved = { error: console.error, warn: console.warn, log: console.log };
  const grab = (...a: unknown[]) => { log.push(a.join(" ")); };
  console.error = grab; console.warn = grab; console.log = grab;
  let q: any;
  try {
    q = await create({ locateFile: () => "/vendor/qpdf/qpdf.wasm", noInitialRun: true });
    q.FS.writeFile("/in.pdf", new Uint8Array(await file.arrayBuffer()));
    try { q.callMain(["/in.pdf", ...args, "/out.pdf"]); }
    catch (e: any) { status = typeof e?.status === "number" ? e.status : 2; }
  } finally { console.error = saved.error; console.warn = saved.warn; console.log = saved.log; }
  let bytes: Uint8Array | null = null;
  try { bytes = q.FS.readFile("/out.pdf"); } catch { /* qpdf wrote nothing */ }
  const msg = log.join("\n");
  if (!bytes || !bytes.length) {
    if (/invalid password/i.test(msg)) throw new UserError("Wrong password.");
    if (/password/i.test(msg) && /encrypt/i.test(msg)) throw new UserError("This PDF needs a password to open.");
    throw new UserError("This PDF could not be processed.");
  }
  void status;
  return bytes;
}

const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(36)).join("");

export async function protectPdf(files: File[], ctx: Ctx): Promise<Result> {
  const pw = String(ctx.opts.password || "");
  if (pw.length < 4) throw new UserError("Choose a password with at least 4 characters.");
  const allowPrint = ctx.opts.print !== "no", allowCopy = ctx.opts.copy === "yes", allowEdit = ctx.opts.edit === "yes";
  const outs = [];
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Encrypting ${files[i].name}`);
    const bytes = await qpdfRun(files[i], ["--encrypt", pw, rand(), "256", `--print=${allowPrint ? "full" : "none"}`, `--extract=${allowCopy ? "y" : "n"}`, `--modify=${allowEdit ? "all" : "none"}`, `--annotate=${allowEdit ? "y" : "n"}`, "--"]);
    outs.push({ name: `${baseName(files[i].name)}-protected.pdf`, blob: pdfBlob(bytes) });
  }
  return { files: outs, note: "Encrypted with AES-256. Keep your password safe — it can’t be recovered." };
}

export async function unlockPdf(files: File[], ctx: Ctx): Promise<Result> {
  const pw = String(ctx.opts.password || "");
  const outs = [];
  for (let i = 0; i < files.length; i++) {
    ctx.progress(i / files.length, `Unlocking ${files[i].name}`);
    const bytes = await qpdfRun(files[i], [`--password=${pw}`, "--decrypt"]);
    outs.push({ name: `${baseName(files[i].name)}-unlocked.pdf`, blob: pdfBlob(bytes) });
  }
  return { files: outs, note: "Password and restrictions removed. Only unlock files you’re allowed to." };
}
