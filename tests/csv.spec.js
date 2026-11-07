import { test, expect } from '@playwright/test';
import fs from 'node:fs/promises';
import { freshPage, openScreen, readState } from './helpers.js';

const HEADER = 'id,date,type,category,amount,note';
const pick = (txs) => txs
  .map(({ id, date, type, categoryId, amountCents, note }) => ({ id, date, type, categoryId, amountCents, note }))
  .sort((a, b) => a.id.localeCompare(b.id));

async function exportFile(page) {
  await openScreen(page, 'settings');
  const wait = page.waitForEvent('download');
  await page.locator('#export-btn').click();
  const download = await wait;
  expect(download.suggestedFilename()).toMatch(/^budget-\d{4}-\d{2}-\d{2}\.csv$/);
  return fs.readFile(await download.path(), 'utf8');
}

async function importText(page, text, name = 'import.csv') {
  await openScreen(page, 'settings');
  await page.locator('#import-input').setInputFiles({ name, mimeType: 'text/csv', buffer: Buffer.from(text, 'utf8') });
  await expect(page.locator('#import-result')).toBeVisible();
}

async function resetAll(page) {
  await openScreen(page, 'settings');
  await page.locator('#reset-btn').click();
  await page.locator('#reset-input').fill('RESET');
  await page.locator('#reset-confirm').click();
  await expect(page.locator('#reset-dialog')).not.toBeVisible();
}

async function addViaState(page, input) {
  await page.evaluate(async (inp) => {
    const state = await import('/js/state.js');
    const r = state.addTx(inp);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
  }, input);
}

test.describe('CSV export and import', () => {
  test('export then import restores identical data', async ({ page }) => {
    await freshPage(page);
    await addViaState(page, { type: 'expense', amount: '1234.56', categoryId: 'shopping', date: '2026-03-04', note: 'Comma, "quotes" and\nnew line' });
    await addViaState(page, { type: 'income', amount: '0.01', categoryId: 'other', date: '2025-12-31', note: 'Café ₱ ünïcödé' });
    const original = pick((await readState(page)).transactions);

    const csv = await exportFile(page);
    expect(csv.replace(/^﻿/, '').split('\r\n')[0]).toBe(HEADER);

    await resetAll(page);
    expect((await readState(page)).transactions).toEqual([]);

    await importText(page, csv);
    await expect(page.locator('#import-result')).toContainText(`Added ${original.length} transactions`);
    await expect(page.locator('#import-result ul[data-kind="bad"]')).toHaveCount(0);
    expect(pick((await readState(page)).transactions)).toEqual(original);
  });

  test('formula-like cells are escaped on export and restored exactly on import', async ({ page }) => {
    await freshPage(page, { seed: false });
    const notes = ['=SUM(A1)', '-5 lunch', '+63 load', '@cmd', "'=already quoted", "'plain quote", 'normal'];
    for (const [i, note] of notes.entries()) {
      await addViaState(page, { type: 'expense', amount: String(i + 1), categoryId: 'food', date: '2026-01-0' + (i + 1), note });
    }
    const csv = await exportFile(page);
    expect(csv).toContain(",'=SUM(A1)");
    expect(csv).toContain(",'-5 lunch");
    expect(csv).toContain(",'+63 load");
    expect(csv).toContain(",'@cmd");
    expect(csv).toContain(",''=already quoted");
    expect(csv).toContain(",'plain quote");
    expect(csv).not.toMatch(/,=SUM/);
    // No cell starts with a formula character
    for (const line of csv.replace(/^﻿/, '').trim().split('\r\n')) {
      for (const cell of line.split(',')) expect(cell).not.toMatch(/^[=+\-@]/);
    }
    await resetAll(page);
    await importText(page, csv);
    const back = (await readState(page)).transactions.map((t) => t.note).sort();
    expect(back).toEqual([...notes].sort());
  });

  test('importing the same file twice adds nothing the second time', async ({ page }) => {
    await freshPage(page);
    const count = (await readState(page)).transactions.length;
    const csv = await exportFile(page);
    await importText(page, csv);
    await expect(page.locator('#import-result')).toContainText('Added 0 transactions');
    await expect(page.locator('#import-result')).toContainText(`Skipped ${count} rows`);
    await expect(page.locator('#import-result ul[data-kind="skipped"] li').first()).toContainText('Already in your data');
    expect((await readState(page)).transactions.length).toBe(count);
  });

  test('rows without an id are added as new', async ({ page }) => {
    await freshPage(page, { seed: false });
    const csv = [HEADER, ',2026-02-01,expense,Food,100,No id one', ',2026-02-01,expense,Food,100,No id one', 'abc-1,2026-02-02,income,Salary,5000,'].join('\n');
    await importText(page, csv);
    await expect(page.locator('#import-result')).toContainText('Added 3 transactions');
    const s = await readState(page);
    expect(s.transactions).toHaveLength(3);
    expect(new Set(s.transactions.map((t) => t.id)).size).toBe(3);
    expect(s.transactions.find((t) => t.id === 'abc-1').categoryId).toBe('salary');
  });

  test('every invalid row is rejected with its line number and reason', async ({ page }) => {
    await freshPage(page, { seed: false });
    const csv = [
      HEADER,
      'ok-1,2026-02-01,expense,Food,99.50,Good row',
      'b-1,2026-02-30,expense,Food,10,Bad date',
      'b-2,2026-02-01,spend,Food,10,Bad type',
      'b-3,2026-02-01,expense,Pets,10,Unknown category',
      'b-4,2026-02-01,expense,Food,10.999,Too many decimals',
      'b-5,2026-02-01,expense,Food,-4,Negative',
      'b-6,2026-02-01,expense,Salary,10,Wrong kind',
      'b-7,2026-02-01,expense,Food,10,note,extra',
      'bad id!,2026-02-01,expense,Food,10,Bad id',
      'ok-2,2026-02-02,income,Salary,"25,000.00",Good with thousands',
    ].join('\r\n');
    await importText(page, csv);
    const result = page.locator('#import-result');
    await expect(result).toContainText('Added 2 transactions');
    await expect(result).toContainText('Rejected 8 rows');
    const items = await page.locator('#import-result ul[data-kind="bad"] li').allTextContents();
    expect(items).toEqual([
      expect.stringMatching(/^Line 3: Date "2026-02-30"/),
      expect.stringMatching(/^Line 4: Type "spend"/),
      expect.stringMatching(/^Line 5: Unknown category "Pets"/),
      expect.stringMatching(/^Line 6: Amount "10.999": .*2 decimal/),
      expect.stringMatching(/^Line 7: Amount "-4": .*greater than 0/),
      expect.stringMatching(/^Line 8: Salary can't be used for expense/),
      expect.stringMatching(/^Line 9: Expected 6 columns, found 7/),
      expect.stringMatching(/^Line 10: Invalid id/),
    ]);
    expect(pick((await readState(page)).transactions).map((t) => t.id)).toEqual(['ok-1', 'ok-2']);
  });

  test('a file with the wrong header is refused', async ({ page }) => {
    await freshPage(page, { seed: false });
    await importText(page, 'date,amount\n2026-01-01,5\n');
    await expect(page.locator('#import-result')).toContainText('Nothing was imported');
    await expect(page.locator('#import-result')).toContainText('first row must be the header');
  });

  test('files over 1 MB are rejected before reading', async ({ page }) => {
    await freshPage(page, { seed: false });
    const big = HEADER + '\n' + 'x'.repeat(1024 * 1024 + 10);
    await importText(page, big, 'big.csv');
    await expect(page.locator('#import-result')).toContainText('The limit is 1 MB');
    expect((await readState(page)).transactions).toEqual([]);
  });
});

test.describe('untrusted text is never rendered as HTML', () => {
  const PAYLOAD = '<img src=x onerror="window.__xss=1">';

  test('name and notes show as literal text', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'settings');
    await page.locator('#set-name').fill(PAYLOAD.slice(0, 30));
    await page.locator('#set-name').press('Enter');
    await addViaState(page, { type: 'expense', amount: '1', categoryId: 'food', date: '2026-01-01', note: PAYLOAD });
    await openScreen(page, 'home');
    await expect(page.locator('#greet-name')).toHaveText(PAYLOAD.slice(0, 30));
    await openScreen(page, 'transactions');
    await page.locator('#tx-search').fill('<img');
    await expect(page.locator('#tx-groups')).toContainText(PAYLOAD);
    await page.locator('#tx-search').fill('<b>nothing</b>');
    await expect(page.locator('#tx-groups')).toContainText('Nothing matches "<b>nothing</b>"');
    expect(await page.locator('img').count()).toBe(0);
    expect(await page.locator('b', { hasText: /^nothing$/ }).count()).toBe(0);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });

  test('imported notes and rejection reasons show as literal text', async ({ page }) => {
    await freshPage(page, { seed: false });
    const csv = [
      HEADER,
      `x-1,2026-01-01,expense,Food,5,"${PAYLOAD.replace(/"/g, '""')}"`,
      `x-2,2026-01-01,expense,<script>alert(1)</script>,5,bad`,
      `x-3,<img src=x onerror=window.__xss=2>,expense,Food,5,bad`,
    ].join('\n');
    await importText(page, csv);
    await expect(page.locator('#import-result')).toContainText('Added 1 transaction');
    await expect(page.locator('#import-result')).toContainText('Unknown category "<script>alert(1)</script>"');
    await expect(page.locator('#import-result')).toContainText('<img src=x');
    await openScreen(page, 'transactions');
    await expect(page.locator('#tx-groups')).toContainText(PAYLOAD);
    expect(await page.locator('main img, main script').count()).toBe(0);
    await page.waitForTimeout(200);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});
