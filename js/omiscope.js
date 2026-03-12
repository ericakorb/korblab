/* ============================================================
   OmiScope — core application
   ============================================================ */

const App = (() => {

  // ── State ──────────────────────────────────────────────────
  let state = {
    datasets: [],          // from datasets/index.json
    activeDataset: null,   // { id, name, file, config }
    config: null,          // parsed batch*.json
    data: null,            // Map<symbol, {col: value}>
    geneList: [],          // sorted list of all gene symbols
    geneListLower: [],     // lowercase parallel for search
    activeGenes: [],       // ordered list of selected gene symbols
    groups: [],            // config.groups (possibly user-modified)
    yAxisLabel: 'Expression',
    organism: null,
  };

  // ── DOM refs ───────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  // ── Bootstrap ─────────────────────────────────────────────
  async function init() {
    try {
      const res = await fetch('/datasets/index.json?' + Date.now());
      state.datasets = await res.json();
    } catch (e) {
      showError('Could not load datasets/index.json. Make sure you\'re serving this over HTTP (not file://).');
      return;
    }

    renderDatasetSelector();
    setLoading(false);
    bindEvents();
  }

  // ── Dataset loading ────────────────────────────────────────
  async function loadDataset(id) {
    const meta = state.datasets.find(d => d.id === id);
    if (!meta) return;
    state.activeDataset = meta;
    state.activeGenes = [];
    state.data = null;
    const dlRow = $('dl-csv-row');
    if (dlRow) dlRow.classList.add('omi-hidden');

    setLoading(true, 'Loading configuration…');

    try {
      const cfgRes = await fetch('/' + meta.config + '?' + Date.now());
      state.config = await cfgRes.json();
      state.groups = JSON.parse(JSON.stringify(state.config.groups));
      state.yAxisLabel = state.config.yAxisLabel || 'Expression';
      state.organism = state.config.organism || null;
    } catch (e) {
      showError(`Could not load config: ${meta.config}`);
      setLoading(false);
      return;
    }

    updateDatasetInfo();
    setLoading(true, 'Parsing CSV (this may take a moment for large files)…');

    const csvUrl = meta.file.startsWith('/') ? meta.file : '/' + meta.file;

    Papa.parse(csvUrl, {
      header: true,
      skipEmptyLines: true,
      download: true,
      worker: false,
      complete: results => {
        if (!results.data || results.data.length === 0) {
          showError(`CSV loaded but contained no rows. Check that "${meta.file}" is accessible and non-empty.`);
          setLoading(false);
          return;
        }
        if (results.errors && results.errors.length > 0) {
          console.warn('PapaParse warnings:', results.errors);
        }
        processCSV(results.data, state.config.rowKey);
        setLoading(false);
        updateDatasetInfo();
        const dlRow = $('dl-csv-row');
        if (dlRow) dlRow.classList.remove('omi-hidden');
        $('search-section').classList.remove('omi-hidden');
        $('gene-input').focus();
      },
      error: (err) => {
        showError(`Could not load CSV "${meta.file}": ${err.message || err}. Are you running via HTTP (not file://)?`);
        setLoading(false);
      }
    });
  }

  function processCSV(rows, rowKey) {
    state.data = new Map();
    rows.forEach(row => {
      const symbol = (row[rowKey] || '').trim();
      if (!symbol) return;
      state.data.set(symbol, row);
    });
    state.geneList = [...state.data.keys()].sort();
    state.geneListLower = state.geneList.map(g => g.toLowerCase());
    updateGeneCount();
  }

  // ── Gene search ────────────────────────────────────────────
  function bindEvents() {
    $('dataset-select').addEventListener('change', e => {
      if (e.target.value) loadDataset(e.target.value);
    });

    const navToggle = $('nav-toggle');
    if (navToggle) {
      navToggle.addEventListener('click', () => {
        const mob = $('nav-mobile');
        if (mob) mob.classList.toggle('omi-hidden');
      });
    }

    const geneInput = $('gene-input');
    let debounceTimer;
    geneInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => handleGeneSearch(geneInput.value.trim()), 150);
    });

    geneInput.addEventListener('keydown', e => {
      const resultsEl = $('search-results');
      const items = [...resultsEl.querySelectorAll('.result-item')];
      const current = resultsEl.querySelector('.result-item.focused');
      const currentIdx = current ? items.indexOf(current) : -1;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        const next = items[currentIdx + 1] || items[0];
        if (next) setFocusedItem(items, next);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prev = items[currentIdx - 1] || items[items.length - 1];
        if (prev) setFocusedItem(items, prev);
      } else if (e.key === 'Enter') {
        if (current) {
          current.click();
        } else {
          const first = resultsEl.querySelector('.result-item:not(.already-selected)');
          if (first) first.click();
        }
      } else if (e.key === 'Tab' || e.key === 'Escape') {
        clearSearch();
      }
    });

    $('dl-csv').addEventListener('click', downloadFullCSV);
    $('dl-gene-csv').addEventListener('click', downloadGeneCSV);
    $('dl-all-png').addEventListener('click', downloadAllPNG);
    $('dl-all-svg').addEventListener('click', downloadAllSVG);

    $('clear-genes').addEventListener('click', (e) => {
      e.stopPropagation();
      state.activeGenes = [];
      renderSelectedTags();
      renderAllPlots();
      $('chart-section').classList.add('omi-hidden');
      $('download-section').classList.add('omi-hidden');
    });

    document.addEventListener('click', e => {
      if (!e.target.closest('#search-section')) clearSearch();
    });
  }

  function handleGeneSearch(query) {
    const resultsEl = $('search-results');
    if (!query || !state.data) {
      resultsEl.innerHTML = '';
      resultsEl.classList.add('omi-hidden');
      return;
    }

    const lower = query.toLowerCase();
    const matches = state.geneList
      .filter((_, i) => state.geneListLower[i].includes(lower))
      .slice(0, 14);

    if (matches.length === 0) {
      resultsEl.innerHTML = '<div class="no-results">No genes found</div>';
      resultsEl.classList.remove('omi-hidden');
      $('gene-input').setAttribute('aria-expanded', 'true');
      return;
    }

    const selectedSet = new Set(state.activeGenes);
    resultsEl.innerHTML = matches.map(g => {
      const already = selectedSet.has(g);
      const matchIdx = g.toLowerCase().indexOf(lower);
      const highlighted = matchIdx >= 0
        ? g.slice(0, matchIdx) + `<span class="result-match">${g.slice(matchIdx, matchIdx + lower.length)}</span>` + g.slice(matchIdx + lower.length)
        : g;
      const check = already ? '<span class="result-check" aria-hidden="true">\u2713</span>' : '';
      const ariaSelected = already ? 'true' : 'false';
      const itemId = `result-${escHtml(g).replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      return `<div class="result-item ${already ? 'already-selected' : ''}" id="${itemId}" role="option" aria-selected="${ariaSelected}" data-gene="${escHtml(g)}">${highlighted}${check}</div>`;
    }).join('');
    resultsEl.classList.remove('omi-hidden');
    $('gene-input').setAttribute('aria-expanded', 'true');

    const allItems = [...resultsEl.querySelectorAll('.result-item')];
    allItems.forEach(el => {
      el.addEventListener('mousemove', () => setFocusedItem(allItems, el));
      el.addEventListener('click', () => {
        const gene = el.dataset.gene;
        if (state.activeGenes.includes(gene)) {
          removeGene(gene);
        } else {
          addGene(gene);
        }
        handleGeneSearch($('gene-input').value.trim());
      });
    });
  }

  function addGene(symbol) {
    if (!state.activeGenes.includes(symbol)) {
      state.activeGenes.push(symbol);
      $('gene-input').value = '';
      clearSearch();
      renderSelectedTags();
      renderAllPlots();
      $('chart-section').classList.remove('omi-hidden');
      $('download-section').classList.remove('omi-hidden');
    }
  }

  function removeGene(symbol) {
    state.activeGenes = state.activeGenes.filter(g => g !== symbol);
    renderSelectedTags();
    renderAllPlots();
    if (state.activeGenes.length === 0) {
      $('chart-section').classList.add('omi-hidden');
      $('download-section').classList.add('omi-hidden');
    }
  }

  function setFocusedItem(items, target) {
    items.forEach(el => {
      el.classList.remove('focused');
      el.setAttribute('aria-current', 'false');
    });
    target.classList.add('focused');
    target.setAttribute('aria-current', 'true');
    target.scrollIntoView({ block: 'nearest' });
    $('gene-input').setAttribute('aria-activedescendant', target.id);
  }

  function clearSearch() {
    $('search-results').innerHTML = '';
    $('search-results').classList.add('omi-hidden');
    $('gene-input').setAttribute('aria-expanded', 'false');
    $('gene-input').removeAttribute('aria-activedescendant');
  }

  // ── Selected gene tags ─────────────────────────────────────
  function renderSelectedTags() {
    const container = $('selected-genes');
    const clearBtn = $('clear-genes');

    if (state.activeGenes.length === 0) {
      container.innerHTML = '<span class="no-genes-hint">Search and select genes above</span>';
      clearBtn.classList.add('omi-hidden');
      return;
    }

    clearBtn.classList.remove('omi-hidden');
    container.innerHTML = state.activeGenes.map(g =>
      `<span class="gene-tag">${escHtml(g)}<button class="gene-tag-remove" data-gene="${escHtml(g)}" aria-label="Remove ${escHtml(g)}">&times;</button></span>`
    ).join('');

    container.querySelectorAll('.gene-tag-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeGene(btn.dataset.gene);
      });
    });
  }

  // ── Plot rendering ─────────────────────────────────────────
  function renderAllPlots() {
    const container = $('plots-container');
    container.innerHTML = '';

    if (state.activeGenes.length === 0) return;

    // Responsive grid: 1 col for 1 gene, 2 cols for 2+
    container.className = state.activeGenes.length === 1 ? 'plots-grid single' : 'plots-grid multi';

    state.activeGenes.forEach(symbol => {
      const figure = document.createElement('figure');
      figure.className = 'plot-wrapper';

      const caption = document.createElement('figcaption');
      caption.className = 'plot-caption visually-hidden';
      caption.textContent = `Bar chart of ${symbol} data in ${state.yAxisLabel}`;

      const plotDiv = document.createElement('div');
      plotDiv.className = 'plot-canvas';
      // Sanitize symbol for use as DOM id
      plotDiv.id = `plot-${symbol.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      figure.appendChild(caption);
      figure.appendChild(plotDiv);
      container.appendChild(figure);

      renderPlot(symbol, plotDiv.id);
    });

    updateDownloadState();
  }

  function renderPlot(symbol, plotId) {
    const row = state.data.get(symbol);
    if (!row) return;

    const traces = [];

    state.groups.forEach((group, gi) => {
      const validCols = group.columns.filter(c => !isNaN(parseFloat(row[c])));
      const vals = validCols.map(c => parseFloat(row[c]));

      if (vals.length === 0) return;

      const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
      const sd = Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / vals.length);

      const color = group.color || DEFAULT_COLOR;
      const colorLight = hexToRgba(color, 0.18);

      traces.push({
        type: 'bar',
        name: group.label,
        x: [group.label],
        y: [mean],
        error_y: {
          type: 'data',
          array: [sd],
          visible: true,
          color: color,
          thickness: 2,
          width: 6,
        },
        marker: { color: colorLight, line: { color: color, width: 2 } },
        showlegend: true,
        legendgroup: group.id,
        hovertemplate: `<b>${group.label}</b><br>Mean: %{y:.2f}<br>SD: ${sd.toFixed(2)}<extra></extra>`,
      });

      // Jitter x positions manually (Plotly transforms not universally supported)
      const jitteredX = validCols.map(() => group.label);
      traces.push({
        type: 'scatter',
        mode: 'markers',
        name: group.label,
        x: jitteredX,
        y: vals,
        marker: { color: color, size: 7, opacity: 0.85, line: { color: 'white', width: 1 } },
        showlegend: false,
        legendgroup: group.id,
        customdata: validCols,
        hovertemplate: '<b>%{customdata}</b><br>Value: %{y:.2f}<extra></extra>',
      });
    });

    const maxLabelLen = Math.max(...state.groups.map(g => g.label.length));
    const groupCount = state.groups.length;
    const bottomMargin = Math.max(180, 80 + maxLabelLen * 5 + groupCount * 10);
    const legendRows = Math.ceil(groupCount / 3);
    const legendY = -0.18 - (legendRows * 0.12);

    const layout = {
      title: {
        text: `<b>${symbol}</b>`,
        font: { size: 18, color: '#1a1a2e', family: 'DM Sans, sans-serif' }
      },
      yaxis: {
        title: { text: state.yAxisLabel, font: { size: 12 } },
        zeroline: true,
        zerolinecolor: '#e0e0e0',
        gridcolor: '#f0f0f0',
      },
      xaxis: {
        tickfont: { size: 11 },
        tickangle: -45,
        automargin: true,
      },
      plot_bgcolor: '#fafafa',
      paper_bgcolor: '#ffffff',
      font: { family: 'DM Sans, sans-serif' },
      legend: { orientation: 'h', y: legendY, x: 0.5, xanchor: 'center', yanchor: 'top' },
      margin: { t: 55, b: bottomMargin, l: 80, r: 15, autoexpand: true },
      bargap: 0.35,
      hovermode: 'closest',
    };

    Plotly.newPlot(plotId, traces, layout, {
      responsive: true,
      displayModeBar: false,
    });
  }

  // ── Downloads ──────────────────────────────────────────────
  async function downloadFullCSV() {
    if (!state.activeDataset) return;
    const csvUrl = state.activeDataset.file.startsWith('/') ? state.activeDataset.file : '/' + state.activeDataset.file;
    const filename = state.activeDataset.file.split('/').pop();
    try {
      const res = await fetch(csvUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      showError(`Could not download ${filename}.`);
    }
  }

  function downloadGeneCSV() {
    if (!state.activeGenes.length || !state.data) return;

    const allCols = state.groups.flatMap(g => g.columns);
    const lines = [];

    lines.push([state.config.rowKey, ...allCols].join(','));
    state.activeGenes.forEach(symbol => {
      const row = state.data.get(symbol);
      if (!row) return;
      lines.push([symbol, ...allCols.map(c => row[c] ?? '')].join(','));
    });

    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${state.activeGenes.slice(0,3).join('_')}${state.activeGenes.length > 3 ? '_etc' : ''}_data.csv`;
    a.click();
  }

  async function downloadAllPNG() {
    const legendRows = Math.ceil(state.groups.length / 3);
    const exportHeight = 580 + legendRows * 28;
    for (const symbol of state.activeGenes) {
      const plotId = `plot-${symbol.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      if (document.getElementById(plotId)) {
        await Plotly.downloadImage(plotId, {
          format: 'png',
          filename: `${symbol}_plot`,
          width: 1200, height: exportHeight, scale: 2
        });
        await new Promise(r => setTimeout(r, 350));
      }
    }
  }

  async function downloadAllSVG() {
    const legendRows = Math.ceil(state.groups.length / 3);
    const exportHeight = 580 + legendRows * 28;
    for (const symbol of state.activeGenes) {
      const plotId = `plot-${symbol.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
      if (document.getElementById(plotId)) {
        await Plotly.downloadImage(plotId, {
          format: 'svg',
          filename: `${symbol}_plot`,
          width: 1200, height: exportHeight,
        });
        await new Promise(r => setTimeout(r, 350));
      }
    }
  }

  // ── UI helpers ─────────────────────────────────────────────
  function renderDatasetSelector() {
    const sel = $('dataset-select');
    const placeholder = '<option value="" disabled selected>Select a dataset…</option>';
    sel.innerHTML = placeholder + state.datasets.map(d =>
      `<option value="${d.id}">${escHtml(d.name)}</option>`
    ).join('');
  }

  function updateDatasetInfo() {
    if (!state.activeDataset) return;
    $('dataset-desc').textContent = state.activeDataset.description || '';
    const orgEl = $('dataset-organism');
    const searchOrgEl = $('search-organism');
    const citeEl = $('dataset-citation');
    if (orgEl) {
      orgEl.textContent = state.organism || '';
      orgEl.style.display = state.organism ? '' : 'none';
    }
    if (searchOrgEl) {
      searchOrgEl.textContent = state.organism ? `(${state.organism})` : '';
    }
    if (citeEl) {
      const cite = state.activeDataset.citation;
      citeEl.style.display = cite ? '' : 'none';
      citeEl.innerHTML = cite ? `<span class="dataset-citation-label">Citation:</span> ${escHtml(cite)}` : '';
    }
  }

  function updateGeneCount() {
    $('gene-count').textContent = `${state.geneList.length.toLocaleString()} genes loaded`;
  }

  function updateDownloadState() {
    const hasGenes = state.activeGenes.length > 0;
    $('dl-gene-csv').disabled = !hasGenes;
    $('dl-all-png').disabled = !hasGenes;
    $('dl-all-svg').disabled = !hasGenes;
  }

  function setLoading(on, msg = '') {
    const overlay = $('omi-loading-overlay');
    if (overlay) overlay.classList.toggle('omi-hidden', !on);
    const msgEl = $('omi-loading-msg');
    if (msg && msgEl) msgEl.textContent = msg;
    const main = document.querySelector('main');
    if (main) main.setAttribute('aria-busy', on ? 'true' : 'false');
  }

  function showError(msg) {
    const el = $('omi-error-banner');
    if (!el) { console.error('OmiScope error:', msg); return; }
    el.textContent = msg;
    el.classList.remove('omi-hidden');
    setTimeout(() => el.classList.add('omi-hidden'), 8000);
  }

  // ── Utilities ──────────────────────────────────────────────
  function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return `rgba(${r},${g},${b},${alpha})`;
  }

  const DEFAULT_COLOR = '#7ba7e0';

  function escHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);