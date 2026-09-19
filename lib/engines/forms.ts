import { baseName } from "../formats";
import type { Ctx, Result } from "../types";
import { loadPdfLib, pdfBlob, UserError } from "./common";

export type FieldKind = "text" | "check" | "radio" | "select" | "list";
export type FormField = { name: string; kind: FieldKind; options?: string[]; multiline?: boolean; value: string | boolean | string[]; page?: number; readOnly?: boolean };

/** Reads every fillable field (text boxes, check boxes, radio groups, drop-downs, lists) from a PDF. */
export async function readForm(file: File): Promise<FormField[]> {
  const lib = await import("pdf-lib");
  const doc = await loadPdfLib(file, { lenient: true });
  let fields;
  try { fields = doc.getForm().getFields(); } catch { return []; }
  const pages = doc.getPages();
  const out: FormField[] = [];
  for (const f of fields) {
    let page: number | undefined;
    try {
      const ref = (f as any).acroField.getWidgets()[0]?.P?.();
      const idx = ref ? pages.findIndex((p) => p.ref === ref) : -1;
      if (idx >= 0) page = idx;
    } catch { /* page unknown */ }
    const base = { name: f.getName(), page, readOnly: f.isReadOnly() };
    if (f instanceof lib.PDFTextField) out.push({ ...base, kind: "text", multiline: f.isMultiline(), value: f.getText() ?? "" });
    else if (f instanceof lib.PDFCheckBox) out.push({ ...base, kind: "check", value: f.isChecked() });
    else if (f instanceof lib.PDFRadioGroup) out.push({ ...base, kind: "radio", options: f.getOptions(), value: f.getSelected() ?? "" });
    else if (f instanceof lib.PDFDropdown) out.push({ ...base, kind: "select", options: f.getOptions(), value: f.getSelected()[0] ?? "" });
    else if (f instanceof lib.PDFOptionList) out.push({ ...base, kind: "list", options: f.getOptions(), value: f.getSelected() });
    // buttons and signature fields can't be filled in here
  }
  return out;
}

export async function fillForm(files: File[], ctx: Ctx): Promise<Result> {
  const lib = await import("pdf-lib");
  const doc = await loadPdfLib(files[0], { lenient: true });
  const form = doc.getForm();
  const values: Record<string, string | boolean | string[]> = ctx.opts.formValues ?? {};
  const entries = Object.entries(values);
  if (!entries.length) throw new UserError("Fill in at least one field first.");

  let filled = 0;
  const skipped: string[] = [];
  entries.forEach(([name, val], i) => {
    ctx.progress(i / entries.length, "Filling fields");
    try {
      const f = form.getField(name);
      if (f instanceof lib.PDFTextField) { f.setText(typeof val === "string" ? val : ""); }
      else if (f instanceof lib.PDFCheckBox) { if (val) f.check(); else f.uncheck(); }
      else if (f instanceof lib.PDFRadioGroup) { if (typeof val === "string" && val) f.select(val); }
      else if (f instanceof lib.PDFDropdown) { if (typeof val === "string" && val) f.select(val); }
      else if (f instanceof lib.PDFOptionList) { if (Array.isArray(val)) f.select(val); }
      else return;
      filled++;
    } catch { skipped.push(name); }
  });
  if (!filled) throw new UserError("None of those fields could be filled. Try Edit PDF to type directly on the page.");

  const flatten = ctx.opts.flatten === "yes";
  if (flatten) form.flatten();
  const bytes = await doc.save({ useObjectStreams: true });
  return {
    files: [{ name: `${baseName(files[0].name)}-filled.pdf`, blob: pdfBlob(bytes) }],
    note: `${filled} field${filled === 1 ? "" : "s"} filled${flatten ? " and locked in place" : " — the form stays editable"}.${skipped.length ? ` Couldn’t fill: ${skipped.slice(0, 3).join(", ")}${skipped.length > 3 ? "…" : ""} (special characters some form fonts can’t show).` : ""}`,
  };
}
