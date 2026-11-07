// UI helpers: safe element builder, icons, dialogs, toast, count-up, swipe rows.
// Rule: user-supplied or imported text is only ever set with textContent.
// innerHTML is used only for the static SVG icon markup defined in this file.

const NS = 'http://www.w3.org/2000/svg';

/* ---------------- Icons (static, author-written markup) ---------------- */
const ICONS = {
  home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  pie: '<path d="M21 12A9 9 0 1 1 12 3v9z"/><path d="M15 3.5A9 9 0 0 1 20.5 9H15z"/>',
  sliders: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  pencil: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/>',
  arrowUpRight: '<path d="M7 17 17 7M7 7h10v10"/>',
  wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h12v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1V8a1 1 0 0 0-1-1"/><circle cx="16.5" cy="14" r="1.2"/>',
  trendUp: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  trendDown: '<path d="m3 7 6 6 4-4 8 8"/><path d="M15 17h6v-6"/>',
  percent: '<path d="M19 5 5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M5 21h14"/>',
  upload: '<path d="M12 15V3M7 8l5-5 5 5M5 21h14"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  inbox: '<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z"/>',
  // Categories
  food: '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M8 7.5c0-1.2 1-1.6 1-2.8M12 7.5c0-1.2 1-1.6 1-2.8M16 7.5c0-1.2 1-1.6 1-2.8"/>',
  transport: '<rect x="4" y="3" width="16" height="15" rx="3"/><path d="M4 11h16M8 21v-3M16 21v-3"/><path d="M8 14.5h.01M16 14.5h.01"/>',
  bills: '<path d="M5 3h14v18l-3-2-2 2-2-2-2 2-2-2-3 2Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
  shopping: '<path d="M5 8h14l-1 13H6Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  health: '<path d="M12 20s-8-4.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 5.5-8 10-8 10Z"/><path d="M8 12h2l1-2 2 4 1-2h2"/>',
  entertainment: '<rect x="3" y="5" width="18" height="14" rx="3"/><path d="m10 9 5 3-5 3Z"/>',
  savings: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/>',
  salary: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/>',
  other: '<circle cx="5" cy="12" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/>',
};

export function svgIcon(name) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = ICONS[name] || ICONS.other; // static markup only
  return svg;
}

/** <span class="ico"><svg/></span> */
export function icon(name, extraClass = '') {
  const span = document.createElement('span');
  span.className = `ico ${extraClass}`.trim();
  span.appendChild(svgIcon(name));
  return span;
}

/** Fill every [data-icon] placeholder in the static HTML. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (!el.firstChild) el.appendChild(svgIcon(el.dataset.icon));
  });
}

/* ---------------- Element builder ---------------- */
/**
 * h('div', { class: 'x', dataset: { id: 1 }, onclick: fn, 'aria-label': 'y' }, 'text', child)
 * Strings become text nodes, so they are never parsed as HTML.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key === 'text') el.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (value === true) el.setAttribute(key, '');
    else el.setAttribute(key, String(value));
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat()) {
    if (child === null || child === undefined || child === false) continue;
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

export function clear(el) {
  el.replaceChildren();
  return el;
}

/* ---------------- Shared pieces ---------------- */

/**
 * Trend chip: arrow + signed percent. Colour shows good/bad, the arrow and
 * the accessible label carry the meaning, so colour is never the only cue.
 * @param {number|null} value  relative change (0.031 = 3.1%) or point delta when `points`
 */
export function trendChip(value, { goodWhenUp = true, suffix = '', points = false, srSuffix = suffix } = {}) {
  const chip = (cls, visible, spoken) => h('span', { class: `chip trend ${cls}` },
    h('span', { 'aria-hidden': 'true' }, visible),
    h('span', { class: 'sr-only' }, spoken));
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return chip('chip-flat', `—${suffix ? ` no data${suffix.replace(/^ vs/, ' for')}` : ' n/a'}`, `No comparison available${srSuffix}`);
  }
  const pct = Math.abs(value * 100);
  const num = pct >= 1000 ? '>999' : pct.toFixed(1).replace(/\.0$/, '');
  const unit = points ? ' pts' : '%';
  if (pct < 0.05) return chip('chip-flat', `● 0${unit}${suffix}`, `No change${srSuffix}`);
  const up = value > 0;
  const good = up === goodWhenUp;
  return chip(
    good ? 'chip-good' : 'chip-bad',
    `${up ? '▲ +' : '▼ −'}${num}${unit}${suffix}`,
    `${up ? 'Up' : 'Down'} ${num}${points ? ' points' : ' percent'}${srSuffix}, ${good ? 'a good sign' : 'worth a look'}`,
  );
}

/** Icon tile for a category. */
export function catTile(cat, type = 'expense') {
  return h('span', { class: `tile-icon${type === 'income' ? ' is-income' : ''}`, 'aria-hidden': 'true' }, icon(cat?.icon || 'other'));
}

/**
 * A transaction row tile.
 * @param {object} tx
 * @param {object} ctx { category, money, dayText, as: 'button'|'div', onClick }
 */
export function txTile(tx, { category, money, dayText, as = 'div', onClick }) {
  const title = tx.note || category?.name || 'Transaction';
  const sign = tx.type === 'income' ? '+' : '−';
  const amountText = `${sign}${money(tx.amountCents)}`;
  const sub = [category?.name, dayText].filter(Boolean).join(' · ');
  const attrs = {
    class: 'tile',
    dataset: { id: tx.id, cents: String(tx.amountCents), type: tx.type },
  };
  if (as === 'button') {
    attrs.type = 'button';
    attrs.onclick = onClick;
    attrs['aria-label'] = `${title}, ${category?.name ?? ''}, ${dayText}, ${tx.type === 'income' ? 'income' : 'expense'} ${money(tx.amountCents)}. Edit`;
  }
  return h(as, attrs,
    catTile(category, tx.type),
    h('span', { class: 'tile-main' },
      h('span', { class: 'tile-title' }, title, tx.sample ? h('span', { class: 'tile-tag' }, 'Sample') : null),
      h('span', { class: 'tile-sub' }, sub),
    ),
    h('span', { class: `tile-amount${tx.type === 'income' ? ' amount-in' : ''}` }, amountText),
  );
}

export function emptyState({ iconName = 'inbox', title, text, actionLabel, onAction }) {
  return h('div', { class: 'empty' },
    h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, icon(iconName)),
    h('h3', {}, title),
    text ? h('p', {}, text) : null,
    actionLabel ? h('button', { type: 'button', class: 'btn btn-primary', onclick: onAction, dataset: { action: 'add-first' } }, icon('plus'), actionLabel) : null,
  );
}

/** Shrink a single-line number until it fits its box (min 22px). */
export function fitText(el, max = 32, min = 22) {
  el.style.fontSize = '';
  let size = max;
  while (el.scrollWidth > el.clientWidth + 1 && size > min) {
    size -= 2;
    el.style.fontSize = `${size}px`;
  }
}

/* ---------------- Motion ---------------- */
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Animate a number from 0 to `to`, calling render(value) each frame. */
export function countUp(to, render, duration = 700) {
  if (reducedMotion() || to === 0) { render(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    render(t === 1 ? to : Math.round(to * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
