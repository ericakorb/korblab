# OmiScope — E2E Test Suite

End-to-end tests using [Playwright](https://playwright.dev/). Tests run against your local Jekyll dev server.

## Setup (one time)

```bash
# From the project root
npm install --save-dev @playwright/test
npx playwright install chromium
```

## Running tests

Make sure your Jekyll server is running first:

```bash
bundle exec jekyll serve
```

Then in a separate terminal, from the project root:

```bash
npx playwright test --config=tests/playwright.config.js
```

Or from inside the `tests/` directory:

```bash
cd tests
npx playwright test
```

To see a full HTML report after the run:

```bash
npx playwright show-report tests/report
```

## Visual snapshots

On first run, Playwright generates baseline screenshots in `tests/omiscope.spec.js-snapshots/`. These are committed to version control and act as the visual baseline.

If you make an **intentional** UI change, update the snapshots:

```bash
npx playwright test --config=tests/playwright.config.js --update-snapshots
```

Review the diff in the HTML report before committing updated snapshots.

## Test coverage

| Group | What's tested |
|---|---|
| Page load | Overlay behaviour, dataset selector populated, sections hidden on load |
| Dataset selection | Description, organism, gene count, download button visibility |
| Gene search | Results appear, no-results message, spaces in gene names, keyboard dismiss |
| Gene selection | Click & keyboard selection, deduplication, tag removal, Clear all |
| Data correctness | Plotly bar mean, scatter point values, group count, y-axis label, figcaption |
| Downloads | Button enabled/disabled states, file download triggered, filename correct |
| Accessibility | ARIA roles, aria-expanded, aria-label on remove buttons, h2 headings, figure elements |

## Notes

- The data correctness tests use known values from `datasets/batch1.csv` (Gapdh, Day 0 Female). If the CSV changes, update the expected values at the top of the `Data correctness` describe block.
- Visual snapshots are platform-sensitive — generate and commit them on the same OS you'll run CI on (or pin to a Docker image).
- The `maxDiffPixelRatio` tolerance (0.5%) is set in `playwright.config.js` — increase it if font rendering differences cause flaky failures across machines.