import { test, expect } from '@playwright/test';
import { freshPage, readState } from './helpers.js';

const kpi = (page, key) => page.locator(`[data-kpi="${key}"] .kpi-value`);
const kpiValue = async (page, key) => Number(await kpi(page, key).getAttribute('data-value'));
const foodCents = async (page) => Number(await page.locator('#top-cats [data-cat="food"]').getAttribute('data-cents'));

test.describe('add transaction sheet', () => {
  test('FAB opens a sheet with today as the default date', async ({ page }) => {
    await freshPage(page);
    await page.locator('#fab').click();
    await expect(page.locator('#tx-sheet')).toBeVisible();
    await expect(page.locator('#tx-amount')).toHaveAttribute('inputmode', 'decimal');
    const today = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await expect(page.locator('#tx-date')).toHaveValue(today);
    await expect(page.locator('input[name="type"][value="expense"]')).toBeChecked();
    // Income hides expense-only categories
    await page.locator('.seg-radio', { hasText: 'Income' }).click();
    await expect(page.locator('#tx-cat-grid input[value="salary"]')).toHaveCount(1);
    await expect(page.locator('#tx-cat-grid input[value="food"]')).toHaveCount(0);
  });

  test('adding an expense updates KPIs, chart and categories immediately', async ({ page }) => {
    await freshPage(page);
    const balance = await kpiValue(page, 'balance');
    const expenses = await kpiValue(page, 'expenses');
    const overview = Number(await page.locator('#overview-total').getAttribute('data-cents'));
    const food = await foodCents(page);

    await page.locator('#fab').click();
    await page.locator('#tx-amount').fill('123.45');
    await page.locator('.cat-option', { hasText: 'Food' }).click();
    await page.locator('#tx-note').fill('Test lunch');
    await page.locator('#tx-save').click();

    await expect(page.locator('#tx-sheet')).not.toBeVisible();
    await expect(page.locator('#toast')).toContainText('Transaction added');
    await expect(kpi(page, 'balance')).toHaveAttribute('data-value', String(balance - 12345));
    await expect(kpi(page, 'expenses')).toHaveAttribute('data-value', String(expenses + 12345));
    await expect(page.locator('#overview-total')).toHaveAttribute('data-cents', String(overview + 12345));
    await expect.poll(() => foodCents(page)).toBe(food + 12345);
    await expect(page.locator('#recent-list .tile').first()).toContainText('Test lunch');

    const s = await readState(page);
    const tx = s.transactions.find((t) => t.note === 'Test lunch');
    expect(tx).toMatchObject({ type: 'expense', amountCents: 12345, categoryId: 'food' });
  });

  test('adding income raises balance and income', async ({ page }) => {
    await freshPage(page);
    const balance = await kpiValue(page, 'balance');
    const income = await kpiValue(page, 'income');
    await page.locator('#fab').click();
    await page.locator('.seg-radio', { hasText: 'Income' }).click();
    await page.locator('#tx-amount').fill('1,000');
    await page.locator('.cat-option', { hasText: 'Salary' }).click();
    await page.locator('#tx-save').click();
    await expect(kpi(page, 'balance')).toHaveAttribute('data-value', String(balance + 100000));
    await expect(kpi(page, 'income')).toHaveAttribute('data-value', String(income + 100000));
  });

  for (const [value, message] of [
    ['', /Enter an amount/],
    ['0', /greater than 0/],
    ['-5', /greater than 0/],
    ['12.345', /2 decimal/],
    ['abc', /numbers only/],
    ['1,5', /dot for decimals/],
  ]) {
    test(`rejects amount "${value}" with a visible error`, async ({ page }) => {
      await freshPage(page);
      const before = (await readState(page)).transactions.length;
      await page.locator('#fab').click();
      await page.locator('#tx-amount').fill(value);
      await page.locator('.cat-option', { hasText: 'Food' }).click();
      await page.locator('#tx-save').click();
      await expect(page.locator('#tx-amount-error')).toBeVisible();
      await expect(page.locator('#tx-amount-error')).toHaveText(message);
      await expect(page.locator('#tx-amount')).toHaveAttribute('aria-invalid', 'true');
      await expect(page.locator('#tx-sheet')).toBeVisible();
      expect((await readState(page)).transactions.length).toBe(before);
    });
  }

  test('requires a category', async ({ page }) => {
    await freshPage(page);
    await page.locator('#fab').click();
    await page.locator('#tx-amount').fill('50');
    await page.locator('#tx-save').click();
    await expect(page.locator('#tx-category-error')).toHaveText(/Choose a category/);
    await expect(page.locator('#tx-sheet')).toBeVisible();
  });

  test('Escape closes the sheet without saving', async ({ page }) => {
    await freshPage(page);
    const before = (await readState(page)).transactions.length;
    await page.locator('#fab').click();
    await page.locator('#tx-amount').fill('50');
    await page.keyboard.press('Escape');
    await expect(page.locator('#tx-sheet')).not.toBeVisible();
    expect((await readState(page)).transactions.length).toBe(before);
  });
});
