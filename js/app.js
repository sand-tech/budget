// Controller: boot, routing, rendering of each screen, and event wiring.
import * as state from './state.js';
import { requestPersistence } from './storage.js';
import {
  money, moneyShort, percent, dayLabel, currencySymbol, centsToPlain, todayISO, fmtDate,
} from './format.js';
import {
  h, icon, hydrateIcons, trendChip, catTile, txTile, emptyState, fitText, countUp,
  openDialog, closeDialog, wireDialog, confirmAction, showToast, hideToast, wireToast, setFieldError,
  wireSwipe, closeOpenRows, initSegThumb, wireScrollRow, replay, reducedMotion, wait,
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
  prevKpi: {},           // last KPI values, to animate changes
  highlightId: null,     // transaction to flash after add/edit/undo
  alertCount: null,
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

let enterTimer = null;
function show(name) {
  if (name === ui.screen) return;
  const prev = ui.screen;
  ui.screen = name;
  for (const s of SCREENS) {
    const el = $(`screen-${s}`);
    el.hidden = s !== name;
    el.classList.toggle('is-entering', s === name);
  }
  // Stagger-in only plays on arrival; later re-renders shouldn't replay it.
  clearTimeout(enterTimer);
  enterTimer = setTimeout(() => $(`screen-${name}`).classList.remove('is-entering'), 900);
  document.querySelectorAll('.tab').forEach((tab) => {
    if (tab.dataset.tab === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  });
  moveTabIndicator(prev !== null);
  if (prev !== null) window.scrollTo(0, 0);
}

function moveTabIndicator(animate = true) {
  const tab = document.querySelector('.tab[aria-current="page"]');
  const ind = document.querySelector('.tab-indicator');
  if (!tab || !ind) return;
  if (!animate) ind.style.transition = 'none';
  ind.style.width = `${tab.offsetWidth}px`;
  ind.style.transform = `translateX(${tab.offsetLeft}px)`;
  ind.classList.add('is-ready');
  if (!animate) requestAnimationFrame(() => { ind.style.transition = ''; });
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
  $('home-subtitle').textContent = `Your money in ${k.period.long}`;
  $('sample-banner').hidden = !state.hasSample(d);
  renderKpis(k);
  renderOverview(ui.firstHome);
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
    return { key: def.key, card, valueEl, visible, raw, display, isRate: def.isRate };
  });
  grid.replaceChildren(...cards.map((c) => c.card));
  for (const c of cards) {
    fitText(c.valueEl);
    // First load counts up from 0; later changes glide from the old value.
    const from = ui.firstHome ? 0 : ui.prevKpi[c.key];
    if (typeof c.raw === 'number' && typeof from === 'number' && from !== c.raw) {
      const scale = c.isRate ? 1000 : 1;
      const to = Math.round(c.raw * scale);
      countUp(to, (v) => {
        c.visible.textContent = c.display(v / scale);
        if (v === to) { c.visible.textContent = c.display(c.raw); fitText(c.valueEl); }
      }, ui.firstHome ? 700 : 450, Math.round(from * scale));
      if (!ui.firstHome) replay(c.card, 'is-updated');
    }
    ui.prevKpi[c.key] = c.raw;
  }
}

/* ---------------- Overview chart ---------------- */
let chart;
const UNIT = { week: 'week', month: 'month', year: 'year' };

function renderOverview(grow = false) {
  const s = state.series(data(), ui.mode, new Date());
  let sel = ui.selected[ui.mode];
  if (sel === undefined || sel >= s.length) sel = s.length - 1;
  ui.selected[ui.mode] = sel;
  ui.series = s;
  updateOverviewText();
  chart.update(s, sel, ui.mode, grow);
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
    list.replaceChildren(h('li', {}, emptyState({
      iconName: 'pie',
      title: 'No spending yet this month',
      text: 'Your top categories will show up here.',
    })));
    return;
  }
  // The bar shows the category's budget, measured over that budget's own period.
  const budgets = new Map(state.budgetRows(data(), new Date()).map((b) => [b.cat.id, b]));
  list.replaceChildren(...stats.map((r) => {
    const b = budgets.get(r.cat.id);
    const pct = b ? b.ratio * 100 : 0;
    const per = b ? (b.period === 'week' ? ' of weekly' : '') : '';
    let bar = null;
    if (b) {
      const fill = h('div', { class: `mini-bar-fill${pct > 100 ? ' is-over' : ''}` });
      fill.style.width = `${Math.min(100, pct)}%`;
      bar = h('div', {
        class: 'mini-bar', role: 'progressbar',
        'aria-label': `${r.cat.name} budget used`,
        'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(100, Math.round(pct)),
        'aria-valuetext': `${Math.round(pct)}% of ${fmt(b.limit)} ${b.period === 'week' ? 'this week' : 'this month'}`,
      }, fill);
    }
    return h('li', {},
      h('div', { class: 'tile', dataset: { cat: r.cat.id, cents: String(r.spent) } },
        catTile(r.cat),
        h('span', { class: 'tile-main' },
          h('span', { class: 'tile-title' }, r.cat.name),
          h('span', { class: 'tile-sub' }, `${r.count} transaction${r.count === 1 ? '' : 's'}${b ? ` · ${Math.round(pct)}%${per}` : ''}`),
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
  list.replaceChildren(...recent.map((tx) => h('li', { class: tx.id === ui.highlightId ? 'is-new' : '' }, txTile(tx, {
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
   Transactions
   ==================================================================== */
function txFilters() {
  return [
    { id: 'all', label: 'All' },
    { id: 'income', label: 'Income', icon: 'trendUp' },
    { id: 'expense', label: 'Expense', icon: 'trendDown' },
    ...state.orderedCategories().map((c) => ({ id: `cat:${c.id}`, label: c.name, icon: c.icon })),
  ];
}

function renderTransactions() {
  const d = data();
  const today = new Date();

  const chips = $('tx-filters');
  // Rebuild the chips whenever categories are added, renamed or deleted.
  const filters = txFilters();
  const sig = filters.map((f) => `${f.id}:${f.label}:${f.icon ?? ''}`).join('|');
  if (chips.dataset.sig !== sig) {
    chips.dataset.sig = sig;
    if (!filters.some((f) => f.id === ui.txFilter)) ui.txFilter = 'all';
    chips.replaceChildren(...filters.map((f) => h('button', {
      type: 'button', class: 'filter-chip', dataset: { filter: f.id }, 'aria-pressed': 'false',
    }, f.icon ? icon(f.icon) : null, f.label)));
  }
  chips.querySelectorAll('.filter-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === ui.txFilter)));
  if (ui.revealedFilter !== ui.txFilter && chipRow) {
    ui.revealedFilter = ui.txFilter;
    requestAnimationFrame(() => chipRow.reveal(chips.querySelector('.filter-chip[aria-pressed="true"]')));
  }

  const search = $('tx-search');
  if (search.value !== ui.txQuery) search.value = ui.txQuery;

  const list = state.filterTx(d, { query: ui.txQuery, filter: ui.txFilter });
  const filtered = ui.txQuery.trim() !== '' || ui.txFilter !== 'all';
  $('tx-count').textContent = filtered ? `${list.length} result${list.length === 1 ? '' : 's'}` : '';

  const root = $('tx-groups');
  if (!list.length) {
    root.replaceChildren(d.transactions.length === 0
      ? emptyState({
        title: 'No transactions yet',
        text: 'Add your first transaction and it will show up here.',
        actionLabel: 'Add your first transaction',
        onAction: () => openTxSheet(),
      })
      : h('div', { class: 'empty card' },
        h('div', { class: 'empty-icon', 'aria-hidden': 'true' }, icon('search')),
        h('h3', {}, 'No matches'),
        h('p', {}, ui.txQuery.trim() ? `Nothing matches "${ui.txQuery.trim()}".` : 'Nothing in this filter yet.'),
        h('button', { type: 'button', class: 'btn btn-secondary', onclick: () => { ui.txQuery = ''; ui.txFilter = 'all'; renderTransactions(); } }, 'Clear search and filters')));
    return;
  }

  const groups = new Map();
  for (const t of list) {
    if (!groups.has(t.date)) groups.set(t.date, []);
    groups.get(t.date).push(t);
  }
  root.replaceChildren(...[...groups].map(([date, txs]) => {
    const net = txs.reduce((s, t) => s + (t.type === 'income' ? t.amountCents : -t.amountCents), 0);
    const headId = `g-${date}`;
    return h('section', { class: 'tx-group', 'aria-labelledby': headId, dataset: { date } },
      h('h2', { class: 'tx-group-head', id: headId },
        h('span', {}, dayLabel(date, today)),
        h('span', { class: 'tx-group-total' }, `${net > 0 ? '+' : net < 0 ? '−' : ''}${fmt(Math.abs(net))}`)),
      h('ul', { class: 'tile-list' }, ...txs.map((tx) => h('li', {}, swipeRow(tx, today)))));
  }));
}

function swipeRow(tx, today) {
  const category = state.getCategory(tx.categoryId);
  const title = tx.note || category?.name || 'transaction';
  return h('div', { class: `swipe${tx.id === ui.highlightId ? ' is-new' : ''}`, dataset: { id: tx.id } },
    h('div', { class: 'swipe-actions' },
      h('button', { type: 'button', class: 'swipe-btn swipe-edit', 'aria-label': `Edit ${title}`, onclick: () => openTxSheet(tx) },
        icon('pencil'), 'Edit'),
      h('button', { type: 'button', class: 'swipe-btn swipe-delete', 'aria-label': `Delete ${title}`, onclick: () => deleteFlow(tx) },
        icon('trash'), 'Delete')),
    h('div', { class: 'swipe-content' },
      txTile(tx, { category, money: fmt, dayText: dayLabel(tx.date, today), showDay: false, as: 'button', onClick: () => openTxSheet(tx) })));
}

async function deleteFlow(tx) {
  const category = state.getCategory(tx.categoryId);
  const title = tx.note || category?.name || 'This transaction';
  const ok = await confirmAction({
    title: 'Delete transaction?',
    text: `${title}, ${fmt(tx.amountCents)} on ${dayLabel(tx.date)}. You can undo this for 5 seconds.`,
    okLabel: 'Delete',
    danger: true,
  });
  if (!ok) {
    closeOpenRows($('tx-groups'));
    return;
  }
  // Slide the row out and collapse the gap before removing it.
  const li = $('tx-groups').querySelector(`.swipe[data-id="${CSS.escape(tx.id)}"]`)?.closest('li');
  if (li && !reducedMotion()) {
    li.style.height = `${li.offsetHeight}px`;
    li.classList.add('is-leaving');
    await wait(260);
  }
  const token = state.deleteTx(tx.id);
  if (!token) return;
  showToast('Transaction deleted', {
    actionLabel: 'Undo',
    duration: 5000,
    onAction: () => {
      if (state.restoreTx(token)) showToast('Transaction restored');
    },
  });
  $('tx-search').focus({ preventScroll: true });
}

let chipRow = null;
function wireTransactions() {
  chipRow = wireScrollRow($('tx-filters-wrap'));
  $('tx-search').addEventListener('input', (e) => {
    ui.txQuery = e.target.value.slice(0, 100);
    renderTransactions();
  });
  $('tx-filters').addEventListener('click', (e) => {
    const b = e.target.closest('.filter-chip');
    if (!b) return;
    ui.txFilter = b.dataset.filter;
    renderTransactions();
  });
  wireSwipe($('tx-groups'));
}

/* ====================================================================
   Budgets
   ==================================================================== */
function levelChip(level, ratio) {
  if (level === 'over') return h('span', { class: 'chip chip-over' }, h('span', { 'aria-hidden': 'true' }, '▲ '), 'Over budget');
  if (level === 'warn') return h('span', { class: 'chip chip-warn' }, h('span', { 'aria-hidden': 'true' }, '⚠ '), `${Math.floor(ratio * 100)}% used`);
  return null;
}

function progressBar(label, spent, limit) {
  const pct = limit ? (spent / limit) * 100 : 0;
  const fill = h('div', { class: `progress-fill${pct > 100 ? ' is-over' : ''}` });
  fill.style.width = `${Math.min(100, pct)}%`;
  return h('div', {
    class: 'progress', role: 'progressbar', 'aria-label': label,
    'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.min(100, Math.round(pct)),
    'aria-valuetext': `${Math.round(pct)}% used, ${fmt(spent)} of ${fmt(limit)}`,
  }, fill);
}

const PERIOD_WORD = { week: 'Weekly', month: 'Monthly' };
const PERIOD_NOUN = { week: 'week', month: 'month' };

function resetText(range, period) {
  const opts = period === 'week' ? { weekday: 'short', month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric' };
  return `Resets ${fmtDate(range.endDate, opts)}`;
}

function renderBudgets() {
  const d = data();
  const today = new Date();
  const month = state.periodAt('month', today, d.settings.startDay);
  const rows = state.budgetRows(d, today)
    .sort((a, b) => b.ratio - a.ratio || a.cat.name.localeCompare(b.cat.name));
  $('budgets-period').textContent = month.long;

  // Summary: one block per period in use (this month / this week).
  const summary = $('budget-summary');
  if (!rows.length) {
    summary.replaceChildren(h('article', { class: 'card' }, emptyState({
      iconName: 'pie',
      title: 'No budgets yet',
      text: 'Create a budget for anything you want to keep an eye on, weekly or monthly.',
    })));
  } else {
    const blocks = ['month', 'week'].map((p) => {
      const group = rows.filter((r) => r.period === p);
      if (!group.length) return null;
      const limit = group.reduce((s, r) => s + r.limit, 0);
      const spent = group.reduce((s, r) => s + r.spent, 0);
      const left = limit - spent;
      return h('div', { class: 'bs-block', dataset: { period: p } },
        h('p', { class: 'bs-title' }, p === 'week' ? 'This week' : 'This month',
          h('span', { class: 'bs-count' }, ` · ${group.length} budget${group.length === 1 ? '' : 's'}`)),
        h('div', { class: 'bs-row' },
          h('div', {}, h('p', { class: 'bs-label' }, 'Spent'), h('p', { class: 'bs-value', dataset: { cents: String(spent) } }, fmt(spent))),
          h('div', {}, h('p', { class: 'bs-label' }, 'Budget'), h('p', { class: 'bs-value' }, fmt(limit))),
          h('div', {}, h('p', { class: 'bs-label' }, left < 0 ? 'Over by' : 'Left'), h('p', { class: 'bs-value' }, fmt(Math.abs(left))))),
        progressBar(`${p === 'week' ? 'Weekly' : 'Monthly'} budgets used`, spent, limit));
    });
    const over = rows.filter((r) => r.level === 'over').length;
    summary.replaceChildren(h('article', { class: 'card budget-summary' },
      ...blocks,
      h('p', { class: 'hint' }, over
        ? `${over} budget${over === 1 ? ' is' : 's are'} over the limit.`
        : 'Tap Edit on a card to rename it, change its limit or how often it resets.')));
  }

  $('budget-list').replaceChildren(...rows.map((r) => {
    const remaining = r.limit - r.spent;
    return h('article', {
      class: `card budget-card${r.cat.id === ui.highlightBudget ? ' is-new' : ''}`,
      dataset: { cat: r.cat.id, level: r.level, period: r.period, spent: String(r.spent), remaining: String(remaining) },
      'aria-labelledby': `bc-${r.cat.id}`,
    },
    h('div', { class: 'bc-head' },
      catTile(r.cat),
      h('div', { class: 'bc-title' },
        h('h2', { class: 'bc-name', id: `bc-${r.cat.id}` }, r.cat.name),
        h('p', { class: 'bc-sub' }, `${PERIOD_WORD[r.period]} · ${r.count} transaction${r.count === 1 ? '' : 's'} this ${PERIOD_NOUN[r.period]}`)),
      levelChip(r.level, r.ratio)),
    progressBar(`${r.cat.name} budget used`, r.spent, r.limit),
    h('dl', { class: 'bc-amounts' },
      h('div', {}, h('dt', {}, 'Limit'), h('dd', {}, fmt(r.limit))),
      h('div', {}, h('dt', {}, 'Spent'), h('dd', {}, fmt(r.spent))),
      h('div', {}, h('dt', {}, remaining < 0 ? 'Over by' : 'Remaining'),
        h('dd', { class: remaining < 0 ? 'is-over' : '' }, fmt(Math.abs(remaining))))),
    h('div', { class: 'bc-foot' },
      h('p', { class: 'hint' }, `${Math.round(r.ratio * 100)}% used · ${resetText(r.range, r.period)}`),
      h('button', { type: 'button', class: 'btn btn-secondary bc-edit', 'aria-label': `Edit ${r.cat.name} budget`, onclick: () => openBudgetSheet(r.cat) },
        icon('pencil'), 'Edit')));
  }));

  // Categories without a limit, so you can start tracking them again.
  const untracked = state.untrackedCategories(d);
  $('untracked').hidden = untracked.length === 0;
  $('untracked-list').replaceChildren(...untracked.map((cat) => h('li', {},
    h('div', { class: 'tile', dataset: { cat: cat.id } },
      catTile(cat),
      h('span', { class: 'tile-main' },
        h('span', { class: 'tile-title' }, cat.name),
        h('span', { class: 'tile-sub' }, 'No limit')),
      h('button', { type: 'button', class: 'btn btn-secondary btn-small', 'aria-label': `Add a limit for ${cat.name}`, onclick: () => openBudgetSheet(cat) }, 'Add limit')))));
}

/* ---------------- Budget sheet (create / edit) ---------------- */
let budgetEditing = null;

function renderIconGrid(selected, extraIcon) {
  const icons = [...state.BUDGET_ICONS];
  if (extraIcon && !icons.includes(extraIcon)) icons.unshift(extraIcon);
  $('budget-icon-grid').replaceChildren(...icons.map((name) => h('label', { class: 'icon-option', title: name },
    h('input', { type: 'radio', name: 'icon', value: name, checked: name === selected, 'aria-label': `${name} icon` }),
    h('span', { class: 'icon-tile' }, icon(name)))));
}

function updateBudgetPreview() {
  const chosen = $('budget-form').querySelector('input[name="icon"]:checked')?.value || 'tag';
  $('budget-preview-icon').replaceChildren(icon(chosen));
  const period = $('budget-form').querySelector('input[name="period"]:checked')?.value || 'month';
  $('budget-period-hint').textContent = period === 'week'
    ? 'Starts fresh every Monday.'
    : `Starts fresh on day ${data().settings.startDay} of each month. You can change that day in Settings.`;
}

function clearBudgetErrors() {
  setFieldError($('budget-name-error'), '', $('budget-name'));
  setFieldError($('budget-icon-error'), '');
  setFieldError($('budget-input-error'), '', $('budget-input'));
}

function openBudgetSheet(cat = null) {
  budgetEditing = cat;
  const form = $('budget-form');
  form.reset();
  const b = cat ? data().budgets[cat.id] : null;
  const builtIn = cat ? state.isBuiltIn(cat) : false;
  $('budget-sheet-title').textContent = !cat ? 'New budget' : b ? `Edit ${cat.name}` : `Track ${cat.name}`;
  $('budget-save').textContent = !cat ? 'Create budget' : 'Save budget';
  $('budget-name').value = cat ? cat.name : '';
  const builtInIcon = builtIn ? state.DEFAULT_CATEGORIES.find((x) => x.id === cat.id).icon : null;
  renderIconGrid(cat ? cat.icon : 'tag', builtInIcon);
  $('budget-input').value = b ? centsToPlain(b.limit) : '';
  form.querySelector(`input[name="period"][value="${b?.period ?? 'month'}"]`).checked = true;
  $('budget-currency').textContent = currencySymbol(currency());
  // Your own budgets can be deleted; built-in categories can only stop being tracked.
  const remove = $('budget-remove');
  remove.hidden = !cat || (builtIn && !b);
  remove.textContent = builtIn ? 'Stop tracking' : 'Delete budget';
  clearBudgetErrors();
  updateBudgetPreview();
  openDialog($('budget-sheet'));
  (cat ? $('budget-input') : $('budget-name')).focus({ preventScroll: true });
}

function submitBudget(e) {
  e.preventDefault();
  const form = $('budget-form');
  const r = state.saveBudget({
    categoryId: budgetEditing?.id,
    name: $('budget-name').value,
    icon: form.querySelector('input[name="icon"]:checked')?.value || '',
    limit: $('budget-input').value,
    period: form.querySelector('input[name="period"]:checked')?.value || '',
  });
  if (!r.ok) {
    const er = r.errors;
    setFieldError($('budget-name-error'), er.name, $('budget-name'));
    setFieldError($('budget-icon-error'), er.icon);
    setFieldError($('budget-input-error'), er.limit, $('budget-input'));
    if (er.limit) replay(form.querySelector('.amount-wrap'), 'is-shaking');
    if (er.name) replay($('budget-name'), 'is-shaking');
    (er.name ? $('budget-name') : er.icon ? form.querySelector('input[name="icon"]') : $('budget-input')).focus();
    return;
  }
  budgetEditing = null;
  closeDialog($('budget-sheet'));
  showToast(r.created ? `${r.category.name} budget created` : `${r.category.name} budget updated`);
}

async function removeBudgetFlow() {
  const cat = budgetEditing;
  if (!cat) return;
  if (state.isBuiltIn(cat)) {
    const previous = { ...data().budgets[cat.id] };
    await closeDialog($('budget-sheet'));
    state.removeBudget(cat.id);
    showToast(`${cat.name} is no longer tracked`, {
      actionLabel: 'Undo',
      duration: 5000,
      onAction: () => state.saveBudget({ categoryId: cat.id, name: cat.name, icon: cat.icon, limit: centsToPlain(previous.limit), period: previous.period }),
    });
    return;
  }
  const n = state.transactionCount(cat.id);
  const ok = await confirmAction({
    title: `Delete ${cat.name}?`,
    text: n
      ? `The budget is removed and its ${n} transaction${n === 1 ? '' : 's'} move${n === 1 ? 's' : ''} to Other. This can't be undone.`
      : 'The budget and its category are removed. This can\'t be undone.',
    okLabel: 'Delete',
    danger: true,
  });
  if (!ok) return;
  await closeDialog($('budget-sheet'));
  state.deleteCategory(cat.id);
  budgetEditing = null;
  showToast(`${cat.name} deleted`);
}

function wireBudgets() {
  wireDialog($('budget-sheet'));
  $('new-budget-btn').addEventListener('click', () => openBudgetSheet());
  $('budget-form').addEventListener('submit', submitBudget);
  $('budget-form').addEventListener('change', (e) => {
    if (e.target.name === 'icon') { setFieldError($('budget-icon-error'), ''); updateBudgetPreview(); }
    if (e.target.name === 'period') updateBudgetPreview();
  });
  $('budget-name').addEventListener('input', () => setFieldError($('budget-name-error'), '', $('budget-name')));
  $('budget-input').addEventListener('input', () => setFieldError($('budget-input-error'), '', $('budget-input')));
  $('budget-remove').addEventListener('click', removeBudgetFlow);
}

/* ====================================================================
   Settings
   ==================================================================== */
const MAX_IMPORT_BYTES = 1024 * 1024;
const PERSIST_TEXT = {
  true: 'Your browser has agreed to keep this data, even when storage runs low.',
  false: 'Your browser may clear this data if the device runs low on space. Export a backup now and then.',
  null: "This browser doesn't say whether it keeps data long term. Export a backup now and then.",
};

function applyTheme() {
  const theme = data().settings.theme;
  const root = document.documentElement;
  if (theme === 'system') delete root.dataset.theme;
  else root.dataset.theme = theme;
  const bg = getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#F3F4F6';
  document.querySelector('meta[name="theme-color"]').setAttribute('content', bg);
}

function renderSettings() {
  const d = data();
  const s = d.settings;
  const name = $('set-name');
  if (document.activeElement !== name) name.value = s.name;
  $('set-currency').value = s.currency;
  const startDay = $('set-startday');
  if (!startDay.options.length) {
    for (let i = 1; i <= 28; i++) startDay.append(h('option', { value: String(i) }, String(i)));
  }
  startDay.value = String(s.startDay);
  document.querySelectorAll('#theme-seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeValue === s.theme)));
  applyTheme();

  $('persist-status').textContent = PERSIST_TEXT[String(ui.persisted ?? null)];

  const remind = state.needsBackupReminder(d);
  $('backup-reminder').hidden = !remind;
  if (remind) {
    $('backup-reminder-text').textContent = s.lastExportAt
      ? `Your last export was ${Math.floor((Date.now() - s.lastExportAt) / 86_400_000)} days ago. Export a CSV and keep it somewhere safe.`
      : "You haven't exported a backup yet. Export a CSV and keep it somewhere safe.";
  }

  const sample = d.transactions.filter((t) => t.sample).length;
  $('clear-sample-btn').disabled = sample === 0;
  $('clear-sample-hint').textContent = sample
    ? `Removes the ${sample} example transactions. Your own entries stay.`
    : 'No sample data left.';
}

function exportCsv() {
  const csv = state.exportCSV();
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `budget-${todayISO()}.csv` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  state.markExported();
  const n = data().transactions.length;
  showToast(`Exported ${n} transaction${n === 1 ? '' : 's'}`);
}

function renderImportResult(r) {
  const box = $('import-result');
  const parts = [];
  if (r.fatal) {
    parts.push(h('h3', {}, 'Nothing was imported'), h('p', { class: 'bad' }, `✕ ${r.fatal}`));
  } else {
    parts.push(h('h3', {}, 'Import finished'));
    parts.push(h('p', { class: r.added ? 'ok' : '' }, `${r.added ? '✓' : '•'} Added ${r.added} transaction${r.added === 1 ? '' : 's'}.`));
    const section = (items, cls, label) => {
      if (!items.length) return;
      parts.push(h('p', { class: cls }, label(items.length)));
      const shown = items.slice(0, 50);
      parts.push(h('ul', { dataset: { kind: cls } }, ...shown.map((x) => h('li', {}, h('b', {}, `Line ${x.line}: `), x.reason)),
        items.length > shown.length ? h('li', {}, `…and ${items.length - shown.length} more.`) : null));
    };
    section(r.skipped, 'skipped', (n) => `• Skipped ${n} row${n === 1 ? '' : 's'}:`);
    section(r.rejected, 'bad', (n) => `✕ Rejected ${n} row${n === 1 ? '' : 's'}:`);
  }
  box.replaceChildren(...parts);
  box.hidden = false;
}

async function importCsv(file) {
  if (!file) return;
  if (file.size > MAX_IMPORT_BYTES) {
    renderImportResult({ fatal: `This file is ${(file.size / 1024 / 1024).toFixed(1)} MB. The limit is 1 MB.`, added: 0, rejected: [], skipped: [] });
    return;
  }
  let text;
  try {
    text = await file.text();
  } catch {
    renderImportResult({ fatal: "The file couldn't be read.", added: 0, rejected: [], skipped: [] });
    return;
  }
  const r = state.importCSV(text);
  renderImportResult(r);
  if (!r.fatal && r.added) showToast(`Imported ${r.added} transaction${r.added === 1 ? '' : 's'}`);
}

function wireSettings() {
  const name = $('set-name');
  name.addEventListener('change', () => {
    const v = name.value.trim();
    if (!v) {
      setFieldError($('set-name-error'), 'Enter a name, or keep "Friend".', name);
      return;
    }
    setFieldError($('set-name-error'), '', name);
    state.updateSettings({ name: v });
    showToast('Name saved');
  });
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') name.blur(); });
  $('set-currency').addEventListener('change', (e) => { state.updateSettings({ currency: e.target.value }); });
  $('set-startday').addEventListener('change', (e) => { state.updateSettings({ startDay: Number(e.target.value) }); });
  $('theme-seg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-theme-value]');
    if (!b || b.dataset.themeValue === data().settings.theme) return;
    const apply = () => state.updateSettings({ theme: b.dataset.themeValue });
    // Cross-fade the whole app between themes where the browser supports it.
    if (document.startViewTransition && !reducedMotion()) document.startViewTransition(apply);
    else apply();
  });

  $('export-btn').addEventListener('click', exportCsv);
  $('import-input').addEventListener('change', async (e) => {
    const input = e.target;
    await importCsv(input.files?.[0]);
    input.value = '';
  });

  $('clear-sample-btn').addEventListener('click', async () => {
    const ok = await confirmAction({
      title: 'Clear sample data?',
      text: 'This removes the example transactions. Anything you added yourself stays.',
      okLabel: 'Clear samples',
      danger: true,
    });
    if (!ok) return;
    const n = state.clearSample();
    showToast(`Removed ${n} sample transaction${n === 1 ? '' : 's'}`);
  });

  const resetInput = $('reset-input');
  $('reset-btn').addEventListener('click', () => {
    resetInput.value = '';
    $('reset-confirm').disabled = true;
    openDialog($('reset-dialog'));
    resetInput.focus();
  });
  resetInput.addEventListener('input', () => { $('reset-confirm').disabled = resetInput.value.trim() !== 'RESET'; });
  $('reset-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (resetInput.value.trim() !== 'RESET') return;
    state.resetAll();
    ui.txQuery = '';
    ui.txFilter = 'all';
    ui.selected = {};
    closeDialog($('reset-dialog'));
    $('import-result').hidden = true;
    showToast('All data was reset');
  });
}

/* ====================================================================
   Notifications (bell)
   ==================================================================== */
function alerts() {
  const d = data();
  const out = [];
  for (const r of state.budgetRows(d, new Date())) {
    const span = `this ${PERIOD_NOUN[r.period]}`;
    if (r.level === 'over') out.push({ icon: 'alert', title: `${r.cat.name} is over budget`, text: `${fmt(r.spent)} spent of ${fmt(r.limit)} ${span}.`, href: '#budgets' });
    else if (r.level === 'warn') out.push({ icon: r.cat.icon, title: `${r.cat.name} is at ${Math.floor(r.ratio * 100)}%`, text: `${fmt(r.limit - r.spent)} left ${span}.`, href: '#budgets' });
  }
  if (state.needsBackupReminder(d)) out.push({ icon: 'download', title: 'Back up your data', text: 'Export a CSV from Settings.', href: '#settings' });
  return out;
}

function renderBell() {
  const list = alerts();
  if (ui.alertCount !== null && list.length > ui.alertCount) replay($('bell-btn'), 'is-ringing');
  ui.alertCount = list.length;
  $('bell-dot').hidden = list.length === 0;
  $('bell-btn').setAttribute('aria-label', list.length ? `Notifications, ${list.length} new` : 'Notifications, none');
  $('notif-list').replaceChildren(...(list.length
    ? list.map((a) => h('li', {}, h('a', { class: 'tile', href: a.href, onclick: () => closeDialog($('notif-sheet')) },
      h('span', { class: 'tile-icon', 'aria-hidden': 'true' }, icon(a.icon)),
      h('span', { class: 'tile-main' }, h('span', { class: 'tile-title' }, a.title), h('span', { class: 'tile-sub' }, a.text)))))
    : [h('li', {}, emptyState({ iconName: 'check', title: "You're all caught up", text: 'Budget warnings and reminders will show up here.' }))]));
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
    if (er.amount) replay(form.querySelector('.amount-wrap'), 'is-shaking');
    if (er.category) replay($('tx-cat-grid'), 'is-shaking');
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

function renderAll(change) {
  // Flash the row that was just added, edited or restored.
  ui.highlightId = change && ['add', 'update', 'restore'].includes(change.type) ? change.tx.id : null;
  ui.highlightBudget = change && ['budget', 'budget-add'].includes(change.type) ? change.categoryId : null;
  renderNotice();
  renderHome();
  renderTransactions();
  renderBudgets();
  renderSettings();
  renderBell();
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
    renderOverview(true);
    replay($('overview-total'), 'is-swapping');
  });

  // "View details" links can pre-set the transactions filter.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-filter]');
    if (a) { ui.txFilter = a.dataset.filter; ui.txQuery = ''; renderTransactions(); }
  });
  wireTransactions();
  wireBudgets();
  wireSettings();
  $('bell-btn').addEventListener('click', () => openDialog($('notif-sheet')));

  $('fab').addEventListener('click', () => openTxSheet());
  wireSheet();
  wireToast();
  for (const id of ['confirm-dialog', 'reset-dialog', 'notif-sheet']) wireDialog($(id));
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
  document.querySelectorAll('.seg').forEach((seg) => initSegThumb(seg));
  wire();
  route();
  renderAll();
  window.addEventListener('resize', () => moveTabIndicator(false));
  document.fonts?.ready.then(() => moveTabIndicator(false));
  state.subscribe(renderAll);
  requestPersistence().then((granted) => { ui.persisted = granted; renderSettings(); });
  // Follow the system theme live when "System" is chosen.
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
  // Inter is wider than the fallback font: re-fit KPI numbers once it arrives.
  document.fonts?.ready.then(() => document.querySelectorAll('.kpi-value').forEach((el) => fitText(el)));
  registerServiceWorker();
  document.documentElement.dataset.ready = '1';
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const go = () => navigator.serviceWorker.register('sw.js').catch(() => { /* offline support unavailable */ });
  if (document.readyState === 'complete') go();
  else window.addEventListener('load', go, { once: true });
}

boot();
