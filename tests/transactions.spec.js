import { test, expect } from '@playwright/test';
import { freshPage, openScreen, readState } from './helpers.js';

const kpiValue = async (page, key) => Number(await page.locator(`[data-kpi="${key}"] .kpi-value`).getAttribute('data-value'));

async function swipeLeft(page, row) {
  const box = await row.boundingBox();
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width - 30, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width - 30 - i * 25, y);
  await page.mouse.up();
}

async function firstRowWith(page, text) {
  return page.locator('#tx-groups .swipe', { hasText: text }).first();
}

test.describe('transactions screen', () => {
  test('lists every transaction grouped by date, newest first', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'transactions');
    const s = await readState(page);
    await expect(page.locator('#tx-groups .swipe')).toHaveCount(s.transactions.length);
    const dates = await page.locator('.tx-group').evaluateAll((els) => els.map((e) => e.dataset.date));
    expect(dates).toEqual([...new Set(s.transactions.map((t) => t.date))].sort().reverse());
    await expect(page.locator('.tx-group-head').first()).toHaveText(/Today|Yesterday|\w{3}/);
  });

  test('search filters by note and category', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'transactions');
    await page.locator('#tx-search').fill('groceries');
    const rows = page.locator('#tx-groups .swipe');
    await expect(rows.first()).toBeVisible();
    for (const text of await rows.allTextContents()) expect(text.toLowerCase()).toContain('groceries');
    await expect(page.locator('#tx-count')).toHaveText(/\d+ results?/);
    await page.locator('#tx-search').fill('zzzz-nothing');
    await expect(page.locator('#tx-groups')).toContainText('No matches');
  });

  test('filter chips show only matching rows', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'transactions');
    await page.locator('.filter-chip[data-filter="income"]').click();
    await expect(page.locator('.filter-chip[data-filter="income"]')).toHaveAttribute('aria-pressed', 'true');
    const types = await page.locator('#tx-groups .tile').evaluateAll((els) => els.map((e) => e.dataset.type));
    expect(types.length).toBeGreaterThan(0);
    expect(new Set(types)).toEqual(new Set(['income']));
    await page.locator('.filter-chip[data-filter="cat:bills"]').click();
    for (const t of await page.locator('#tx-groups .tile-sub').allTextContents()) expect(t).toContain('Bills');
  });

  test('swiping left reveals Edit and Delete', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'transactions');
    const row = await firstRowWith(page, 'Coffee');
    await swipeLeft(page, row);
    await expect(row).toHaveClass(/is-open/);
    await expect(row.locator('.swipe-edit')).toBeVisible();
    await expect(row.locator('.swipe-delete')).toBeVisible();
    // the swipe must not open the editor
    await expect(page.locator('#tx-sheet')).not.toBeVisible();
  });

  test('editing a transaction updates KPIs immediately', async ({ page }) => {
    await freshPage(page);
    const balance = await kpiValue(page, 'balance');
    const expenses = await kpiValue(page, 'expenses');
    const foodBudget = Number(await page.locator('.budget-card[data-cat="food"]').getAttribute('data-spent'));
    await openScreen(page, 'transactions');
    const row = await firstRowWith(page, 'Coffee'); // 165.00, today
    await swipeLeft(page, row);
    await row.locator('.swipe-edit').click();
    await expect(page.locator('#sheet-title')).toHaveText('Edit transaction');
    await expect(page.locator('#tx-amount')).toHaveValue('165.00');
    await page.locator('#tx-amount').fill('200');
    await page.locator('#tx-save').click();
    await expect(page.locator('#toast')).toContainText('updated');
    await expect(page.locator('.budget-card[data-cat="food"]')).toHaveAttribute('data-spent', String(foodBudget + 3500));
    await openScreen(page, 'home');
    await expect(page.locator('[data-kpi="balance"] .kpi-value')).toHaveAttribute('data-value', String(balance - 3500));
    await expect(page.locator('[data-kpi="expenses"] .kpi-value')).toHaveAttribute('data-value', String(expenses + 3500));
    const s = await readState(page);
    expect(s.transactions.filter((t) => t.note === 'Coffee').map((t) => t.amountCents)).toEqual([20000]);
  });

  test('delete asks first, updates everything, and Undo restores it', async ({ page }) => {
    await freshPage(page);
    const balance = await kpiValue(page, 'balance');
    const overview = Number(await page.locator('#overview-total').getAttribute('data-cents'));
    const food = Number(await page.locator('#top-cats [data-cat="food"]').getAttribute('data-cents'));
    const count = (await readState(page)).transactions.length;

    await openScreen(page, 'transactions');
    const row = await firstRowWith(page, 'Coffee');
    await swipeLeft(page, row);
    await row.locator('.swipe-delete').click();
    await expect(page.locator('#confirm-dialog')).toBeVisible();
    await expect(page.locator('#confirm-text')).toContainText('Coffee');

    // Cancel keeps it
    await page.locator('#confirm-dialog button[value="cancel"]').click();
    await expect(page.locator('#confirm-dialog')).not.toBeVisible();
    expect((await readState(page)).transactions.length).toBe(count);

    await swipeLeft(page, row);
    await row.locator('.swipe-delete').click();
    await page.locator('#confirm-ok').click();
    await expect(page.locator('#toast')).toContainText('deleted');
    await expect(page.locator('#toast-action')).toHaveText('Undo');
    expect((await readState(page)).transactions.length).toBe(count - 1);
    await expect(page.locator('#tx-groups .swipe', { hasText: 'Coffee' })).toHaveCount(0);

    await expect(page.locator('.budget-card[data-cat="food"]')).toHaveAttribute('data-spent', String(food - 16500));
    await openScreen(page, 'home');
    await expect(page.locator('[data-kpi="balance"] .kpi-value')).toHaveAttribute('data-value', String(balance + 16500));
    await expect(page.locator('#overview-total')).toHaveAttribute('data-cents', String(overview - 16500));
    await expect(page.locator('#top-cats [data-cat="food"]')).toHaveAttribute('data-cents', String(food - 16500));

    await page.locator('#toast-action').click();
    await expect(page.locator('[data-kpi="balance"] .kpi-value')).toHaveAttribute('data-value', String(balance));
    expect((await readState(page)).transactions.length).toBe(count);
  });

  test('the Undo toast goes away after 5 seconds', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'transactions');
    const row = await firstRowWith(page, 'Coffee');
    await swipeLeft(page, row);
    await row.locator('.swipe-delete').click();
    await page.locator('#confirm-ok').click();
    await expect(page.locator('#toast')).toBeVisible();
    await page.waitForTimeout(4000);
    await expect(page.locator('#toast')).toBeVisible();
    await expect(page.locator('#toast')).toBeHidden({ timeout: 2500 });
  });

  test('filter chips slide sideways with mouse drag and wheel', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'transactions');
    const row = page.locator('#tx-filters');
    const scroll = () => row.evaluate((el) => el.scrollLeft);
    expect(await row.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    await expect(page.locator('#tx-filters-wrap')).toHaveClass(/can-right/);

    // Drag left with the mouse
    const box = await row.boundingBox();
    const y = box.y + box.height / 2;
    await page.mouse.move(box.x + box.width - 40, y);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) await page.mouse.move(box.x + box.width - 40 - i * 20, y);
    await page.mouse.up();
    expect(await scroll()).toBeGreaterThan(100);
    await expect(page.locator('#tx-filters-wrap')).toHaveClass(/can-left/);
    // The drag didn't select the chip under the pointer
    await expect(page.locator('.filter-chip[data-filter="all"]')).toHaveAttribute('aria-pressed', 'true');

    // Mouse wheel scrolls it too
    await row.evaluate((el) => { el.scrollLeft = 0; });
    await page.mouse.move(box.x + 100, y);
    await page.mouse.wheel(0, 200);
    await expect.poll(scroll).toBeGreaterThan(50);
  });

  test('choosing a chip off to the side slides it into view', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'transactions');
    await page.evaluate(() => { document.querySelector('.filter-chip[data-filter="cat:other"]').click(); });
    await expect(page.locator('.filter-chip[data-filter="cat:other"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.filter-chip[data-filter="cat:other"]')).toBeInViewport({ ratio: 1 });
  });

  test('keyboard users can reach Edit and Delete', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'transactions');
    const row = await firstRowWith(page, 'Coffee');
    await row.locator('.swipe-delete').focus();
    await expect(row).toHaveClass(/is-open/);
  });
});
