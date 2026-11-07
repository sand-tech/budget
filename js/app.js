// Controller: boot, routing, rendering of each screen, and event wiring.
import * as state from './state.js';
import { requestPersistence } from './storage.js';
import {
  money, moneyShort, percent, dayLabel, currencySymbol, centsToPlain, todayISO, fmtDate, parseAmount,
} from './format.js';
import {
  h, icon, hydrateIcons, trendChip, catTile, txTile, emptyState, fitText, countUp,
  openDialog, closeDialog, wireDialog, confirmAction, showToast, hideToast, wireToast, setFieldError,
  wireSwipe, closeOpenRows,
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
  $('home-subtitle').textContent = `Your money in ${k.period.long}`;
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
    list.replaceChildren(h('li', {}, emptyState({
      iconName: 'pie',
      title: 'No spending yet this month',
      text: 'Your top categories will show up here.',
    })));
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
   Transactions
   ==================================================================== */
function txFilters() {
  return [
    { id: 'all', label: 'All' },
    { id: 'income', label: 'Income', icon: 'trendUp' },
    { id: 'expense', label: 'Expense', icon: 'trendDown' },
    ...data().categories.map((c) => ({ id: `cat:${c.id}`, label: c.name, icon: c.icon })),
  ];
}

function renderTransactions() {
  const d = data();
  const today = new Date();

  const chips = $('tx-filters');
  if (!chips.childElementCount) {
    chips.replaceChildren(...txFilters().map((f) => h('button', {
      type: 'button', class: 'filter-chip', dataset: { filter: f.id }, 'aria-pressed': 'false',
    }, f.icon ? icon(f.icon) : null, f.label)));
  }
  chips.querySelectorAll('.filter-chip').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.filter === ui.txFilter)));

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
  return h('div', { class: 'swipe', dataset: { id: tx.id } },
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

function wireTransactions() {
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

function renderBudgets() {
  const d = data();
  const period = state.periodAt('month', new Date(), d.settings.startDay);
  $('budgets-period').textContent = `${period.long} · Resets on ${fmtDate(period.endDate, { month: 'short', day: 'numeric' })}`;
  const rows = state.categoryStats(d, period)
    .filter((r) => r.limit)
    .map((r) => ({ ...r, ...state.budgetLevel(r.spent, r.limit) }))
    .sort((a, b) => b.ratio - a.ratio || a.cat.name.localeCompare(b.cat.name));

  const totalLimit = rows.reduce((s, r) => s + r.limit, 0);
  const totalSpent = rows.reduce((s, r) => s + r.spent, 0);
  const left = totalLimit - totalSpent;
  const overCount = rows.filter((r) => r.level === 'over').length;
  $('budget-summary').replaceChildren(
    h('div', { class: 'bs-row' },
      h('div', {}, h('p', { class: 'bs-label' }, 'Spent'), h('p', { class: 'bs-value', dataset: { cents: String(totalSpent) } }, fmt(totalSpent))),
      h('div', {}, h('p', { class: 'bs-label' }, 'Budget'), h('p', { class: 'bs-value' }, fmt(totalLimit))),
      h('div', {}, h('p', { class: 'bs-label' }, left < 0 ? 'Over by' : 'Left'), h('p', { class: 'bs-value' }, fmt(Math.abs(left))))),
    progressBar('All budgets used', totalSpent, totalLimit),
    h('p', { class: 'hint' }, overCount
      ? `${overCount} categor${overCount === 1 ? 'y is' : 'ies are'} over budget.`
      : 'Tap "Edit limit" on any card to change its monthly budget.'),
  );

  $('budget-list').replaceChildren(...rows.map((r) => {
    const remaining = r.limit - r.spent;
    return h('article', { class: 'card budget-card', dataset: { cat: r.cat.id, level: r.level, spent: String(r.spent), remaining: String(remaining) }, 'aria-labelledby': `bc-${r.cat.id}` },
      h('div', { class: 'bc-head' },
        catTile(r.cat),
        h('div', { class: 'bc-title' },
          h('h2', { class: 'bc-name', id: `bc-${r.cat.id}` }, r.cat.name),
          h('p', { class: 'bc-sub' }, `${r.count} transaction${r.count === 1 ? '' : 's'} this month`)),
        levelChip(r.level, r.ratio)),
      progressBar(`${r.cat.name} budget used`, r.spent, r.limit),
      h('dl', { class: 'bc-amounts' },
        h('div', {}, h('dt', {}, 'Limit'), h('dd', {}, fmt(r.limit))),
        h('div', {}, h('dt', {}, 'Spent'), h('dd', {}, fmt(r.spent))),
        h('div', {}, h('dt', {}, remaining < 0 ? 'Over by' : 'Remaining'),
          h('dd', { class: remaining < 0 ? 'is-over' : '' }, fmt(Math.abs(remaining))))),
      h('div', { class: 'bc-foot' },
        h('p', { class: 'hint' }, `${Math.round(r.ratio * 100)}% used`),
        h('button', { type: 'button', class: 'btn btn-secondary bc-edit', 'aria-label': `Edit ${r.cat.name} limit`, onclick: () => openBudgetDialog(r.cat) },
          icon('pencil'), 'Edit limit')));
  }));
}

let budgetCat = null;
function openBudgetDialog(cat) {
  budgetCat = cat;
  $('budget-dialog-title').textContent = `${cat.name} budget`;
  $('budget-currency').textContent = currencySymbol(currency());
  $('budget-input').value = centsToPlain(data().budgets[cat.id] ?? 0);
  setFieldError($('budget-input-error'), '', $('budget-input'));
  openDialog($('budget-dialog'));
  $('budget-input').select();
}

function wireBudgets() {
  $('budget-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const r = parseAmount($('budget-input').value);
    if (!r.ok) {
      setFieldError($('budget-input-error'), r.error, $('budget-input'));
      $('budget-input').focus();
      return;
    }
    state.setBudget(budgetCat.id, r.cents);
    closeDialog($('budget-dialog'));
    showToast(`${budgetCat.name} budget updated`);
  });
  $('budget-input').addEventListener('input', () => setFieldError($('budget-input-error'), '', $('budget-input')));
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
    if (b) state.updateSettings({ theme: b.dataset.themeValue });
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
  const period = state.periodAt('month', new Date(), d.settings.startDay);
  const out = [];
  for (const r of state.categoryStats(d, period)) {
    if (!r.limit) continue;
    const { level, ratio } = state.budgetLevel(r.spent, r.limit);
    if (level === 'over') out.push({ icon: 'alert', title: `${r.cat.name} is over budget`, text: `${fmt(r.spent)} spent of ${fmt(r.limit)}.`, href: '#budgets' });
    else if (level === 'warn') out.push({ icon: r.cat.icon, title: `${r.cat.name} is at ${Math.floor(ratio * 100)}%`, text: `${fmt(r.limit - r.spent)} left this month.`, href: '#budgets' });
  }
  if (state.needsBackupReminder(d)) out.push({ icon: 'download', title: 'Back up your data', text: 'Export a CSV from Settings.', href: '#settings' });
  return out;
}

function renderBell() {
  const list = alerts();
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
    renderOverview();
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
