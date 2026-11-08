// App state: schema, defaults, sample data, mutations and read-only selectors.
import * as storage from './storage.js';
import {
  parseAmount, isValidISO, toISO, addDays, fmtDate, centsToPlain,
  NOTE_MAX, MAX_CENTS, CSV_COLUMNS, parseCSV, unescapeFormula, toCSV,
} from './format.js';

export const SCHEMA_VERSION = 2;
export const CURRENCIES = ['PHP', 'USD', 'EUR', 'GBP', 'SGD', 'AUD', 'CAD', 'HKD', 'INR'];
export const THEMES = ['system', 'light', 'dark'];
export const NAME_MAX = 30;
export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const MAX_IMPORT_ROWS = 10_000;
export const BACKUP_REMINDER_DAYS = 30;

/** Budgets: each tracked category has a limit that resets weekly or monthly. */
export const BUDGET_PERIODS = ['week', 'month'];
export const CATEGORY_NAME_MAX = 24;
export const MAX_CATEGORIES = 40;
/** Icons offered when creating a budget (names from ui.js). */
export const BUDGET_ICONS = [
  'tag', 'home', 'food', 'coffee', 'shopping', 'bills', 'transport', 'car',
  'health', 'dumbbell', 'entertainment', 'music', 'phone', 'school', 'book', 'plane',
  'gift', 'paw', 'savings', 'star', 'other',
];

/** kind: which transaction types may use the category. */
export const DEFAULT_CATEGORIES = [
  { id: 'food', name: 'Food', icon: 'food', kind: 'expense' },
  { id: 'transport', name: 'Transport', icon: 'transport', kind: 'expense' },
  { id: 'bills', name: 'Bills', icon: 'bills', kind: 'expense' },
  { id: 'shopping', name: 'Shopping', icon: 'shopping', kind: 'expense' },
  { id: 'health', name: 'Health', icon: 'health', kind: 'expense' },
  { id: 'entertainment', name: 'Entertainment', icon: 'entertainment', kind: 'expense' },
  { id: 'savings', name: 'Savings', icon: 'savings', kind: 'both' },
  { id: 'salary', name: 'Salary', icon: 'salary', kind: 'income' },
  { id: 'other', name: 'Other', icon: 'other', kind: 'both' },
];

/** Starting monthly limits in cents (users can change, remove or add their own). */
export const DEFAULT_LIMITS = {
  food: 900_000,
  transport: 300_000,
  bills: 650_000,
  shopping: 400_000,
  health: 200_000,
  entertainment: 150_000,
  savings: 1_000_000,
  other: 200_000,
};

export const DEFAULT_SETTINGS = {
  name: 'Friend',
  currency: 'PHP',
  startDay: 1,
  theme: 'system',
  lastExportAt: null,
};

// [daysAgo, type, category, amount in pesos, note]
const SAMPLE = [
  [0, 'expense', 'food', 165, 'Coffee'],
  [1, 'expense', 'food', 2850, 'Groceries'],
  [2, 'income', 'salary', 25000, 'Salary'],
  [2, 'expense', 'transport', 245, 'Grab ride'],
  [3, 'expense', 'savings', 5000, 'Transfer to savings'],
  [4, 'expense', 'food', 289, 'Lunch with team'],
  [5, 'expense', 'bills', 3240, 'Electricity'],
  [6, 'expense', 'shopping', 2499, 'Running shoes'],
  [8, 'expense', 'entertainment', 549, 'Netflix'],
  [9, 'expense', 'transport', 500, 'Beep card load'],
  [11, 'expense', 'health', 540, 'Pharmacy'],
  [12, 'expense', 'bills', 1699, 'Internet'],
  [16, 'expense', 'food', 3120, 'Groceries'],
  [17, 'income', 'salary', 25000, 'Salary'],
  [22, 'expense', 'food', 1450, 'Dinner with friends'],
  [25, 'income', 'other', 8500, 'Freelance project'],
  [27, 'expense', 'entertainment', 700, 'Movie tickets'],
  [30, 'expense', 'transport', 1800, 'Gas'],
  [32, 'income', 'salary', 25000, 'Salary'],
  [33, 'expense', 'savings', 5000, 'Transfer to savings'],
  [35, 'expense', 'bills', 2980, 'Electricity'],
  [38, 'expense', 'food', 2640, 'Groceries'],
  [40, 'expense', 'shopping', 860, 'Online order'],
  [42, 'expense', 'bills', 1699, 'Internet'],
  [47, 'income', 'salary', 25000, 'Salary'],
  [55, 'expense', 'health', 1500, 'Dental checkup'],
  [60, 'expense', 'food', 2980, 'Groceries'],
  [62, 'income', 'salary', 25000, 'Salary'],
  [63, 'expense', 'savings', 5000, 'Transfer to savings'],
  [66, 'expense', 'transport', 500, 'Beep card load'],
  [77, 'income', 'salary', 25000, 'Salary'],
];

/* ====================================================================
   Construction and migration
   ==================================================================== */

export function newId() {
  const bytes = new Uint8Array(9);
  crypto.getRandomValues(bytes);
  return `t_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export function sampleTransactions(today = new Date()) {
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12).getTime();
  return SAMPLE.map(([ago, type, categoryId, pesos, note], i) => ({
    id: `sample-${String(i + 1).padStart(2, '0')}`,
    type,
    amountCents: pesos * 100,
    categoryId,
    date: toISO(addDays(today, -ago)),
    note,
    sample: true,
    createdAt: base - ago * 86_400_000 + i,
  }));
}

export function newCategoryId() {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return `c_${[...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

export const defaultBudgets = () => Object.fromEntries(
  Object.entries(DEFAULT_LIMITS).map(([id, limit]) => [id, { limit, period: 'month' }]),
);

export function freshState({ seed = false, today = new Date() } = {}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: { ...DEFAULT_SETTINGS },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    budgets: defaultBudgets(),
    transactions: seed ? sampleTransactions(today) : [],
  };
}

// Upgrades, keyed by the version they upgrade FROM.
const MIGRATIONS = {
  // v1 stored a plain monthly limit per category; v2 stores { limit, period }.
  1: (d) => ({
    ...d,
    schemaVersion: 2,
    budgets: Object.fromEntries(Object.entries(d.budgets && typeof d.budgets === 'object' ? d.budgets : DEFAULT_LIMITS)
      .map(([id, v]) => [id, { limit: v, period: 'month' }])),
  }),
};

/** Tidy a user-typed category name: trim, collapse spaces, drop control characters. */
export function cleanCategoryName(name) {
  return String(name ?? '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
}

function cleanCategory(c) {
  if (!c || typeof c !== 'object' || typeof c.id !== 'string' || !ID_RE.test(c.id)) return null;
  const name = cleanCategoryName(c.name);
  if (!name || name.length > CATEGORY_NAME_MAX) return null;
  if (!['expense', 'income', 'both'].includes(c.kind)) return null;
  const builtIn = DEFAULT_CATEGORIES.find((x) => x.id === c.id);
  const icon = typeof c.icon === 'string' && (BUDGET_ICONS.includes(c.icon) || c.icon === builtIn?.icon) ? c.icon : 'tag';
  const out = { id: c.id, name, icon, kind: builtIn ? builtIn.kind : c.kind };
  if (!builtIn) out.custom = true;
  return out;
}

function cleanBudget(b) {
  if (!b || typeof b !== 'object') return null;
  if (!Number.isSafeInteger(b.limit) || b.limit <= 0 || b.limit > MAX_CENTS) return null;
  return { limit: b.limit, period: BUDGET_PERIODS.includes(b.period) ? b.period : 'month' };
}

function cleanSettings(s = {}) {
  const out = { ...DEFAULT_SETTINGS };
  if (typeof s.name === 'string' && s.name.trim()) out.name = s.name.trim().slice(0, NAME_MAX);
  if (CURRENCIES.includes(s.currency)) out.currency = s.currency;
  if (Number.isInteger(s.startDay) && s.startDay >= 1 && s.startDay <= 28) out.startDay = s.startDay;
  if (THEMES.includes(s.theme)) out.theme = s.theme;
  if (Number.isFinite(s.lastExportAt)) out.lastExportAt = s.lastExportAt;
  return out;
}

function cleanTx(t, categories) {
  if (!t || typeof t !== 'object') return null;
  if (typeof t.id !== 'string' || !ID_RE.test(t.id)) return null;
  if (t.type !== 'income' && t.type !== 'expense') return null;
  if (!Number.isSafeInteger(t.amountCents) || t.amountCents <= 0 || t.amountCents > MAX_CENTS) return null;
  const cat = categories.find((c) => c.id === t.categoryId);
  if (!cat || !kindAllows(cat, t.type)) return null;
  if (!isValidISO(t.date)) return null;
  const tx = {
    id: t.id,
    type: t.type,
    amountCents: t.amountCents,
    categoryId: t.categoryId,
    date: t.date,
    note: typeof t.note === 'string' ? t.note.slice(0, NOTE_MAX) : '',
    createdAt: Number.isFinite(t.createdAt) ? t.createdAt : 0,
  };
  if (t.sample === true) tx.sample = true;
  return tx;
}

/** Bring stored data up to the current schema. Returns null if it can't be understood. */
export function migrate(raw) {
  if (!raw || typeof raw !== 'object' || !Number.isInteger(raw.schemaVersion)) return null;
  if (raw.schemaVersion > SCHEMA_VERSION || raw.schemaVersion < 1) return null;
  let d = raw;
  while (d.schemaVersion < SCHEMA_VERSION) {
    const step = MIGRATIONS[d.schemaVersion];
    if (!step) return null;
    d = step(d);
  }
  // Keep the user's categories (renamed built-ins, custom budgets) and make
  // sure every built-in still exists.
  const categories = [];
  const names = new Set();
  for (const raw of Array.isArray(d.categories) ? d.categories : []) {
    const c = cleanCategory(raw);
    if (!c || categories.some((x) => x.id === c.id) || names.has(c.name.toLowerCase())) continue;
    if (categories.length >= MAX_CATEGORIES) break;
    categories.push(c);
    names.add(c.name.toLowerCase());
  }
  for (const def of DEFAULT_CATEGORIES) {
    if (categories.some((c) => c.id === def.id)) continue;
    const c = { ...def };
    if (names.has(c.name.toLowerCase())) c.name = `${c.name} (built-in)`;
    categories.push(c);
    names.add(c.name.toLowerCase());
  }
  const budgets = {};
  const rawBudgets = d.budgets && typeof d.budgets === 'object' ? d.budgets : defaultBudgets();
  for (const c of categories) {
    if (c.kind === 'income') continue;
    const b = cleanBudget(rawBudgets[c.id]);
    if (b) budgets[c.id] = b;
  }
  const seen = new Set();
  const transactions = [];
  for (const t of Array.isArray(d.transactions) ? d.transactions : []) {
    const tx = cleanTx(t, categories);
    if (tx && !seen.has(tx.id)) { seen.add(tx.id); transactions.push(tx); }
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: cleanSettings(d.settings),
    categories,
    budgets,
    transactions,
  };
}

/* ====================================================================
   Store
   ==================================================================== */

let data = freshState();
let loadProblem = null;
const listeners = new Set();

export function init({ today = new Date() } = {}) {
  const { value, problem } = storage.load();
  loadProblem = problem;
  let d = value ? migrate(value) : null;
  if (value && !d) {
    // Unknown shape or newer version: keep a copy before starting over.
    storage.backup('unrecognized', value);
    loadProblem = 'corrupt';
  }
  if (!d) {
    const firstLaunch = !value && problem !== 'corrupt';
    const noSeed = storage.readFlag('budget.test.noSeed') === '1';
    d = freshState({ seed: firstLaunch && !noSeed, today });
  }
  data = d;
  storage.save(data);
  return data;
}

export const getData = () => data;

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function commit(change) {
  storage.save(data);
  for (const fn of listeners) fn(change);
}

/** null when fine, otherwise 'unavailable' | 'full' | 'corrupt'. */
export function storageProblem() {
  const s = storage.status();
  if (!s.ok) return s.problem || 'unavailable';
  return loadProblem === 'corrupt' ? 'corrupt' : null;
}

/* ---------------- Lookups ---------------- */

export const getCategory = (id, d = data) => d.categories.find((c) => c.id === id);
export const kindAllows = (cat, type) => cat.kind === 'both' || cat.kind === type;
/** Categories in display order: built-ins and your own, with "Other" last. */
export const orderedCategories = (d = data) => [
  ...d.categories.filter((c) => c.id !== 'other'),
  ...d.categories.filter((c) => c.id === 'other'),
];
export const categoriesFor = (type, d = data) => orderedCategories(d).filter((c) => kindAllows(c, type));
export const budgetCategories = (d = data) => orderedCategories(d).filter((c) => c.kind !== 'income');
export const isBuiltIn = (cat) => DEFAULT_CATEGORIES.some((x) => x.id === cat.id);
export const hasSample = (d = data) => d.transactions.some((t) => t.sample);

/* ---------------- Validation ---------------- */

/**
 * Validate form input. input: { type, amount (string), categoryId, date, note }
 * @returns {{ok:true, value} | {ok:false, errors:{amount?, category?, date?, note?, type?}}}
 */
export function validateTx(input, d = data) {
  const errors = {};
  const type = input.type;
  if (type !== 'income' && type !== 'expense') errors.type = 'Choose Expense or Income.';
  const amt = parseAmount(input.amount);
  if (!amt.ok) errors.amount = amt.error;
  const cat = input.categoryId ? getCategory(input.categoryId, d) : null;
  if (!cat) errors.category = 'Choose a category.';
  else if (!errors.type && !kindAllows(cat, type)) errors.category = `${cat.name} can't be used for ${type}.`;
  if (!isValidISO(input.date)) errors.date = 'Choose a valid date.';
  const note = String(input.note ?? '').trim();
  if (note.length > NOTE_MAX) errors.note = `Keep the note under ${NOTE_MAX} characters.`;
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { type, amountCents: amt.cents, categoryId: cat.id, date: input.date, note } };
}

/* ---------------- Mutations ---------------- */

export function addTx(input) {
  const v = validateTx(input);
  if (!v.ok) return v;
  const tx = { id: newId(), ...v.value, createdAt: Date.now() };
  data.transactions.push(tx);
  commit({ type: 'add', tx });
  return { ok: true, tx };
}

export function updateTx(id, input) {
  const idx = data.transactions.findIndex((t) => t.id === id);
  if (idx < 0) return { ok: false, errors: { amount: 'This transaction no longer exists.' } };
  const v = validateTx(input);
  if (!v.ok) return v;
  const old = data.transactions[idx];
  const tx = { id: old.id, ...v.value, createdAt: old.createdAt };
  data.transactions[idx] = tx;
  commit({ type: 'update', tx });
  return { ok: true, tx };
}

/** Returns a token that restoreTx() accepts for Undo. */
export function deleteTx(id) {
  const idx = data.transactions.findIndex((t) => t.id === id);
  if (idx < 0) return null;
  const [tx] = data.transactions.splice(idx, 1);
  commit({ type: 'delete', tx });
  return { tx, index: idx };
}

export function restoreTx(token) {
  if (!token || data.transactions.some((t) => t.id === token.tx.id)) return false;
  data.transactions.splice(Math.min(token.index, data.transactions.length), 0, token.tx);
  commit({ type: 'restore', tx: token.tx });
  return true;
}

export function updateSettings(patch) {
  const next = cleanSettings({ ...data.settings, ...patch });
  data.settings = next;
  commit({ type: 'settings' });
  return next;
}

/**
 * Validate a budget form. input: { categoryId?, name, icon, limit (string), period }
 * Leave categoryId empty to create a new budget (and its category).
 */
export function validateBudget(input, d = data) {
  const errors = {};
  const existing = input.categoryId ? getCategory(input.categoryId, d) : null;
  if (input.categoryId && (!existing || existing.kind === 'income')) errors.name = 'This budget no longer exists.';
  const name = cleanCategoryName(input.name);
  if (!name) errors.name = 'Give your budget a name.';
  else if (name.length > CATEGORY_NAME_MAX) errors.name = `Keep the name under ${CATEGORY_NAME_MAX} characters.`;
  else if (d.categories.some((c) => c.id !== existing?.id && c.name.toLowerCase() === name.toLowerCase())) {
    errors.name = `You already have a category called "${name}".`;
  }
  if (!existing && d.categories.length >= MAX_CATEGORIES) errors.name = `You can have up to ${MAX_CATEGORIES} categories.`;
  const builtInIcon = existing && DEFAULT_CATEGORIES.find((x) => x.id === existing.id)?.icon;
  if (!BUDGET_ICONS.includes(input.icon) && input.icon !== builtInIcon) errors.icon = 'Choose an icon.';
  const amt = parseAmount(input.limit);
  if (!amt.ok) errors.limit = amt.error;
  if (!BUDGET_PERIODS.includes(input.period)) errors.period = 'Choose weekly or monthly.';
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { existing, name, icon: input.icon, limit: amt.cents, period: input.period } };
}

/** Create or update a budget. New budgets become expense categories you can pick when adding transactions. */
export function saveBudget(input) {
  const v = validateBudget(input);
  if (!v.ok) return v;
  const { existing, name, icon, limit, period } = v.value;
  let category = existing;
  if (category) {
    category.name = name;
    category.icon = icon;
  } else {
    category = { id: newCategoryId(), name, icon, kind: 'expense', custom: true };
    data.categories.push(category);
  }
  data.budgets[category.id] = { limit, period };
  commit({ type: existing ? 'budget' : 'budget-add', categoryId: category.id });
  return { ok: true, category, created: !existing };
}

/** Stop tracking a limit; the category itself stays. */
export function removeBudget(categoryId) {
  if (!data.budgets[categoryId]) return false;
  delete data.budgets[categoryId];
  commit({ type: 'budget' });
  return true;
}

/** Delete one of your own categories. Its transactions move to "Other". Returns how many moved. */
export function deleteCategory(categoryId) {
  const cat = getCategory(categoryId);
  if (!cat || isBuiltIn(cat)) return null;
  let moved = 0;
  for (const t of data.transactions) {
    if (t.categoryId === categoryId) { t.categoryId = 'other'; moved++; }
  }
  data.categories = data.categories.filter((c) => c.id !== categoryId);
  delete data.budgets[categoryId];
  commit({ type: 'category-delete', categoryId });
  return moved;
}

export const transactionCount = (categoryId, d = data) => d.transactions.filter((t) => t.categoryId === categoryId).length;

export function clearSample() {
  const before = data.transactions.length;
  data.transactions = data.transactions.filter((t) => !t.sample);
  const removed = before - data.transactions.length;
  commit({ type: 'clear-sample' });
  return removed;
}

export function resetAll() {
  data = freshState({ seed: false });
  commit({ type: 'reset' });
}

export function markExported(when = Date.now()) {
  data.settings.lastExportAt = when;
  commit({ type: 'settings' });
}

/* ====================================================================
   Selectors (pure: take data and dates, return numbers)
   ==================================================================== */

export const PERIOD_COUNT = { week: 12, month: 12, year: 5 };

/** The period of `mode` that contains `date`. Strings are ISO; end is exclusive. */
export function periodAt(mode, date, startDay = 1) {
  let start;
  let end;
  if (mode === 'week') {
    const dow = (date.getDay() + 6) % 7; // Monday = 0
    start = addDays(date, -dow);
    end = addDays(start, 7);
  } else if (mode === 'year') {
    start = new Date(date.getFullYear(), 0, 1);
    end = new Date(date.getFullYear() + 1, 0, 1);
  } else {
    let y = date.getFullYear();
    let m = date.getMonth();
    if (date.getDate() < startDay) m -= 1;
    start = new Date(y, m, startDay);
    end = new Date(y, m + 1, startDay);
  }
  return decorate(mode, start, end, startDay);
}

export function shiftPeriod(mode, period, n, startDay = 1) {
  const s = period.startDate;
  if (mode === 'week') return periodAt(mode, addDays(s, 7 * n), startDay);
  if (mode === 'year') return periodAt(mode, new Date(s.getFullYear() + n, 0, 1), startDay);
  return periodAt(mode, new Date(s.getFullYear(), s.getMonth() + n, s.getDate()), startDay);
}

function decorate(mode, start, end, startDay) {
  const last = addDays(end, -1);
  let short;
  let long;
  if (mode === 'week') {
    short = fmtDate(start, { month: 'numeric', day: 'numeric' });
    long = `Week of ${fmtDate(start, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  } else if (mode === 'year') {
    short = String(start.getFullYear());
    long = short;
  } else {
    short = fmtDate(start, { month: 'short' });
    long = startDay === 1
      ? fmtDate(start, { month: 'long', year: 'numeric' })
      : `${fmtDate(start, { month: 'short', day: 'numeric' })} – ${fmtDate(last, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }
  return { mode, start: toISO(start), end: toISO(end), startDate: start, endDate: end, short, long };
}

/** Sums for transactions with start <= date < end. */
export function totals(txs, start = '0000-00-00', end = '9999-99-99') {
  let income = 0;
  let expense = 0;
  let saved = 0;
  let count = 0;
  for (const t of txs) {
    if (t.date < start || t.date >= end) continue;
    count++;
    if (t.type === 'income') income += t.amountCents;
    else {
      expense += t.amountCents;
      if (t.categoryId === 'savings') saved += t.amountCents;
    }
  }
  return { income, expense, saved, count };
}

/**
 * Share of income not spent. Money moved to the Savings category counts as saved, not spent.
 * null when there's no income.
 */
export function savingsRate(t) {
  if (t.income <= 0) return null;
  return (t.income - (t.expense - t.saved)) / t.income;
}

/** Relative change, or null when there is nothing to compare against. */
export function change(cur, prev) {
  if (prev === null || cur === null || prev === undefined) return null;
  if (prev === 0) return cur === 0 ? 0 : null;
  return (cur - prev) / Math.abs(prev);
}

export function kpis(d = data, today = new Date()) {
  const s = d.settings.startDay;
  const cur = periodAt('month', today, s);
  const prev = shiftPeriod('month', cur, -1, s);
  const tx = d.transactions;
  const all = totals(tx);
  const before = totals(tx, '0000-00-00', cur.start);
  const c = totals(tx, cur.start, cur.end);
  const p = totals(tx, prev.start, prev.end);
  const rate = savingsRate(c);
  const ratePrev = savingsRate(p);
  return {
    period: cur,
    prevPeriod: prev,
    balance: all.income - all.expense,
    balanceChange: change(all.income - all.expense, before.income - before.expense),
    income: c.income,
    incomeChange: change(c.income, p.income),
    expense: c.expense,
    expenseChange: change(c.expense, p.expense),
    rate,
    rateDelta: rate !== null && ratePrev !== null ? rate - ratePrev : null,
  };
}

/** Last N periods (oldest first) with income/expense sums. */
export function series(d = data, mode = 'month', today = new Date()) {
  const s = d.settings.startDay;
  const n = PERIOD_COUNT[mode];
  const current = periodAt(mode, today, s);
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = shiftPeriod(mode, current, -i, s);
    out.push({ ...p, income: 0, expense: 0 });
  }
  const first = out[0].start;
  const last = out[out.length - 1].end;
  for (const t of d.transactions) {
    if (t.date < first || t.date >= last) continue;
    const b = out.find((p) => t.date >= p.start && t.date < p.end);
    if (!b) continue;
    if (t.type === 'income') b.income += t.amountCents;
    else b.expense += t.amountCents;
  }
  return out;
}

/** Spending per non-income category within a period, highest first. */
export function categoryStats(d = data, period) {
  const rows = budgetCategories(d).map((cat) => ({ cat, spent: 0, count: 0 }));
  for (const t of d.transactions) {
    if (t.type !== 'expense' || t.date < period.start || t.date >= period.end) continue;
    const r = rows.find((x) => x.cat.id === t.categoryId);
    if (r) { r.spent += t.amountCents; r.count++; }
  }
  return rows.sort((a, b) => b.spent - a.spent || a.cat.name.localeCompare(b.cat.name));
}

/** Budget state for a category row. */
export function budgetLevel(spent, limit) {
  if (!limit) return { ratio: 0, level: 'none' };
  const ratio = spent / limit;
  return { ratio, level: ratio > 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok' };
}

/**
 * One row per tracked budget, each measured over its own period
 * (this week from Monday, or this month from the month start day).
 */
export function budgetRows(d = data, today = new Date()) {
  const rows = [];
  for (const cat of budgetCategories(d)) {
    const b = d.budgets[cat.id];
    if (!b) continue;
    const period = periodAt(b.period, today, d.settings.startDay);
    let spent = 0;
    let count = 0;
    for (const t of d.transactions) {
      if (t.type === 'expense' && t.categoryId === cat.id && t.date >= period.start && t.date < period.end) {
        spent += t.amountCents;
        count++;
      }
    }
    rows.push({ cat, limit: b.limit, period: b.period, range: period, spent, count, ...budgetLevel(spent, b.limit) });
  }
  return rows;
}

/** Non-income categories that don't have a budget right now. */
export const untrackedCategories = (d = data) => budgetCategories(d).filter((c) => !d.budgets[c.id]);

/** Newest first. */
export function sortedTx(txs) {
  return [...txs].sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : a.date < b.date ? 1 : -1));
}

/** filter: 'all' | 'income' | 'expense' | 'cat:<id>' */
export function filterTx(d = data, { query = '', filter = 'all' } = {}) {
  const q = query.trim().toLowerCase();
  return sortedTx(d.transactions).filter((t) => {
    if (filter === 'income' || filter === 'expense') { if (t.type !== filter) return false; }
    else if (filter.startsWith('cat:') && t.categoryId !== filter.slice(4)) return false;
    if (!q) return true;
    const cat = getCategory(t.categoryId, d);
    return (
      t.note.toLowerCase().includes(q) ||
      (cat && cat.name.toLowerCase().includes(q)) ||
      centsToPlain(t.amountCents).includes(q)
    );
  });
}

export function needsBackupReminder(d = data, now = Date.now()) {
  if (!d.transactions.some((t) => !t.sample)) return false;
  const last = d.settings.lastExportAt;
  return !last || now - last > BACKUP_REMINDER_DAYS * 86_400_000;
}

/* ====================================================================
   CSV export / import
   ==================================================================== */

export function exportCSV(d = data) {
  const rows = [...d.transactions]
    .sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1))
    .map((t) => [t.id, t.date, t.type, getCategory(t.categoryId, d)?.name ?? t.categoryId, centsToPlain(t.amountCents), t.note]);
  return toCSV(rows);
}

const clip = (s, n = 40) => (s.length > n ? `${s.slice(0, n)}…` : s);

/**
 * Validate every row, then add the valid ones in a single save.
 * @returns {{ fatal?: string, added: number, rejected: {line, reason}[], skipped: {line, reason}[] }}
 */
export function importCSV(text) {
  const result = { added: 0, rejected: [], skipped: [] };
  const rows = parseCSV(text);
  if (!rows.length) return { ...result, fatal: 'The file is empty.' };
  const header = rows[0].cells.map((c) => c.trim().toLowerCase());
  if (header.join(',') !== CSV_COLUMNS.join(',')) {
    return { ...result, fatal: `The first row must be the header: ${CSV_COLUMNS.join(',')}` };
  }
  if (rows.length - 1 > MAX_IMPORT_ROWS) {
    return { ...result, fatal: `Too many rows. The limit is ${MAX_IMPORT_ROWS.toLocaleString()}.` };
  }
  const existing = new Set(data.transactions.map((t) => t.id));
  const seen = new Set();
  const toAdd = [];
  const now = Date.now();

  for (const row of rows.slice(1)) {
    const reject = (reason) => result.rejected.push({ line: row.line, reason });
    if (row.error) { reject(row.error); continue; }
    if (row.cells.length !== 6 && row.cells.length !== 5) {
      reject(`Expected 6 columns, found ${row.cells.length}.`);
      continue;
    }
    const [idRaw, dateRaw, typeRaw, catRaw, amountRaw, noteRaw = ''] = row.cells.map(unescapeFormula);
    const id = idRaw.trim();
    const date = dateRaw.trim();
    const type = typeRaw.trim().toLowerCase();
    const catKey = catRaw.trim().toLowerCase();
    const note = noteRaw.trim();

    if (id && !ID_RE.test(id)) { reject('Invalid id. Use letters, numbers, - or _ (up to 64).'); continue; }
    if (!isValidISO(date)) { reject(`Date "${clip(date)}" is not valid. Use YYYY-MM-DD, like 2026-11-07.`); continue; }
    if (type !== 'income' && type !== 'expense') { reject(`Type "${clip(typeRaw.trim())}" must be income or expense.`); continue; }
    const cat = data.categories.find((c) => c.id === catKey || c.name.toLowerCase() === catKey);
    if (!cat) { reject(`Unknown category "${clip(catRaw.trim())}".`); continue; }
    if (!kindAllows(cat, type)) { reject(`${cat.name} can't be used for ${type}.`); continue; }
    const amt = parseAmount(amountRaw);
    if (!amt.ok) { reject(`Amount "${clip(amountRaw.trim())}": ${amt.error}`); continue; }
    if (note.length > NOTE_MAX) { reject(`Note is longer than ${NOTE_MAX} characters.`); continue; }
    if (id && existing.has(id)) { result.skipped.push({ line: row.line, reason: 'Already in your data (same id).' }); continue; }
    if (id && seen.has(id)) { result.skipped.push({ line: row.line, reason: 'Duplicate id earlier in this file.' }); continue; }

    const finalId = id || newId();
    seen.add(finalId);
    toAdd.push({
      id: finalId, type, amountCents: amt.cents, categoryId: cat.id, date, note,
      createdAt: now + toAdd.length,
    });
  }

  if (toAdd.length) {
    data.transactions.push(...toAdd);
    commit({ type: 'import', count: toAdd.length });
  }
  result.added = toAdd.length;
  return result;
}
