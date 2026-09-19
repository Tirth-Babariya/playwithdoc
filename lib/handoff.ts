/**
 * In-memory hand-off of files between pages. Survives client-side navigation
 * (dropping a file on the home page → opening a tool, or piping a result into
 * the next tool) without anything ever leaving the browser.
 */
let pending: File[] = [];

export function setPending(files: File[]) { pending = files; }
export function takePending(): File[] {
  const f = pending;
  pending = [];
  return f;
}
