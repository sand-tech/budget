// Money, dates and CSV. Money is always integer cents; no float math on stored values.

export const MAX_CENTS = 99_999_999_999; // 999,999,999.99
export const NOTE_MAX = 120;

/* ---------------- Amounts ---------------- */

/**
 * Parse a user-typed amount into integer cents.
 * Accepts "250", "99.5", "1,250.75". Rejects negatives, more than 2 decimals,
 * letters, exponents, and badly placed thousands separators.
 * @returns {{ok:true, cents:number} | {ok:false, error:string}}
 */
export function parseAmount(input) {
  const raw = String(input ?? '').trim().replace(/\s+/g, '');
  if (raw === '') return { ok: false, error: 'Enter an amount.' };
  if (/^[-−]/.test(raw)) return { ok: false, error: 'Amount must be greater than 0.' };
  if (!/^[\d.,]+$/.test(raw)) return { ok: false, error: 'Use numbers only, like 250 or 99.50.' };
  if (raw.includes(',') && !/^\d{1,3}(,\d{3})+(\.\d*)?$/.test(raw)) {
    return { ok: false, error: 'Use a dot for decimals, like 99.50.' };
  }
  const s = raw.replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(s) || s === '.') return { ok: false, error: 'Use numbers only, like 250 or 99.50.' };
  const [whole = '', frac = ''] = s.split('.');
  if (frac.length > 2) return { ok: false, error: 'Use at most 2 decimal places.' };
  const wholeDigits = whole.replace(/^0+(?=\d)/, '');
  if (wholeDigits.length > 9) return { ok: false, error: 'That amount is too large.' };
  const cents = Number(wholeDigits || '0') * 100 + Number((frac + '00').slice(0, 2));
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) return { ok: false, error: 'That amount is too large.' };
  if (cents <= 0) return { ok: false, error: 'Amount must be greater than 0.' };
  return { ok: true, cents };
}

/** 125050 -> "1250.50" (plain, for inputs and CSV). */
export function centsToPlain(cents) {
  const c = Math.abs(Math.trunc(cents));
  return `${cents < 0 ? '-' : ''}${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
}

const fmtCache = new Map();
function getFormatter(currency, opts) {
  const key = `${currency}|${opts.compact}|${opts.whole}|${opts.sign}`;
  let f = fmtCache.get(key);
  if (!f) {
    const base = { style: 'currency', currency, signDisplay: opts.sign ? 'exceptZero' : 'auto' };
    if (opts.compact) Object.assign(base, { notation: 'compact', maximumFractionDigits: 1 });
    else if (opts.whole) Object.assign(base, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
    else Object.assign(base, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    try {
      f = new Intl.NumberFormat(undefined, base);
    } catch {
      f = new Intl.NumberFormat(undefined, { ...base, currency: 'PHP' });
    }
    fmtCache.set(key, f);
  }
  return f;
}

/** Format cents as currency. opts: { compact, whole, sign } */
export function money(cents, currency = 'PHP', opts = {}) {
  return getFormatter(currency, opts).format(cents / 100);
}

/** Short display for tight spaces: whole units, compact once it gets long. */
export function moneyShort(cents, currency = 'PHP') {
  const whole = money(cents, currency, { whole: true });
  return whole.replace(/[^\d]/g, '').length > 6 ? money(cents, currency, { compact: true }) : whole;
}

export function currencySymbol(currency = 'PHP') {
  try {
    const part = new Intl.NumberFormat(undefined, { style: 'currency', currency })
      .formatToParts(0).find((p) => p.type === 'currency');
    return part ? part.value : currency;
  } catch {
    return currency;
  }
}

export function percent(value, digits = 1) {
  return `${(value * 100).toFixed(digits).replace(/\.0$/, '')}%`;
}

/* ---------------- Dates (local time, ISO yyyy-mm-dd strings) ---------------- */

const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());

export function parseISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidISO(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  if (y < 1900 || y > 2999) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function addDays(date, n) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  return d;
}

const dfCache = new Map();
export function fmtDate(date, opts) {
  const key = JSON.stringify(opts);
  let f = dfCache.get(key);
  if (!f) { f = new Intl.DateTimeFormat(undefined, opts); dfCache.set(key, f); }
  return f.format(date);
}

/** "Today", "Yesterday", or "Mon, Nov 3" (adds the year when it isn't this year). */
export function dayLabel(iso, today = new Date()) {
  const d = parseISO(iso);
  const t = toISO(today);
  if (iso === t) return 'Today';
  if (iso === toISO(addDays(today, -1))) return 'Yesterday';
  const opts = { weekday: 'short', month: 'short', day: 'numeric' };
  if (d.getFullYear() !== today.getFullYear()) opts.year = 'numeric';
  return fmtDate(d, opts);
}

/* ---------------- CSV ---------------- */

export const CSV_COLUMNS = ['id', 'date', 'type', 'category', 'amount', 'note'];

// Spreadsheet apps run cells that start with these as formulas.
const FORMULA_START = /^'*[=+\-@\t\r]/;
const ESCAPED_FORMULA = /^'+[=+\-@\t\r]/;

/** Prefix risky cells with a quote. Cells that already look escaped get one more, so import can undo it exactly. */
export function escapeFormula(value) {
  const s = String(value ?? '');
  return FORMULA_START.test(s) ? `'${s}` : s;
}

/** Reverse of escapeFormula: remove exactly one leading quote from an escaped cell. */
export function unescapeFormula(value) {
  return ESCAPED_FORMULA.test(value) ? value.slice(1) : value;
}

function quoteCell(s) {
  return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** rows: arrays of cell values (without header). Returns CSV text with CRLF line endings. */
export function toCSV(rows) {
  return [CSV_COLUMNS, ...rows]
    .map((row) => row.map((cell) => quoteCell(escapeFormula(cell))).join(','))
    .join('\r\n') + '\r\n';
}

/**
 * RFC 4180 style parser. Returns [{ line, cells, error? }], skipping blank lines.
 * `line` is the 1-based line where the record starts.
 */
export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let rowLine = 1;

  const endRow = () => {
    row.push(field);
    if (!(row.length === 1 && row[0].trim() === '')) rows.push({ line: rowLine, cells: row });
    row = [];
    field = '';
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else inQuotes = false;
      } else {
        if (ch === '\n') line++;
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field === '') { inQuotes = true; continue; }
    if (ch === ',') { row.push(field); field = ''; continue; }
    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
      continue;
    }
    field += ch;
  }
  if (inQuotes) {
    row.push(field);
    rows.push({ line: rowLine, cells: row, error: 'A quoted value is never closed.' });
  } else if (field !== '' || row.length) {
    endRow();
  }
  return rows;
}
