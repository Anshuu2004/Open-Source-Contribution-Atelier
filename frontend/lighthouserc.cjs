// Lighthouse CI config. Thresholds come from performance-budget.json so the
// budget file is the single place to change them.
// Run locally: npm run build && npm run perf:lighthouse
// (see docs/frontend/PERFORMANCE_BUDGET.md)
const budget = require("./performance-budget.json").lighthouse;

module.exports = {
  ci: {
    collect: {
      numberOfRuns: 3,
      startServerCommand: "npm run preview -- --host 127.0.0.1 --port 4173",
      startServerReadyPattern: "Local",
      startServerReadyTimeout: 120000,
      url: ["http://127.0.0.1:4173/", "http://127.0.0.1:4173/learn"],
      settings: {
        chromeFlags: "--no-sandbox --headless=new --disable-gpu",
      },
    },
    assert: {
      assertions: {
        "categories:performance": [
          "error",
          { minScore: budget.performance / 100 },
        ],
        "categories:accessibility": [
          "error",
          { minScore: budget.accessibility / 100 },
        ],
        "categories:best-practices": [
          "error",
          { minScore: budget.bestPractices / 100 },
        ],
        "categories:seo": ["error", { minScore: budget.seo / 100 }],
        "largest-contentful-paint": [
          "error",
          { maxNumericValue: budget.largestContentfulPaintMs },
        ],
        "cumulative-layout-shift": [
          "error",
          { maxNumericValue: budget.cumulativeLayoutShift },
        ],
        interactive: ["warn", { maxNumericValue: budget.interactiveMs }],
      },
    },
    upload: {
      target: "temporary-public-storage",
    },
  },
};
