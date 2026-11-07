import { test, expect } from '@playwright/test';
import { freshPage, openScreen, readState } from './helpers.js';

async function addExpense(page, amount, category, note = '') {
  await page.locator('#fab').click();
  await page.locator('#tx-amount').fill(amount);
  await page.locator('.cat-option', { hasText: category }).click();
  if (note) await page.locator('#tx-note').fill(note);
  await page.locator('#tx-save').click();
  await expect(page.locator('#tx-sheet')).not.toBeVisible();
}

test.describe('settings', () => {
  test('name updates the greeting and survives a reload', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'settings');
    await page.locator('#set-name').fill('Maria Clara');
    await page.locator('#set-name').press('Enter');
    await openScreen(page, 'home');
    await expect(page.locator('#greet-name')).toHaveText('Maria Clara');
    await expect(page.locator('#avatar-initials')).toHaveText('MC');
    await page.reload();
    await expect(page.locator('#greet-name')).toHaveText('Maria Clara');
  });

  test('empty name shows an error and is not saved', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'settings');
    await page.locator('#set-name').fill('   ');
    await page.locator('#set-name').press('Enter');
    await expect(page.locator('#set-name-error')).toBeVisible();
    expect((await readState(page)).settings.name).toBe('Friend');
  });

  test('currency defaults to PHP and can be changed', async ({ page }) => {
    await freshPage(page);
    await expect(page.locator('#overview-total')).toHaveText(/₱/);
    await openScreen(page, 'settings');
    await expect(page.locator('#set-currency')).toHaveValue('PHP');
    await page.locator('#set-currency').selectOption('USD');
    await openScreen(page, 'home');
    await expect(page.locator('#overview-total')).toHaveText(/\$/);
  });

  test('start day of month changes the budget period', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'settings');
    await page.locator('#set-startday').selectOption('15');
    await openScreen(page, 'budgets');
    await expect(page.locator('#budgets-period')).toContainText('15');
    await expect(page.locator('#budgets-period')).toContainText('–');
  });

  test('dark mode toggle switches theme and persists', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'settings');
    await page.locator('#theme-seg [data-theme-value="dark"]').click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(15, 15, 18)');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.locator('#theme-seg [data-theme-value="light"]').click();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(243, 244, 246)');
  });

  test('follows the system dark preference by default', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await freshPage(page);
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(15, 15, 18)');
  });

  test('data survives a page reload', async ({ page }) => {
    await freshPage(page);
    await addExpense(page, '42.10', 'Shopping', 'Reload check');
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await expect(page.locator('#recent-list')).toContainText('Reload check');
    const tx = (await readState(page)).transactions.find((t) => t.note === 'Reload check');
    expect(tx.amountCents).toBe(4210);
  });

  test('clear sample data removes only sample transactions', async ({ page }) => {
    await freshPage(page);
    await addExpense(page, '10', 'Food', 'Mine');
    await openScreen(page, 'settings');
    await page.locator('#clear-sample-btn').click();
    await page.locator('#confirm-ok').click();
    await expect(page.locator('#toast')).toContainText('Removed');
    const s = await readState(page);
    expect(s.transactions.map((t) => t.note)).toEqual(['Mine']);
    await expect(page.locator('#clear-sample-btn')).toBeDisabled();
    await openScreen(page, 'home');
    await expect(page.locator('#sample-banner')).toBeHidden();
  });

  test('reset requires typing RESET', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'settings');
    await page.locator('#reset-btn').click();
    const confirm = page.locator('#reset-confirm');
    await expect(confirm).toBeDisabled();
    await page.locator('#reset-input').fill('reset');
    await expect(confirm).toBeDisabled();
    await page.locator('#reset-input').fill('RESET');
    await expect(confirm).toBeEnabled();
    await confirm.click();
    await expect(page.locator('#reset-dialog')).not.toBeVisible();
    const s = await readState(page);
    expect(s.transactions).toEqual([]);
    expect(s.settings.name).toBe('Friend');
    await openScreen(page, 'transactions');
    await expect(page.locator('#tx-groups')).toContainText('Add your first transaction');
  });

  test('asks the browser to keep data and shows the result', async ({ page }) => {
    await freshPage(page);
    await openScreen(page, 'settings');
    await expect(page.locator('#persist-status')).toHaveText(/.+/);
  });

  test('shows a backup reminder when there was no export for 30 days', async ({ page }) => {
    await freshPage(page);
    await addExpense(page, '5', 'Food', 'Real entry');
    await openScreen(page, 'settings');
    await expect(page.locator('#backup-reminder')).toBeVisible();
    await expect(page.locator('#backup-reminder')).toContainText("haven't exported");
    const download = page.waitForEvent('download');
    await page.locator('#export-btn').click();
    await download;
    await expect(page.locator('#backup-reminder')).toBeHidden();
    // 31 days later
    await page.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('budget.v1'));
      raw.settings.lastExportAt = Date.now() - 31 * 86_400_000;
      localStorage.setItem('budget.v1', JSON.stringify(raw));
    });
    await page.reload();
    await openScreen(page, 'settings');
    await expect(page.locator('#backup-reminder')).toContainText('31 days ago');
  });
});
