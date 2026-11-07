import { expect } from '@playwright/test';

export const SCREENS = ['home', 'transactions', 'budgets', 'settings'];
export const STORAGE_KEY = 'budget.v1';

/** Load the app with clean storage (sample data seeded on first launch). */
export async function freshPage(page, { seed = true } = {}) {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  if (!seed) {
    await page.evaluate(() => localStorage.setItem('budget.test.noSeed', '1'));
  }
  await page.reload();
  await expect(page.locator('#screen-home')).toBeVisible();
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
}

export async function openScreen(page, name) {
  await page.locator(`.tab[data-tab="${name}"]`).click();
  await expect(page.locator(`#screen-${name}`)).toBeVisible();
}

export async function readState(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
}
