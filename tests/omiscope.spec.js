// tests/omiscope.spec.js
//
// Prerequisites:
//   npm install --save-dev @playwright/test
//   npx playwright install chromium
//
// Run:
//   npx playwright test --config=tests/playwright.config.js
//
// Update visual snapshots after an intentional UI change:
//   npx playwright test --config=tests/playwright.config.js --update-snapshots

const { test, expect } = require('@playwright/test');

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Navigate to /data and wait for the app to finish initialising */
async function loadApp(page) {
  await page.goto('/data');
  // Loading overlay disappears once datasets/index.json is fetched and rendered
  await expect(page.locator('#omi-loading-overlay')).toHaveClass(/omi-hidden/, { timeout: 10_000 });
}

/**
 * Select the first dataset from the dropdown and wait for the CSV to parse.
 * Returns once the gene search section is visible.
 */
async function selectDataset(page, optionLabel = 'Primary Mouse Cultured Neuron Timecourse') {
  await page.selectOption('#dataset-select', { label: optionLabel });
  await expect(page.locator('#search-section')).not.toHaveClass(/omi-hidden/, { timeout: 15_000 });
}

/**
 * Type a query, wait for results, then click/keyboard-select a gene.
 * @param {string} query   - text to type into the search box
 * @param {string} gene    - exact gene symbol to select (must appear in results)
 * @param {'click'|'keyboard'} method
 */
async function selectGene(page, query, gene, method = 'click') {
  await page.fill('#gene-input', query);
  // Wait for at least one result item
  await expect(page.locator('.result-item').first()).toBeVisible({ timeout: 5_000 });

  if (method === 'click') {
    await page.locator(`.result-item[data-gene="${gene}"]`).click();
  } else {
    // Arrow-key to the right item then press Enter
    const items = page.locator('.result-item');
    const count = await items.count();
    for (let i = 0; i < count; i++) {
      const text = await items.nth(i).getAttribute('data-gene');
      if (text === gene) {
        // Press ArrowDown i+1 times from the input
        for (let j = 0; j <= i; j++) await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        break;
      }
    }
  }

  // Wait for the plot to appear
  const plotId = `plot-${gene.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
  await expect(page.locator(`#${plotId}`)).toBeVisible({ timeout: 10_000 });
}

// ─── 1. Page load ────────────────────────────────────────────────────────────

test.describe('Page load', () => {
  test('shows loading overlay then hides it', async ({ page }) => {
    await page.goto('/data');
    // Overlay should be present in the DOM
    await expect(page.locator('#omi-loading-overlay')).toBeAttached();
    // Then disappear
    await expect(page.locator('#omi-loading-overlay')).toHaveClass(/omi-hidden/, { timeout: 10_000 });
  });

  test('dataset selector is populated', async ({ page }) => {
    await loadApp(page);
    const options = page.locator('#dataset-select option:not([disabled])');
    await expect(options).toHaveCount(1); // adjust if you add more datasets
    await expect(options.first()).toHaveText('Primary Mouse Cultured Neuron Timecourse');
  });

  test('gene search section is hidden before dataset selected', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('#search-section')).toHaveClass(/omi-hidden/);
  });

  test('full dataset download button is hidden before dataset selected', async ({ page }) => {
    await loadApp(page);
    await expect(page.locator('#dl-csv-row')).toHaveClass(/omi-hidden/);
  });

  test('initial page visual snapshot', async ({ page }) => {
    await loadApp(page);
    await expect(page).toHaveScreenshot('01-initial-load.png', { fullPage: true });
  });
});

// ─── 2. Dataset selection ────────────────────────────────────────────────────

test.describe('Dataset selection', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test('selecting a dataset reveals gene search', async ({ page }) => {
    await selectDataset(page);
    await expect(page.locator('#search-section')).not.toHaveClass(/omi-hidden/);
  });

  test('shows correct dataset description', async ({ page }) => {
    await selectDataset(page);
    await expect(page.locator('#dataset-desc')).toHaveText('Neurons derived from male and female E16.5 cortical embryos for RNA-sequencing. Time points include 0 days in vitro (prior to plating), and 1, 5, 10, 15, and 20 days in vitro after plating. Y axis indicates normalized counts per million (CPM).');
  });

  test('shows correct organism', async ({ page }) => {
    await selectDataset(page);
    await expect(page.locator('#dataset-organism')).toHaveText('Mus musculus - mm10');
  });

  test('gene count is displayed after load', async ({ page }) => {
    await selectDataset(page);
    // Should show a number followed by "genes loaded"
    await expect(page.locator('#gene-count')).toHaveText(/\d+[\d,]* genes loaded/);
  });

  test('full dataset download button appears after dataset loads', async ({ page }) => {
    await selectDataset(page);
    await expect(page.locator('#dl-csv-row')).not.toHaveClass(/omi-hidden/);
  });

  test('after dataset selection visual snapshot', async ({ page }) => {
    await selectDataset(page);
    await expect(page).toHaveScreenshot('02-dataset-selected.png', { fullPage: true });
  });
});

// ─── 3. Gene search ──────────────────────────────────────────────────────────

test.describe('Gene search', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDataset(page);
  });

  test('typing shows matching results', async ({ page }) => {
    await page.fill('#gene-input', 'Gapdh');
    await expect(page.locator('.result-item').first()).toBeVisible();
    await expect(page.locator('.result-item[data-gene="Gapdh"]')).toBeVisible();
  });

  test('results are hidden when input is cleared', async ({ page }) => {
    await page.fill('#gene-input', 'Gapdh');
    await expect(page.locator('#search-results')).not.toHaveClass(/omi-hidden/);
    await page.fill('#gene-input', '');
    await expect(page.locator('#search-results')).toHaveClass(/omi-hidden/);
  });

  test('no results message shown for unknown gene', async ({ page }) => {
    await page.fill('#gene-input', 'ZZZZNOTAREALGENE');
    await expect(page.locator('.no-results')).toBeVisible();
  });

  test('gene names render without spurious spaces', async ({ page }) => {
    await page.fill('#gene-input', 'Gapdh');
    const item = page.locator('.result-item[data-gene="Gapdh"]');
    await expect(item).toBeVisible();
    // The text content of the item (excluding the checkmark) should be exactly the gene name
    const text = await item.evaluate(el => el.textContent.trim());
    expect(text).toBe('Gapdh');
  });

  test('Escape closes the dropdown', async ({ page }) => {
    await page.fill('#gene-input', 'Gapdh');
    await expect(page.locator('#search-results')).not.toHaveClass(/omi-hidden/);
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-results')).toHaveClass(/omi-hidden/);
  });

  test('Tab closes the dropdown', async ({ page }) => {
    await page.fill('#gene-input', 'Gapdh');
    await expect(page.locator('#search-results')).not.toHaveClass(/omi-hidden/);
    await page.keyboard.press('Tab');
    await expect(page.locator('#search-results')).toHaveClass(/omi-hidden/);
  });

  test('clicking outside closes the dropdown', async ({ page }) => {
    await page.fill('#gene-input', 'Gapdh');
    await expect(page.locator('#search-results')).not.toHaveClass(/omi-hidden/);
    await page.locator('#info-card').click();
    await expect(page.locator('#search-results')).toHaveClass(/omi-hidden/);
  });

  test('search results dropdown visual snapshot', async ({ page }) => {
    await page.fill('#gene-input', 'Gapdh');
    await expect(page.locator('.result-item').first()).toBeVisible();
    await expect(page.locator('#search-section')).toHaveScreenshot('03-search-dropdown.png');
  });
});

// ─── 4. Gene selection ───────────────────────────────────────────────────────

test.describe('Gene selection', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDataset(page);
  });

  test('clicking a result adds a gene tag', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await expect(page.locator('.gene-tag').filter({ hasText: 'Gapdh' })).toBeVisible();
  });

  test('selecting a gene reveals the chart section', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await expect(page.locator('#chart-section')).not.toHaveClass(/omi-hidden/);
  });

  test('selecting a gene reveals the download section', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await expect(page.locator('#download-section')).not.toHaveClass(/omi-hidden/);
  });

  test('input is cleared after selection', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await expect(page.locator('#gene-input')).toHaveValue('');
  });

  test('can select gene via keyboard arrow + Enter', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh', 'keyboard');
    await expect(page.locator('.gene-tag').filter({ hasText: 'Gapdh' })).toBeVisible();
  });

  test('selecting same gene twice does not duplicate it', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    // Result item should now be marked already-selected
    await page.fill('#gene-input', 'Gapdh');
    await expect(page.locator('.result-item.already-selected[data-gene="Gapdh"]')).toBeVisible();
    // Only one tag
    await expect(page.locator('.gene-tag').filter({ hasText: 'Gapdh' })).toHaveCount(1);
  });

  test('remove button deletes the tag', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await page.locator('.gene-tag-remove[aria-label="Remove Gapdh"]').click();
    await expect(page.locator('.gene-tag').filter({ hasText: 'Gapdh' })).toHaveCount(0);
  });

  test('removing last gene hides chart and download sections', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await page.locator('.gene-tag-remove[aria-label="Remove Gapdh"]').click();
    await expect(page.locator('#chart-section')).toHaveClass(/omi-hidden/);
    await expect(page.locator('#download-section')).toHaveClass(/omi-hidden/);
  });

  test('Clear all removes all tags', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await selectGene(page, 'Actb', 'Actb');
    await page.locator('#clear-genes').click();
    await expect(page.locator('.gene-tag')).toHaveCount(0);
    await expect(page.locator('#chart-section')).toHaveClass(/omi-hidden/);
  });

  test('single gene selection visual snapshot', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    // Give Plotly a moment to finish rendering
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('04-single-gene.png', { fullPage: true });
  });

  test('two gene selection shows multi-column grid', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await selectGene(page, 'Actb', 'Actb');
    await expect(page.locator('#plots-container')).toHaveClass(/multi/);
    await page.waitForTimeout(800);
    await expect(page).toHaveScreenshot('05-two-genes.png', { fullPage: true });
  });
});

// ─── 5. Data correctness ─────────────────────────────────────────────────────

test.describe('Data correctness', () => {
  // These tests verify the actual numeric values Plotly renders match the CSV.
  // Gapdh Day 0 Female values from batch1.csv:
  // D0_F1=173.41, D0_F2=160.26, D0_F3=163.19, D0_F4=189.55, D0_F5=139.29
  // Mean = (173.41+160.26+163.19+189.55+139.29)/5 = 825.7/5 = 165.14

  const GAPDH_D0F_VALUES = [434.61, 377.43, 442.96, 540.22, 428.79];
  const GAPDH_D0F_MEAN = GAPDH_D0F_VALUES.reduce((a, b) => a + b, 0) / GAPDH_D0F_VALUES.length;

  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDataset(page);
    await selectGene(page, 'Gapdh', 'Gapdh');
    await page.waitForTimeout(500);
  });

  test('Gapdh plot exists in the DOM', async ({ page }) => {
    await expect(page.locator('#plot-Gapdh')).toBeVisible();
  });

  test('Gapdh Day 0 Female mean is correct in Plotly data', async ({ page }) => {
    const mean = await page.evaluate(() => {
      const plotEl = document.getElementById('plot-Gapdh');
      if (!plotEl || !plotEl._fullData) return null;
      // First trace is the bar (mean) for Day 0 Female
      const barTrace = plotEl._fullData.find(t =>
        t.type === 'bar' && t.name === 'Day 0 \u00b7 Female'
      );
      return barTrace ? barTrace.y[0] : null;
    });

    expect(mean).not.toBeNull();
    expect(mean).toBeCloseTo(GAPDH_D0F_MEAN, 2);
  });

  test('Gapdh Day 0 Female scatter points match raw CSV values', async ({ page }) => {
    const scatterY = await page.evaluate(() => {
      const plotEl = document.getElementById('plot-Gapdh');
      if (!plotEl || !plotEl._fullData) return null;
      const scatterTrace = plotEl._fullData.find(t =>
        t.type === 'scatter' && t.name === 'Day 0 \u00b7 Female'
      );
      return scatterTrace ? [...scatterTrace.y] : null;
    });

    expect(scatterY).not.toBeNull();
    expect(scatterY).toHaveLength(GAPDH_D0F_VALUES.length);
    GAPDH_D0F_VALUES.forEach((v, i) => {
      expect(scatterY[i]).toBeCloseTo(v, 2);
    });
  });

  test('correct number of groups are rendered', async ({ page }) => {
    const barTraceCount = await page.evaluate(() => {
      const plotEl = document.getElementById('plot-Gapdh');
      if (!plotEl || !plotEl._fullData) return 0;
      return plotEl._fullData.filter(t => t.type === 'bar').length;
    });
    // test.json has 12 groups
    expect(barTraceCount).toBe(12);
  });

  test('y-axis label is correct', async ({ page }) => {
    const yAxisTitle = await page.evaluate(() => {
      const plotEl = document.getElementById('plot-Gapdh');
      if (!plotEl || !plotEl._fullLayout) return null;
      return plotEl._fullLayout.yaxis.title.text;
    });
    expect(yAxisTitle).toBe('CPM');
  });

  test('figcaption text is correct', async ({ page }) => {
    const caption = page.locator('figure:has(#plot-Gapdh) figcaption');
    await expect(caption).toHaveText('Bar chart of Gapdh data in CPM');
  });
});

// ─── 6. Downloads ────────────────────────────────────────────────────────────

test.describe('Downloads', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDataset(page);
  });

  test('full dataset download button is enabled after load', async ({ page }) => {
    await expect(page.locator('#dl-csv')).not.toBeDisabled();
  });

  test('selected genes CSV button is disabled before gene selected', async ({ page }) => {
    await expect(page.locator('#dl-gene-csv')).toBeDisabled();
  });

  test('plot download buttons are disabled before gene selected', async ({ page }) => {
    await expect(page.locator('#dl-all-png')).toBeDisabled();
    await expect(page.locator('#dl-all-svg')).toBeDisabled();
  });

  test('download buttons enable after gene selected', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await expect(page.locator('#dl-gene-csv')).not.toBeDisabled();
    await expect(page.locator('#dl-all-png')).not.toBeDisabled();
    await expect(page.locator('#dl-all-svg')).not.toBeDisabled();
  });

  test('full dataset download triggers a file download', async ({ page }) => {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#dl-csv').click(),
    ]);
    expect(download.suggestedFilename()).toBe('Paranjapye_2026_Mouse_Neuron_Timecourse.csv');
  });

  test('selected genes CSV download triggers a file download', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#dl-gene-csv').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/Gapdh.*\.csv/);
  });
});

// ─── 7. Accessibility ────────────────────────────────────────────────────────

test.describe('Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await selectDataset(page);
  });

  test('error banner has role=alert', async ({ page }) => {
    await expect(page.locator('#omi-error-banner')).toHaveAttribute('role', 'alert');
  });

  test('loading overlay has role=status', async ({ page }) => {
    await expect(page.locator('#omi-loading-overlay')).toHaveAttribute('role', 'status');
  });

  test('gene search input has aria-autocomplete', async ({ page }) => {
    await expect(page.locator('#gene-input')).toHaveAttribute('aria-autocomplete', 'list');
  });

  test('gene search input aria-expanded is false when closed', async ({ page }) => {
    await expect(page.locator('#gene-input')).toHaveAttribute('aria-expanded', 'false');
  });

  test('gene search input aria-expanded is true when results open', async ({ page }) => {
    await page.fill('#gene-input', 'Gapdh');
    await expect(page.locator('.result-item').first()).toBeVisible();
    await expect(page.locator('#gene-input')).toHaveAttribute('aria-expanded', 'true');
  });

  test('search results have role=listbox', async ({ page }) => {
    await expect(page.locator('#search-results')).toHaveAttribute('role', 'listbox');
  });

  test('result items have role=option', async ({ page }) => {
    await page.fill('#gene-input', 'Gapdh');
    await expect(page.locator('.result-item').first()).toHaveAttribute('role', 'option');
  });

  test('remove buttons have descriptive aria-label', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await expect(page.locator('.gene-tag-remove').first()).toHaveAttribute('aria-label', 'Remove Gapdh');
  });

  test('card titles are h2 elements', async ({ page }) => {
    const h2s = page.locator('main h2.card-title');
    await expect(h2s.first()).toBeVisible();
  });

  test('plots are wrapped in figure elements', async ({ page }) => {
    await selectGene(page, 'Gapdh', 'Gapdh');
    await expect(page.locator('figure:has(#plot-Gapdh)')).toBeAttached();
  });
});
