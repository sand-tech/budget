import { test, expect } from '@playwright/test';
import { freshPage, readState, STORAGE_KEY } from './helpers.js';

test.describe('data layer', () => {
  test('parseAmount accepts valid input and rejects invalid input', async ({ page }) => {
    await freshPage(page);
    const r = await page.evaluate(async () => {
      const { parseAmount } = await import('/js/format.js');
      const cases = ['250', '99.5', '99.50', '1,250.75', '.5', '0.01', '  12 ', '0', '-5', 'abc', '1.234', '1,25', '1e5', '', '12.3.4', '9999999999'];
      return Object.fromEntries(cases.map((c) => [c, parseAmount(c)]));
    });
    expect(r['250']).toEqual({ ok: true, cents: 25000 });
    expect(r['99.5']).toEqual({ ok: true, cents: 9950 });
    expect(r['99.50']).toEqual({ ok: true, cents: 9950 });
    expect(r['1,250.75']).toEqual({ ok: true, cents: 125075 });
    expect(r['.5']).toEqual({ ok: true, cents: 50 });
    expect(r['0.01']).toEqual({ ok: true, cents: 1 });
    expect(r['  12 ']).toEqual({ ok: true, cents: 1200 });
    for (const bad of ['0', '-5', 'abc', '1.234', '1,25', '1e5', '', '12.3.4', '9999999999']) {
      expect(r[bad].ok, bad).toBe(false);
      expect(r[bad].error.length, bad).toBeGreaterThan(0);
    }
    expect(r['1.234'].error).toMatch(/2 decimal/);
    expect(r['0'].error).toMatch(/greater than 0/);
  });

  test('CSV parser handles quotes, commas and newlines', async ({ page }) => {
    await freshPage(page);
    const rows = await page.evaluate(async () => {
      const { parseCSV } = await import('/js/format.js');
      return parseCSV('﻿a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\r\n\r\nlast,,\n');
    });
    expect(rows).toEqual([
      { line: 1, cells: ['a', 'b', 'c'] },
      { line: 2, cells: ['x, y', 'he said "hi"', 'line1\nline2'] },
      { line: 5, cells: ['last', '', ''] },
    ]);
  });

  test('first launch seeds about 30 sample transactions over 3 months', async ({ page }) => {
    await freshPage(page);
    const s = await readState(page);
    expect(s.schemaVersion).toBe(1);
    expect(s.settings.currency).toBe('PHP');
    expect(s.transactions.length).toBeGreaterThanOrEqual(25);
    expect(s.transactions.length).toBeLessThanOrEqual(35);
    expect(s.transactions.every((t) => t.sample === true)).toBe(true);
    expect(s.transactions.every((t) => Number.isInteger(t.amountCents))).toBe(true);
    const dates = s.transactions.map((t) => t.date).sort();
    const spanDays = (new Date(dates.at(-1)) - new Date(dates[0])) / 86_400_000;
    expect(spanDays).toBeGreaterThan(60);
    expect(spanDays).toBeLessThanOrEqual(92);
  });

  test('sample data is not re-seeded after the user clears it', async ({ page }) => {
    await freshPage(page);
    await page.evaluate(async () => {
      const state = await import('/js/state.js');
      state.clearSample();
    });
    await page.reload();
    expect((await readState(page)).transactions).toEqual([]);
  });

  test('unreadable saved data is backed up and the app starts fresh with a notice', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((key) => { localStorage.clear(); localStorage.setItem(key, '{not json'); }, STORAGE_KEY);
    await page.reload();
    await expect(page.locator('#storage-notice')).toBeVisible();
    await expect(page.locator('#storage-notice')).toContainText("couldn't be read");
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.some((k) => k.startsWith('budget.v1.unreadable-'))).toBe(true);
    const s = await readState(page);
    expect(s.schemaVersion).toBe(1);
    expect(s.transactions).toEqual([]);
  });

  test('invalid stored transactions are dropped during load', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((key) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify({
        schemaVersion: 1,
        settings: { name: 'Ana', currency: 'PHP', startDay: 1, theme: 'system' },
        transactions: [
          { id: 'ok-1', type: 'expense', amountCents: 1000, categoryId: 'food', date: '2026-01-05', note: 'fine', createdAt: 1 },
          { id: 'bad-amount', type: 'expense', amountCents: 10.5, categoryId: 'food', date: '2026-01-05', note: '' },
          { id: 'bad-cat', type: 'expense', amountCents: 100, categoryId: 'nope', date: '2026-01-05', note: '' },
          { id: 'bad-date', type: 'expense', amountCents: 100, categoryId: 'food', date: '2026-02-31', note: '' },
          { id: 'salary-expense', type: 'expense', amountCents: 100, categoryId: 'salary', date: '2026-01-05', note: '' },
        ],
      }));
    }, STORAGE_KEY);
    await page.reload();
    const s = await readState(page);
    expect(s.transactions.map((t) => t.id)).toEqual(['ok-1']);
    expect(s.settings.name).toBe('Ana');
  });

  test('keeps working in memory when storage throws, and says so', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException('blocked', 'SecurityError'); };
    });
    await page.goto('/');
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await expect(page.locator('#storage-notice')).toBeVisible();
    await expect(page.locator('#storage-notice')).toContainText(/lost when you close/);
    const added = await page.evaluate(async () => {
      const state = await import('/js/state.js');
      const r = state.addTx({ type: 'expense', amount: '12.50', categoryId: 'food', date: '2026-01-02', note: 'mem' });
      return r.ok && state.getData().transactions.some((t) => t.note === 'mem');
    });
    expect(added).toBe(true);
  });
});
