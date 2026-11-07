import { test, expect } from '@playwright/test';
import { freshPage, openScreen } from './helpers.js';

const card = (page, cat) => page.locator(`.budget-card[data-cat="${cat}"]`);
const spent = async (page, cat) => Number(await card(page, cat).getAttribute('data-spent'));

async function addExpense(page, amount, category, note = '') {
  await page.locator('#fab').click();
  await page.locator('#tx-amount').fill(amount);
  await page.locator('.cat-option', { hasText: category }).click();
  if (note) await page.locator('#tx-note').fill(note);
  await page.locator('#tx-save').click();
  await expect(page.locator('#tx-sheet')).not.toBeVisible();
}

async function setLimit(page, cat, value) {
  await card(page, cat).locator('.bc-edit').click();
  await expect(page.locator('#budget-dialog')).toBeVisible();
  await page.locator('#budget-input').fill(value);
  await page.locator('#budget-form button[type="submit"]').click();
}

test.describe('budgets screen', () => {
  test('shows a card per category with limit, spent, remaining and a progress bar', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'budgets');
    await expect(page.locator('.budget-card')).toHaveCount(8);
    const food = card(page, 'food');
    await expect(food.locator('dt')).toHaveText(['Limit', 'Spent', /Remaining|Over by/]);
    await expect(food.locator('[role="progressbar"]')).toBeVisible();
  });

  test('adding an expense updates the category budget immediately', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'budgets');
    const before = await spent(page, 'transport');
    await addExpense(page, '75.25', 'Transport');
    await expect(card(page, 'transport')).toHaveAttribute('data-spent', String(before + 7525));
  });

  test('warning chip at 80% and "Over budget" chip above 100%', async ({ page }) => {
    await freshPage(page, { seed: false });
    await openScreen(page, 'budgets');
    await setLimit(page, 'health', '100');
    await expect(page.locator('#toast')).toContainText('budget updated');
    await expect(card(page, 'health')).toHaveAttribute('data-level', 'ok');

    await addExpense(page, '79', 'Health');
    await expect(card(page, 'health')).toHaveAttribute('data-level', 'ok');
    await expect(card(page, 'health').locator('.chip')).toHaveCount(0);

    await addExpense(page, '1', 'Health');
    await expect(card(page, 'health')).toHaveAttribute('data-level', 'warn');
    await expect(card(page, 'health').locator('.chip-warn')).toHaveText(/80% used/);

    await addExpense(page, '20', 'Health'); // exactly 100%: still a warning
    await expect(card(page, 'health').locator('.chip-warn')).toHaveText(/100% used/);

    await addExpense(page, '0.01', 'Health');
    await expect(card(page, 'health')).toHaveAttribute('data-level', 'over');
    await expect(card(page, 'health').locator('.chip-over')).toHaveText(/Over budget/);
    await expect(card(page, 'health').locator('dt').nth(2)).toHaveText('Over by');

    // The bell shows the alert too
    await openScreen(page, 'home');
    await expect(page.locator('#bell-dot')).toBeVisible();
    await expect(page.locator('#bell-btn')).toHaveAttribute('aria-label', /Notifications, \d+ new/);
    await page.locator('#bell-btn').click();
    await expect(page.locator('#notif-list')).toContainText('Health is over budget');
  });

  test('rejects an invalid limit', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'budgets');
    await setLimit(page, 'food', '0');
    await expect(page.locator('#budget-input-error')).toHaveText(/greater than 0/);
    await expect(page.locator('#budget-dialog')).toBeVisible();
  });
});
