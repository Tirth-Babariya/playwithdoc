/** Tiny on-device history of tools you've used (tool names only — never file names or contents). */
const KEY = "af-recent";
export type Recent = { slug: string; at: number };

export function getRecent(): Recent[] {
  try { return JSON.parse(localStorage.getItem(KEY) || "[]"); } catch { return []; }
}

export function pushRecent(slug: string) {
  try {
    const list = getRecent().filter((r) => r.slug !== slug);
    list.unshift({ slug, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 6)));
  } catch { /* storage unavailable */ }
}
