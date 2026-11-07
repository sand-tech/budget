// Inline SVG bar chart: hatched bars, the selected bar solid red with a dot,
// dashed gridlines, and a floating HTML tooltip card.
// The SVG is decorative (aria-hidden); an invisible row of real buttons on top
// handles taps, keyboard and screen readers.

const NS = 'http://www.w3.org/2000/svg';

function svgEl(name, attrs = {}, parent) {
  const el = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  if (parent) parent.appendChild(el);
  return el;
}

function niceStep(raw) {
  if (raw <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(raw)));
  const f = raw / exp;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * exp;
}

/**
 * @param {HTMLElement} container
 * @param {{ onSelect:(i:number)=>void, money:(c:number)=>string, axisMoney:(c:number)=>string }} opts
 */
export function createBarChart(container, opts) {
  container.replaceChildren();
  const svg = svgEl('svg', { class: 'chart-svg', 'aria-hidden': 'true', focusable: 'false' });
  const hits = document.createElement('div');
  hits.className = 'chart-hits';
  hits.setAttribute('role', 'group');
  hits.setAttribute('aria-label', 'Spending by period. Use arrow keys to move between bars.');
  const tip = document.createElement('div');
  tip.className = 'chart-tip';
  tip.setAttribute('aria-hidden', 'true');
  const tipTitle = document.createElement('p');
  tipTitle.className = 'chart-tip-title';
  const tipIn = row('Income', 'k-in');
  const tipOut = row('Expenses', 'k-out');
  tip.append(tipTitle, tipIn.el, tipOut.el);
  container.append(svg, hits, tip);

  let series = [];
  let selected = 0;
  let mode = 'month';
  let geo = null;
  let bars = [];
  let labels = [];
  let buttons = [];
  let dotG = null;
  let drawn = false;

  function row(name, cls) {
    const el = document.createElement('p');
    el.className = 'chart-tip-row';
    const k = document.createElement('span');
    k.className = `k ${cls}`;
    k.textContent = name;
    const v = document.createElement('b');
    el.append(k, v);
    return { el, v };
  }

  function render() {
    const w = Math.max(200, container.clientWidth || 320);
    const h = Math.max(160, container.clientHeight || 236);
    const padL = 44;
    const padR = 2;
    const padT = 92;
    const padB = 24;
    const plotW = w - padL - padR;
    const plotH = h - padT - padB;
    const n = series.length || 1;
    const slot = plotW / n;
    const bw = Math.max(6, Math.min(24, slot * 0.6));

    const max = Math.max(0, ...series.map((p) => p.expense));
    const step = niceStep((max || 100_000) / 4);
    const top = Math.max(step, Math.ceil((max || 1) / step) * step);
    const ticks = Math.round(top / step);

    svg.replaceChildren();
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const defs = svgEl('defs', {}, svg);
    const pat = svgEl('pattern', {
      id: 'bar-hatch', patternUnits: 'userSpaceOnUse', width: 6, height: 6, patternTransform: 'rotate(45)',
    }, defs);
    svgEl('rect', { class: 'hatch-bg', width: 6, height: 6 }, pat);
    svgEl('line', { class: 'hatch-line', x1: 1, y1: 0, x2: 1, y2: 6 }, pat);

    // Gridlines + y labels
    for (let i = 0; i <= ticks; i++) {
      const v = step * i;
      const y = padT + plotH - (v / top) * plotH;
      svgEl('line', { class: 'chart-grid', x1: padL, x2: w - padR, y1: y, y2: y }, svg);
      const t = svgEl('text', { class: 'chart-axis', x: padL - 8, y: y + 4, 'text-anchor': 'end' }, svg);
      t.textContent = opts.axisMoney(v);
    }

    // Bars + x labels
    bars = [];
    labels = [];
    const sparse = slot < 30 && mode === 'week';
    series.forEach((p, i) => {
      const cx = padL + slot * i + slot / 2;
      const bh = Math.max(6, (p.expense / top) * plotH);
      const y = padT + plotH - bh;
      const rect = svgEl('rect', {
        class: 'chart-bar', x: cx - bw / 2, y, width: bw, height: bh, rx: Math.min(7, bw / 2),
      }, svg);
      bars.push({ rect, cx, y });
      const label = svgEl('text', { class: 'chart-axis', x: cx, y: h - 6, 'text-anchor': 'middle' }, svg);
      label.textContent = p.short;
      label.dataset.sparse = sparse && (n - 1 - i) % 2 === 1 ? '1' : '0';
      labels.push(label);
    });

    dotG = svgEl('g', { class: 'chart-dot-g' }, svg);
    svgEl('circle', { class: 'chart-dot', cx: 0, cy: 0, r: 5 }, dotG);

    // Hit buttons
    hits.replaceChildren();
    buttons = series.map((p, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chart-hit';
      b.style.left = `${padL + slot * i}px`;
      b.style.width = `${slot}px`;
      b.dataset.index = String(i);
      b.setAttribute('aria-label', `${p.long}: expenses ${opts.money(p.expense)}, income ${opts.money(p.income)}`);
      hits.appendChild(b);
      return b;
    });

    geo = { w, h, padL, slot, n };
    applySelection(false);
  }

  function applySelection(animate) {
    if (!bars.length) return;
    const i = Math.max(0, Math.min(selected, bars.length - 1));
    bars.forEach((b, j) => b.rect.classList.toggle('is-selected', j === i));
    labels.forEach((l, j) => {
      l.classList.toggle('is-selected', j === i);
      l.style.display = l.dataset.sparse === '1' && j !== i ? 'none' : '';
    });
    buttons.forEach((b, j) => {
      b.setAttribute('aria-pressed', String(j === i));
      b.tabIndex = j === i ? 0 : -1;
    });
    const bar = bars[i];
    if (!animate) { dotG.style.transition = 'none'; tip.style.transition = 'none'; }
    dotG.style.transform = `translate(${bar.cx}px, ${bar.y - 11}px)`;

    const p = series[i];
    tipTitle.textContent = p.long;
    tipIn.v.textContent = opts.money(p.income);
    tipOut.v.textContent = opts.money(p.expense);
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    const x = Math.max(0, Math.min(geo.w - tw, bar.cx - tw / 2));
    const y = Math.max(0, bar.y - 20 - th);
    tip.style.transform = `translate(${x}px, ${y}px)`;
    if (!animate) {
      // Re-enable transitions after this frame.
      requestAnimationFrame(() => { dotG.style.transition = ''; tip.style.transition = ''; });
    }
  }

  function select(i, { focus = false, notify = true } = {}) {
    const next = Math.max(0, Math.min(series.length - 1, i));
    const changed = next !== selected;
    selected = next;
    applySelection(drawn);
    if (focus) buttons[selected]?.focus();
    if (changed && notify) opts.onSelect(selected);
  }

  // Tap / click / Enter on a bar
  hits.addEventListener('click', (e) => {
    const b = e.target.closest('.chart-hit');
    if (b) select(Number(b.dataset.index));
  });
  // Drag across the chart to scrub between bars
  let scrubbing = false;
  const indexAt = (clientX) => {
    const r = container.getBoundingClientRect();
    return Math.floor((clientX - r.left - geo.padL) / geo.slot);
  };
  hits.addEventListener('pointerdown', (e) => { scrubbing = true; select(indexAt(e.clientX)); });
  hits.addEventListener('pointermove', (e) => { if (scrubbing && e.buttons > 0) select(indexAt(e.clientX)); });
  const stop = () => { scrubbing = false; };
  hits.addEventListener('pointerup', stop);
  hits.addEventListener('pointercancel', stop);
  hits.addEventListener('pointerleave', stop);
  // Arrow keys (roving focus)
  hits.addEventListener('keydown', (e) => {
    const map = { ArrowLeft: -1, ArrowRight: 1 };
    if (e.key in map) { e.preventDefault(); select(selected + map[e.key], { focus: true }); }
    else if (e.key === 'Home') { e.preventDefault(); select(0, { focus: true }); }
    else if (e.key === 'End') { e.preventDefault(); select(series.length - 1, { focus: true }); }
  });

  let lastWidth = 0;
  const ro = new ResizeObserver(() => {
    const w = container.clientWidth;
    if (w && w !== lastWidth && series.length) { lastWidth = w; render(); }
  });
  ro.observe(container);

  return {
    update(newSeries, newSelected, newMode) {
      series = newSeries;
      mode = newMode;
      selected = newSelected;
      render();
      lastWidth = container.clientWidth;
      drawn = true;
    },
    select,
    get selected() { return selected; },
  };
}
