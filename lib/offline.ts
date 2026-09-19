/** Optional engines that are big enough to download only on request (or on first use). */
export const PACK_FILES = [
  "/vendor/heic2any.min.js",
  "/vendor/tesseract/tesseract.min.js",
  "/vendor/tesseract/worker.min.js",
  "/vendor/tesseract/tesseract-core-simd-lstm.wasm.js",
  "/vendor/tesseract/tesseract-core-relaxedsimd-lstm.wasm.js",
  "/vendor/tesseract/tesseract-core-lstm.wasm.js",
  ...["eng", "hin", "spa", "fra", "deu", "por", "ita", "rus", "ara"].map((l) => `/vendor/tesseract/lang/${l}.traineddata.gz`),
];
export const PACK_SIZE_MB = 24;

export async function packsCached(): Promise<number> {
  if (typeof caches === "undefined") return 0;
  let n = 0;
  for (const u of PACK_FILES) if (await caches.match(u)) n++;
  return n;
}
