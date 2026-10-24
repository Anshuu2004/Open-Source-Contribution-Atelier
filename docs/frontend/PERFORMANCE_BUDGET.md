# Performance Budget

`frontend/performance-budget.json` holds the performance limits for the frontend.
The `Performance Budget` workflow (`.github/workflows/performance-budget.yml`) runs
on every PR that touches `frontend/` and fails if a limit is broken.

## What gets checked

| Section      | Checked by                                                                 | In CI |
| ------------ | -------------------------------------------------------------------------- | ----- |
| `bundle`     | `frontend/scripts/analyze-bundle.ts` (`npm run perf:budget`)               | yes   |
| `lighthouse` | Lighthouse CI with `frontend/lighthouserc.cjs` (`npm run perf:lighthouse`) | yes   |
| `api`        | nothing yet, target values only                                            | no    |
| `database`   | nothing yet, target values only                                            | no    |

### Bundle

Sizes are gzipped KB of the files in `dist/client/assets` (source maps and the
precompressed `.gz` / `.br` copies are skipped).

- `totalJsGzipKB`: all JS chunks added together, including lazy loaded routes
- `singleChunkMaxKB`: the biggest single JS chunk
- `totalCssGzipKB`: all CSS files added together

The script also writes a report to `frontend/public/performance.json`, which the
admin performance dashboard reads.

### Lighthouse

`lighthouserc.cjs` reads its thresholds straight from the `lighthouse` section of
the budget file, so there is only one place to change them. Category scores are
0 to 100 in the budget file (Lighthouse CI wants 0 to 1, the config converts).

It builds nothing itself. It starts `npm run preview` on port 4173 and audits `/`
and `/learn` three times each with the default mobile throttling. No backend is
needed because both pages are prerendered.

## Current numbers

Measured on a production build from `main` (October 2026):

| Metric                             | Measured    | Budget   |
| ---------------------------------- | ----------- | -------- |
| Total JS (gzip)                    | 3164 KB     | 3500 KB  |
| Biggest chunk (`y-monaco`)         | 614 KB      | 700 KB   |
| Total CSS (gzip)                   | 63 KB       | 100 KB   |
| Performance score                  | 54 to 57    | 50       |
| Accessibility                      | 97 to 98    | 90       |
| Best practices                     | 96          | 90       |
| SEO                                | 91          | 90       |
| Largest Contentful Paint           | about 8.9 s | 10000 ms |
| Cumulative Layout Shift            | 0 to 0.093  | 0.1      |
| Time to Interactive (warning only) | about 9.7 s | 12000 ms |

The bundle and performance limits are set a little above what the app does today,
so they catch regressions without failing every PR. Treat them as a ratchet: when
a PR makes things faster or smaller, lower the matching number in the budget file
in the same PR. The biggest win right now is the initial load, `index.html`
preloads the `y-monaco` editor chunk even on the login page.

## Running the checks locally

From `frontend/`:

```bash
npm install
npm run build              # full production build into dist/
npm run perf:budget        # bundle size check
npm run perf:lighthouse    # Lighthouse CI, needs Chrome or Chromium installed
```

`npm run analyze-bundle` still works too, it rebuilds the client first and then
runs the same bundle check.

If Lighthouse can't find Chrome, point it at any Chromium based browser:

```bash
CHROME_PATH="/path/to/chrome" npm run perf:lighthouse
```

Lighthouse uploads the report to temporary public storage and prints the link.
To keep the reports local instead:

```bash
npx lhci autorun --upload.target=filesystem --upload.outputDir=.lighthouseci
```

`npm run perf:budget` rewrites `frontend/public/performance.json`. Don't commit
that change unless you mean to update the dashboard data. `.lighthouseci/` is
gitignored.
