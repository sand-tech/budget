import { test, expect } from '@playwright/test';
import { freshPage, openScreen, readState } from './helpers.js';

const card = (page, cat) => page.locator(`.budget-card[data-cat="${cat}"]`);
const cardByName = (page, name) => page.locator('.budget-card', { has: page.locator('.bc-name', { hasText: new RegExp(`^${name}$`) }) });
const spent = async (page, cat) => Number(await card(page, cat).getAttribute('data-spent'));

async function addExpense(page, amount, category, { note = '', date } = {}) {
  await page.locator('#fab').click();
  await page.locator('#tx-amount').fill(amount);
  await page.locator('.cat-option', { hasText: new RegExp(`^${category}$`) }).click();
  if (note) await page.locator('#tx-note').fill(note);
  if (date) await page.locator('#tx-date').fill(date);
  await page.locator('#tx-save').click();
  await expect(page.locator('#tx-sheet')).not.toBeVisible();
}

async function setLimit(page, cat, value) {
  await card(page, cat).locator('.bc-edit').click();
  await expect(page.locator('#budget-sheet')).toBeVisible();
  await page.locator('#budget-input').fill(value);
  await page.locator('#budget-save').click();
}

async function createBudget(page, { name, icon = 'dumbbell', limit, period = 'month' }) {
  await openScreen(page, 'budgets');
  await page.locator('#new-budget-btn').click();
  await expect(page.locator('#budget-sheet')).toBeVisible();
  await expect(page.locator('#budget-sheet-title')).toHaveText('New budget');
  await page.locator('#budget-name').fill(name);
  await page.locator(`#budget-icon-grid input[value="${icon}"]`).check();
  await page.locator('#budget-input').fill(limit);
  await page.locator(`#budget-form .seg-radio:has(input[value="${period}"])`).click();
  await page.locator('#budget-save').click();
}

const isoDaysAgo = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

test.describe('budgets screen', () => {
  test('shows a card per budget with limit, spent, remaining and a progress bar', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'budgets');
    await expect(page.locator('.budget-card')).toHaveCount(8);
    const food = card(page, 'food');
    await expect(food.locator('dt')).toHaveText(['Limit', 'Spent', /Remaining|Over by/]);
    await expect(food.locator('[role="progressbar"]')).toBeVisible();
    await expect(food).toHaveAttribute('data-period', 'month');
    await expect(food.locator('.bc-sub')).toContainText('Monthly');
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
    await expect(page.locator('#budget-sheet')).toBeVisible();
  });
});

test.describe('custom budgets', () => {
  test('create your own budget and use it for transactions', async ({ page }) => {
    await freshPage(page);
    await createBudget(page, { name: 'Gym', icon: 'dumbbell', limit: '1,500', period: 'month' });
    await expect(page.locator('#budget-sheet')).not.toBeVisible();
    await expect(page.locator('#toast')).toContainText('Gym budget created');

    const gym = cardByName(page, 'Gym');
    await expect(gym).toBeVisible();
    await expect(gym.locator('dd').first()).toHaveText(/1,500\.00/);
    await expect(gym).toHaveAttribute('data-spent', '0');

    // It's a category you can pick when adding a transaction
    await addExpense(page, '250', 'Gym', { note: 'Monthly pass' });
    await expect(gym).toHaveAttribute('data-spent', '25000');

    // ...and filter by on the Transactions screen
    await openScreen(page, 'transactions');
    const chip = page.locator('.filter-chip', { hasText: /^Gym$/ });
    await expect(chip).toHaveCount(1);
    await chip.click();
    await expect(page.locator('#tx-groups .swipe')).toHaveCount(1);
    await expect(page.locator('#tx-groups')).toContainText('Monthly pass');

    // Survives a reload
    await page.reload();
    await openScreen(page, 'budgets');
    await expect(cardByName(page, 'Gym')).toHaveAttribute('data-spent', '25000');
    const s = await readState(page);
    const cat = s.categories.find((c) => c.name === 'Gym');
    expect(cat).toMatchObject({ icon: 'dumbbell', kind: 'expense', custom: true });
    expect(s.budgets[cat.id]).toEqual({ limit: 150000, period: 'month' });
  });

  test('a weekly budget only counts spending since Monday', async ({ page }) => {
    await freshPage(page, { seed: false });
    await createBudget(page, { name: 'Coffee', icon: 'coffee', limit: '500', period: 'week' });
    const coffee = cardByName(page, 'Coffee');
    await expect(coffee).toHaveAttribute('data-period', 'week');
    await expect(coffee.locator('.bc-sub')).toContainText('Weekly');
    await expect(coffee.locator('.bc-foot')).toContainText(/Resets \w{3}/);

    await addExpense(page, '120', 'Coffee');
    await addExpense(page, '300', 'Coffee', { date: isoDaysAgo(8) }); // last week: not counted
    await expect(coffee).toHaveAttribute('data-spent', '12000');
    await expect(page.locator('.bs-block[data-period="week"]')).toContainText('This week');
  });

  test('budget names must be filled in and unique', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'budgets');
    await page.locator('#new-budget-btn').click();
    await page.locator('#budget-input').fill('100');
    await page.locator('#budget-save').click();
    await expect(page.locator('#budget-name-error')).toHaveText(/Give your budget a name/);

    await page.locator('#budget-name').fill('  food ');
    await page.locator('#budget-save').click();
    await expect(page.locator('#budget-name-error')).toHaveText(/already have a category called "food"/);
    await expect(page.locator('#budget-sheet')).toBeVisible();
    expect((await readState(page)).categories).toHaveLength(9);
  });

  test('edit a budget: rename, new icon, weekly', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'budgets');
    await card(page, 'food').locator('.bc-edit').click();
    await expect(page.locator('#budget-sheet-title')).toHaveText('Edit Food');
    await expect(page.locator('#budget-name')).toHaveValue('Food');
    await expect(page.locator('#budget-remove')).toHaveText('Stop tracking');
    await page.locator('#budget-name').fill('Groceries');
    await page.locator('#budget-icon-grid input[value="shopping"]').check();
    await page.locator('#budget-form .seg-radio:has(input[value="week"])').click();
    await page.locator('#budget-input').fill('2500');
    await page.locator('#budget-save').click();

    await expect(card(page, 'food').locator('.bc-name')).toHaveText('Groceries');
    await expect(card(page, 'food')).toHaveAttribute('data-period', 'week');
    const s = await readState(page);
    expect(s.categories.find((c) => c.id === 'food')).toMatchObject({ name: 'Groceries', icon: 'shopping' });
    expect(s.budgets.food).toEqual({ limit: 250000, period: 'week' });
    // Existing transactions keep their category under the new name
    await openScreen(page, 'transactions');
    await expect(page.locator('#tx-groups .swipe', { hasText: 'Coffee' }).locator('.tile-sub')).toHaveText('Groceries');
  });

  test('stop tracking a built-in budget, undo, and add the limit back', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'budgets');
    await card(page, 'health').locator('.bc-edit').click();
    await page.locator('#budget-remove').click();
    await expect(card(page, 'health')).toHaveCount(0);
    await expect(page.locator('#untracked')).toBeVisible();
    await expect(page.locator('#untracked-list')).toContainText('Health');

    await page.locator('#toast-action').click(); // Undo
    await expect(card(page, 'health')).toHaveCount(1);
    await expect(page.locator('#untracked')).toBeHidden();

    await card(page, 'health').locator('.bc-edit').click();
    await page.locator('#budget-remove').click();
    await page.locator('#untracked-list button', { hasText: 'Add limit' }).click();
    await expect(page.locator('#budget-sheet-title')).toHaveText('Track Health');
    await expect(page.locator('#budget-remove')).toBeHidden();
    await page.locator('#budget-input').fill('750');
    await page.locator('#budget-save').click();
    await expect(card(page, 'health')).toHaveCount(1);
    expect((await readState(page)).budgets.health).toEqual({ limit: 75000, period: 'month' });
  });

  test('deleting your own budget moves its transactions to Other', async ({ page }) => {
    await freshPage(page);
    await createBudget(page, { name: 'Pets', icon: 'paw', limit: '2000' });
    await addExpense(page, '400', 'Pets', { note: 'Dog food' });

    await cardByName(page, 'Pets').locator('.bc-edit').click();
    await expect(page.locator('#budget-remove')).toHaveText('Delete budget');
    await page.locator('#budget-remove').click();
    await expect(page.locator('#confirm-text')).toContainText('1 transaction moves to Other');
    await page.locator('#confirm-ok').click();
    await expect(page.locator('#budget-sheet')).not.toBeVisible();
    await expect(cardByName(page, 'Pets')).toHaveCount(0);

    const s = await readState(page);
    expect(s.categories.some((c) => c.name === 'Pets')).toBe(false);
    expect(s.transactions.find((t) => t.note === 'Dog food').categoryId).toBe('other');
    await openScreen(page, 'transactions');
    await expect(page.locator('.filter-chip', { hasText: /^Pets$/ })).toHaveCount(0);
  });

  test('custom category names are shown as text, never HTML', async ({ page }) => {
    await freshPage(page);
    await createBudget(page, { name: '<img src=x onerror=1>', icon: 'star', limit: '10' });
    await expect(cardByName(page, '<img src=x onerror=1>')).toBeVisible();
    expect(await page.locator('img').count()).toBe(0);
  });
});
