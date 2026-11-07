// Controller: boot, routing, rendering of each screen, and event wiring.
import * as state from './state.js';
import {
  money, moneyShort, percent, dayLabel, currencySymbol, centsToPlain, todayISO,
} from './format.js';
import {
  h, icon, hydrateIcons, trendChip, catTile, txTile, emptyState, fitText, countUp,
  openDialog, closeDialog, wireDialog, confirmAction, showToast, hideToast, wireToast, setFieldError,
} from './ui.js';
import { createBarChart } from './chart.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['home', 'transactions', 'budgets', 'settings'];

const ui = {
  screen: null,
  mode: 'month',
  selected: {},          // selected bar index per chart mode
  firstHome: true,       // count-up only on first load
  txQuery: '',
  txFilter: 'all',
};

const data = () => state.getData();
const currency = () => data().settings.currency;
const fmt = (cents) => money(cents, currency());

/* ====================================================================
   Routing
   ==================================================================== */
function route() {
  const name = location.hash.replace('#', '');
  show(SCREENS.includes(name) ? name : 'home');
}

function show(name) {
  if (name === ui.screen) return;
  const prev = ui.screen;
  ui.screen = name;
  for (const s of SCREENS) {
    const el = $(`screen-${s}`);
    el.hidden = s !== name;
    el.classList.toggle('is-entering', s === name && prev !== null);
  }
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  if (prev !== null) window.scrollTo(0, 0);
}

/* ====================================================================
   Home
   ==================================================================== */
const initials = (name) => name.trim().split(/\s+/).slice(0, 2).map((w) => [...w][0] || '').join('').toUpperCase() || '?';

const KPI_DEFS = [
  { key: 'balance', label: 'Balance', icon: 'wallet', value: (k) => k.balance, change: (k) => k.balanceChange, up: true, href: '#transactions', filter: 'all' },
  { key: 'income', label: 'Income', icon: 'trendUp', value: (k) => k.income, change: (k) => k.incomeChange, up: true, href: '#transactions', filter: 'income' },
  { key: 'expenses', label: 'Expenses', icon: 'trendDown', value: (k) => k.expense, change: (k) => k.expenseChange, up: false, href: '#transactions', filter: 'expense' },
  { key: 'savings', label: 'Savings Rate', icon: 'percent', value: (k) => k.rate, change: (k) => k.rateDelta, up: true, href: '#budgets', isRate: true },
];

function renderHome() {
  const d = data();
  const today = new Date();
  const k = state.kpis(d, today);
  $('greet-name').textContent = d.settings.name;
  $('avatar-initials').textContent = initials(d.settings.name);
  $('home-subtitle').textContent = `Here's your summary for ${k.period.long}.`;
  $('sample-banner').hidden = !state.hasSample(d);
  renderKpis(k);
  renderOverview();
  renderTopCategories(k.period);
  renderRecent(today);
  ui.firstHome = false;
}

function renderKpis(k) {
  const grid = $('kpi-grid');
  const cards = KPI_DEFS.map((def) => {
    const raw = def.value(k);
    const display = (v) => (def.isRate ? (v === null ? '—' : percent(v)) : moneyShort(v, currency()));
    const full = def.isRate ? (raw === null ? 'No income this month' : percent(raw)) : fmt(raw);
    const visible = h('span', { 'aria-hidden': 'true' }, display(raw));
    const valueEl = h('p', { class: 'kpi-value', title: full, dataset: { value: raw === null ? '' : String(raw) } },
      visible, h('span', { class: 'sr-only' }, full));
    const card = h('article', { class: 'card kpi', dataset: { kpi: def.key } },
      h('div', { class: 'kpi-top' },
        h('h2', { class: 'kpi-label' }, def.label),
        h('span', { class: 'kpi-ico', 'aria-hidden': 'true' }, icon(def.icon))),
      valueEl,
      h('div', { class: 'kpi-bottom' },
        trendChip(def.change(k), { goodWhenUp: def.up, points: def.isRate, srSuffix: ' vs last month' }),
        h('a', { class: 'kpi-details', href: def.href, dataset: def.filter ? { filter: def.filter } : {}, 'aria-label': `View ${def.label} details` },
          'View details', h('span', { 'aria-hidden': 'true' }, ' ↗'))),
    );
    return { card, valueEl, visible, raw, display, isRate: def.isRate };
  });
  grid.replaceChildren(...cards.map((c) => c.card));
  for (const c of cards) {
    fitText(c.valueEl);
    if (ui.firstHome && typeof c.raw === 'number') {
      const to = c.isRate ? Math.round(c.raw * 1000) : c.raw;
      countUp(to, (v) => {
        c.visible.textContent = c.display(c.isRate ? v / 1000 : v);
        if (v === to) { c.visible.textContent = c.display(c.raw); fitText(c.valueEl); }
      });
    }
  }
}

/* ---------------- Overview chart ---------------- */
let chart;
const UNIT = { week: 'week', month: 'month', year: 'year' };

function renderOverview() {
  const s = state.series(data(), ui.mode, new Date());
  let sel = ui.selected[ui.mode];
  if (sel === undefined || sel >= s.length) sel = s.length - 1;
  ui.selected[ui.mode] = sel;
  ui.series = s;
  updateOverviewText();
  chart.update(s, sel, ui.mode);
  document.querySelectorAll('#period-seg button').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.mode === ui.mode));
  });
}

function updateOverviewText() {
  const s = ui.series;
  const i = ui.selected[ui.mode];
  const p = s[i];
  const prev = s[i - 1];
  $('overview-label').textContent = `Expenses · ${p.long}`;
  const total = $('overview-total');
  total.textContent = fmt(p.expense);
  total.dataset.cents = String(p.expense);
  $('overview-trend').replaceChildren(trendChip(prev ? state.change(p.expense, prev.expense) : null, {
    goodWhenUp: false, suffix: ` vs last ${UNIT[ui.mode]}`,
  }));
}

/* ---------------- Lists ---------------- */
function renderTopCategories(period) {
  const list = $('top-cats');
  const stats = state.categoryStats(data(), period).filter((r) => r.spent > 0).slice(0, 4);
  if (!stats.length) {
    list.replaceChildren(h('li', {}, homeEmpty('No spending yet this month', 'Your top categories will show up here.')));
    return;
  }
  list.replaceChildren(...stats.map((r) => {
    const pct = r.limit ? (r.spent / r.limit) * 100 : 0;
    let bar = null;
    if (r.limit) {
      const fill = h('div', { class: `mini-bar-fill${pct > 100 ? ' is-over' : ''}` });
      fill.style.width = `${Math.min(100, pct)}%`;
      bar = h('div', {
        class: 'mini-bar', role: 'progressbar',
        'aria-label': `${r.cat.name} budget used`,
        'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(100, Math.round(pct)),
        'aria-valuetext': `${Math.round(pct)}% of ${fmt(r.limit)}`,
      }, fill);
    }
    return h('li', {},
      h('div', { class: 'tile', dataset: { cat: r.cat.id, cents: String(r.spent) } },
        catTile(r.cat),
        h('span', { class: 'tile-main' },
          h('span', { class: 'tile-title' }, r.cat.name),
          h('span', { class: 'tile-sub' }, `${r.count} transaction${r.count === 1 ? '' : 's'}${r.limit ? ` · ${Math.round(pct)}%` : ''}`),
          bar),
        h('span', { class: 'tile-amount' }, fmt(r.spent))));
  }));
}

function renderRecent(today) {
  const list = $('recent-list');
  const recent = state.sortedTx(data().transactions).slice(0, 5);
  if (!recent.length) {
    list.replaceChildren(h('li', {}, homeEmpty('No transactions yet', 'Track your first expense or income to get started.')));
    return;
  }
  list.replaceChildren(...recent.map((tx) => h('li', {}, txTile(tx, {
    category: state.getCategory(tx.categoryId),
    money: fmt,
    dayText: dayLabel(tx.date, today),
    as: 'button',
    onClick: () => openTxSheet(tx),
  }))));
}

function homeEmpty(title, text) {
  const none = data().transactions.length === 0;
  return emptyState({
    title: none ? 'Nothing here yet' : title,
    text: none ? 'Add your first transaction to see your spending come to life.' : text,
    actionLabel: none ? 'Add your first transaction' : null,
    onAction: () => openTxSheet(),
  });
}

/* ====================================================================
   Add / edit transaction sheet
   ==================================================================== */
let editing = null;

function sheetType() {
  return $('tx-form').querySelector('input[name="type"]:checked')?.value || 'expense';
}

function renderCatGrid(type, selectedId) {
  const grid = $('tx-cat-grid');
  const cats = state.categoriesFor(type);
  grid.replaceChildren(...cats.map((cat) => h('label', { class: 'cat-option' },
    h('input', { type: 'radio', name: 'category', value: cat.id, checked: cat.id === selectedId }),
    h('span', { class: 'cat-tile' }, catTile(cat, type), cat.name))));
}

function clearSheetErrors() {
  setFieldError($('tx-amount-error'), '', $('tx-amount'));
  setFieldError($('tx-category-error'), '');
  setFieldError($('tx-date-error'), '', $('tx-date'));
  setFieldError($('tx-note-error'), '', $('tx-note'));
}

function openTxSheet(tx = null) {
  editing = tx;
  const form = $('tx-form');
  form.reset();
  const type = tx ? tx.type : 'expense';
  form.querySelector(`input[name="type"][value="${type}"]`).checked = true;
  $('sheet-title').textContent = tx ? 'Edit transaction' : 'Add transaction';
  $('tx-save').textContent = tx ? 'Save changes' : 'Save transaction';
  $('tx-currency').textContent = currencySymbol(currency());
  $('tx-amount').value = tx ? centsToPlain(tx.amountCents) : '';
  $('tx-date').value = tx ? tx.date : todayISO();
  $('tx-note').value = tx ? tx.note : '';
  renderCatGrid(type, tx?.categoryId);
  clearSheetErrors();
  openDialog($('tx-sheet'));
  $('tx-amount').focus({ preventScroll: true });
}

function submitTx(e) {
  e.preventDefault();
  const form = $('tx-form');
  const input = {
    type: sheetType(),
    amount: $('tx-amount').value,
    categoryId: form.querySelector('input[name="category"]:checked')?.value || '',
    date: $('tx-date').value,
    note: $('tx-note').value,
  };
  const r = editing ? state.updateTx(editing.id, input) : state.addTx(input);
  if (!r.ok) {
    const er = r.errors;
    setFieldError($('tx-amount-error'), er.amount, $('tx-amount'));
    setFieldError($('tx-category-error'), er.category);
    setFieldError($('tx-date-error'), er.date, $('tx-date'));
    setFieldError($('tx-note-error'), er.note, $('tx-note'));
    const first = er.amount ? $('tx-amount')
      : er.category ? form.querySelector('input[name="category"]')
        : er.date ? $('tx-date') : $('tx-note');
    first?.focus();
    return;
  }
  const wasEditing = !!editing;
  editing = null;
  closeDialog($('tx-sheet'));
  showToast(wasEditing ? 'Transaction updated' : 'Transaction added');
}

function wireSheet() {
  const form = $('tx-form');
  wireDialog($('tx-sheet'));
  form.addEventListener('submit', submitTx);
  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') {
      const keep = form.querySelector('input[name="category"]:checked')?.value;
      renderCatGrid(e.target.value, keep);
    }
    if (e.target.name === 'category') setFieldError($('tx-category-error'), '');
  });
  $('tx-amount').addEventListener('input', () => setFieldError($('tx-amount-error'), '', $('tx-amount')));
  $('tx-date').addEventListener('input', () => setFieldError($('tx-date-error'), '', $('tx-date')));
  $('tx-note').addEventListener('input', () => setFieldError($('tx-note-error'), '', $('tx-note')));
}

/* ====================================================================
   Notices + render loop
   ==================================================================== */
const NOTICES = {
  unavailable: "Storage isn't available, so changes will be lost when you close the app.",
  full: "Your device storage is full, so new changes can't be saved.",
  corrupt: "Saved data couldn't be read. A backup copy was kept on this device, and the app started fresh.",
};
function renderNotice() {
  const el = $('storage-notice');
  const problem = state.storageProblem();
  el.hidden = !problem;
  el.textContent = problem ? NOTICES[problem] : '';
}

function renderAll() {
  renderNotice();
  renderHome();
}

/* ====================================================================
   Events
   ==================================================================== */
function wire() {
  window.addEventListener('hashchange', route);

  $('period-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-mode]');
    if (!b || b.dataset.mode === ui.mode) return;
    ui.mode = b.dataset.mode;
    renderOverview();
  });

  // "View details" links can pre-set the transactions filter.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-filter]');
    if (a) { ui.txFilter = a.dataset.filter; ui.txQuery = ''; }
  });

  $('fab').addEventListener('click', () => openTxSheet());
  wireSheet();
  wireToast();
  for (const id of ['confirm-dialog', 'reset-dialog', 'budget-dialog', 'notif-sheet']) wireDialog($(id));
  // Confirm dialog: animate out instead of closing instantly.
  $('confirm-dialog').querySelector('form').addEventListener('submit', (e) => {
    e.preventDefault();
    closeDialog($('confirm-dialog'), e.submitter?.value || 'cancel');
  });
}

/* ====================================================================
   Boot
   ==================================================================== */
function boot() {
  state.init();
  hydrateIcons();
  chart = createBarChart($('chart'), {
    money: fmt,
    axisMoney: (c) => money(c, currency(), { compact: true }),
    onSelect: (i) => { ui.selected[ui.mode] = i; updateOverviewText(); },
  });
  wire();
  route();
  renderAll();
  state.subscribe(renderAll);
  // Inter is wider than the fallback font: re-fit KPI numbers once it arrives.
  document.fonts?.ready.then(() => document.querySelectorAll('.kpi-value').forEach((el) => fitText(el)));
  document.documentElement.dataset.ready = '1';
}

boot();
