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
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
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
export function txTile(tx, { category, money, dayText, showDay = true, as = 'div', onClick }) {
  const title = tx.note || category?.name || 'Transaction';
  const sign = tx.type === 'income' ? '+' : '−';
  const amountText = `${sign}${money(tx.amountCents)}`;
  const sub = [category?.name, showDay ? dayText : null].filter(Boolean).join(' · ');
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

/* ---------------- Dialogs and sheets ---------------- */

export function openDialog(dlg) {
  if (dlg.open) return;
  dlg.classList.remove('is-closing');
  dlg.returnValue = '';
  dlg.showModal();
}

/** Close with the exit animation (skipped for reduced motion). */
export function closeDialog(dlg, value = '') {
  return new Promise((resolve) => {
    if (!dlg.open) { resolve(); return; }
    const done = () => {
      dlg.classList.remove('is-closing');
      if (dlg.open) dlg.close(value);
      resolve();
    };
    if (reducedMotion()) { done(); return; }
    dlg.classList.add('is-closing');
    let finished = false;
    const finish = () => { if (!finished) { finished = true; done(); } };
    dlg.addEventListener('animationend', finish, { once: true });
    setTimeout(finish, 260);
  });
}

/** Esc, backdrop tap and [data-close] buttons all close with animation. */
export function wireDialog(dlg) {
  dlg.addEventListener('cancel', (e) => { e.preventDefault(); closeDialog(dlg, 'cancel'); });
  dlg.addEventListener('click', (e) => {
    if (e.target === dlg) {
      const r = dlg.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (!inside) closeDialog(dlg, 'cancel');
    }
    if (e.target.closest('[data-close]')) closeDialog(dlg, 'cancel');
  });
}

/** Promise<boolean> confirmation using #confirm-dialog. */
export function confirmAction({ title, text, okLabel = 'Confirm', danger = false }) {
  const dlg = document.getElementById('confirm-dialog');
  const ok = document.getElementById('confirm-ok');
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-text').textContent = text;
  ok.textContent = okLabel;
  ok.className = `btn ${danger ? 'btn-danger-solid' : 'btn-primary'}`;
  openDialog(dlg);
  return new Promise((resolve) => {
    dlg.addEventListener('close', () => resolve(dlg.returnValue === 'ok'), { once: true });
  });
}

/* ---------------- Toast ---------------- */
let toastTimer = null;
let toastAction = null;

export function showToast(text, { actionLabel, onAction, duration = 3000 } = {}) {
  const el = document.getElementById('toast');
  const btn = document.getElementById('toast-action');
  document.getElementById('toast-text').textContent = text;
  clearTimeout(toastTimer);
  toastAction = onAction || null;
  btn.hidden = !actionLabel;
  if (actionLabel) btn.textContent = actionLabel;
  el.hidden = false;
  // restart the entrance animation
  el.style.animation = 'none';
  void el.offsetWidth;
  el.style.animation = '';
  toastTimer = setTimeout(hideToast, duration);
}

export function hideToast() {
  clearTimeout(toastTimer);
  toastAction = null;
  document.getElementById('toast').hidden = true;
}

export function wireToast() {
  document.getElementById('toast-action').addEventListener('click', () => {
    const fn = toastAction;
    hideToast();
    if (fn) fn();
  });
}

/* ---------------- Swipe rows ---------------- */
const ACTIONS_W = 152;

export function setRowOpen(row, open) {
  const content = row.querySelector('.swipe-content');
  row.classList.toggle('is-open', open);
  content.style.transform = open ? `translateX(-${ACTIONS_W}px)` : '';
}

export function closeOpenRows(root, except = null) {
  root.querySelectorAll('.swipe.is-open').forEach((r) => { if (r !== except) setRowOpen(r, false); });
}

/** Swipe left on .swipe-content to reveal .swipe-actions. Works with touch, pen and mouse. */
export function wireSwipe(root) {
  let drag = null;
  let suppressClick = false;

  root.addEventListener('pointerdown', (e) => {
    const content = e.target.closest('.swipe-content');
    if (!content || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const row = content.closest('.swipe');
    drag = {
      row, content, id: e.pointerId,
      x0: e.clientX, y0: e.clientY,
      base: row.classList.contains('is-open') ? -ACTIONS_W : 0,
      active: false, dx: 0,
    };
  });

  root.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.active) {
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        drag.active = true;
        drag.row.classList.add('is-dragging');
        try { drag.content.setPointerCapture(e.pointerId); } catch { /* ignore */ }
        closeOpenRows(root, drag.row);
      } else if (Math.abs(dy) > 10) {
        drag = null;
        return;
      } else return;
    }
    drag.dx = dx;
    const x = Math.max(-ACTIONS_W - 28, Math.min(0, drag.base + dx));
    drag.content.style.transform = `translateX(${x}px)`;
  });

  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (drag.active) {
      drag.row.classList.remove('is-dragging');
      setRowOpen(drag.row, drag.base + drag.dx < -ACTIONS_W / 2);
      suppressClick = true;
      setTimeout(() => { suppressClick = false; }, 300);
    }
    drag = null;
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', (e) => {
    if (drag?.active) setRowOpen(drag.row, drag.base < 0);
    drag = null;
  });

  // A swipe ends with a click on the row; swallow it.
  root.addEventListener('click', (e) => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; return; }
    // Tapping an open row closes it instead of opening the editor.
    const content = e.target.closest('.swipe-content');
    const row = content?.closest('.swipe');
    if (row?.classList.contains('is-open')) { e.stopPropagation(); e.preventDefault(); setRowOpen(row, false); }
  }, true);

  // Keyboard: focusing the hidden actions reveals them.
  root.addEventListener('focusin', (e) => {
    const row = e.target.closest('.swipe');
    if (e.target.closest('.swipe-actions') && row) { closeOpenRows(root, row); setRowOpen(row, true); }
  });
  root.addEventListener('focusout', (e) => {
    const row = e.target.closest('.swipe');
    if (row && !row.contains(e.relatedTarget) && e.target.closest('.swipe-actions')) setRowOpen(row, false);
  });
}

/* ---------------- Field errors ---------------- */
export function setFieldError(errorEl, message, inputEl) {
  errorEl.textContent = message || '';
  errorEl.hidden = !message;
  if (inputEl) {
    if (message) inputEl.setAttribute('aria-invalid', 'true');
    else inputEl.removeAttribute('aria-invalid');
  }
}

/* ---------------- Motion ---------------- */
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Animate a number from `from` to `to`, calling render(value) each frame. */
export function countUp(to, render, duration = 700, from = 0) {
  if (reducedMotion() || to === from) { render(to); return; }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - t, 3);
    render(t === 1 ? to : Math.round(from + (to - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

/** Re-run a one-shot CSS animation class on an element. */
export function replay(el, cls) {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth; // restart
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/**
 * Sliding red "thumb" behind a segmented control. The active pill also gets its
 * own red background after the slide, so text contrast never depends on the thumb.
 */
export function initSegThumb(seg) {
  const thumb = document.createElement('span');
  thumb.className = 'seg-thumb';
  thumb.setAttribute('aria-hidden', 'true');
  seg.prepend(thumb);
  const update = (animate = true) => {
    const active = seg.querySelector('button[aria-pressed="true"], input:checked + span');
    if (!active || !seg.offsetWidth) return;
    const sr = seg.getBoundingClientRect();
    const ar = active.getBoundingClientRect();
    if (!animate || reducedMotion()) thumb.style.transition = 'none';
    thumb.style.width = `${ar.width}px`;
    thumb.style.height = `${ar.height}px`;
    thumb.style.transform = `translate(${ar.left - sr.left}px, ${ar.top - sr.top}px)`;
    if (!animate) requestAnimationFrame(() => { thumb.style.transition = ''; });
  };
  new MutationObserver(() => update()).observe(seg, { subtree: true, attributes: true, attributeFilter: ['aria-pressed'] });
  seg.addEventListener('change', () => update());
  new ResizeObserver(() => update(false)).observe(seg);
  return update;
}

/**
 * Horizontal chip row: native touch scrolling plus mouse drag, mouse wheel,
 * arrow buttons (on mouse devices) and edge fades that show more is hidden.
 */
export function wireScrollRow(wrap) {
  const row = wrap.querySelector('.chips-row');
  const fades = () => {
    const max = row.scrollWidth - row.clientWidth;
    wrap.classList.toggle('can-left', row.scrollLeft > 2);
    wrap.classList.toggle('can-right', row.scrollLeft < max - 2);
  };
  row.addEventListener('scroll', fades, { passive: true });
  new ResizeObserver(fades).observe(row);
  new MutationObserver(fades).observe(row, { childList: true });

  // Mouse drag
  let drag = null;
  let moved = false;
  row.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    drag = { x: e.clientX, left: row.scrollLeft };
    moved = false;
  });
  window.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!moved && Math.abs(dx) > 5) { moved = true; row.classList.add('is-grabbing'); }
    if (moved) row.scrollLeft = drag.left - dx;
  });
  window.addEventListener('pointerup', () => {
    if (!drag) return;
    drag = null;
    row.classList.remove('is-grabbing');
    setTimeout(() => { moved = false; }, 0);
  });
  // A drag ends with a click on a chip; don't treat it as a tap.
  row.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); } }, true);

  // Vertical mouse wheel scrolls the row sideways while it can move.
  row.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    const max = row.scrollWidth - row.clientWidth;
    if ((e.deltaY > 0 && row.scrollLeft < max - 1) || (e.deltaY < 0 && row.scrollLeft > 1)) {
      e.preventDefault();
      row.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  wrap.querySelectorAll('.chips-arrow').forEach((b) => b.addEventListener('click', () => {
    row.scrollBy({ left: Number(b.dataset.dir) * row.clientWidth * 0.7, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }));

  return {
    /** Bring the chosen chip into view. */
    reveal(chip) {
      if (!chip) return;
      const target = chip.offsetLeft - (row.clientWidth - chip.offsetWidth) / 2;
      row.scrollTo({ left: Math.max(0, target), behavior: reducedMotion() ? 'auto' : 'smooth' });
    },
    refresh: fades,
  };
}
