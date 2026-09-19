# End-to-end tests

Real-browser tests that drive PlayWithDoc like a person would — dragging cards, signing a PDF, running OCR, going offline.

| Suite | What it covers |
|---|---|
| `features.test.mjs` | 53 checks: image previews, drag-reorder, rotate, rename, target-size compression, OCR, protect/unlock, sign/edit/redact, PowerPoint round-trip, privacy badge and network lock |
| `offline.test.mjs` | 18 checks: after one visit, tools you never opened still work with the network **off** (merge, PDF→JPG, protect, Word→PDF, editor, palette, OCR pack) |
| `extras.test.mjs` | Photo & signature presets (exact pixels + KB limits), fillable forms, Compare PDFs, PDF to Excel, Recipes |
| `devices.test.mjs` | 11 phone/tablet/desktop profiles with touch: no sideways scrolling, navbar fits, tap controls work |

## Run them locally

They test the **production build** (the service worker and security headers only exist there):

```bash
npm install
npx playwright-core install chromium     # one-time: downloads the test browser
npm run build
npm start                                # serves on http://localhost:3000
```

In a second terminal:

```bash
BASE_URL=http://localhost:3000 npm run test:features
BASE_URL=http://localhost:3000 npm run test:offline
BASE_URL=http://localhost:3000 npm run test:devices
BASE_URL=http://localhost:3000 npm run test:extras
```

On Windows PowerShell use `$env:BASE_URL="http://localhost:3000"; npm run test:features`.
To use an installed Chrome/Edge instead of the downloaded browser, set `CHROME_PATH` to its `.exe`.

Sample files are generated automatically into `tests/e2e/.fixtures`; screenshots land in `tests/e2e/.out` (both git-ignored).

## On GitHub

`.github/workflows/ci.yml` runs a type-check and build, then all four suites in parallel, on every push to `main` and every pull request.
When a suite fails, its screenshots are attached to the run as an artifact.
