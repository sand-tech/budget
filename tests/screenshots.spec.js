// Saves a screenshot of every screen in light and dark mode to screenshots/
// for visual review. Run alone with: npm run screenshots
import { test } from '@playwright/test';
import { freshPage, openScreen, SCREENS } from './helpers.js';

for (const scheme of ['light', 'dark']) {
  test(`screenshots (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await freshPage(page);
    await page.evaluate(() => document.fonts.ready);
    for (const screen of SCREENS) {
      await openScreen(page, screen);
      await page.screenshot({ path: `screenshots/${screen}-${scheme}.png`, fullPage: true });
    }
    await openScreen(page, 'home');
    await page.locator('#fab').click();
    await page.locator('.cat-option', { hasText: 'Food' }).click();
    await page.locator('#tx-amount').fill('12.345');
    await page.locator('#tx-save').click();
    await page.screenshot({ path: `screenshots/add-sheet-${scheme}.png` });
    await page.keyboard.press('Escape');

    await openScreen(page, 'transactions');
    const row = page.locator('#tx-groups .swipe').first();
    await row.locator('.swipe-delete').focus();
    await page.screenshot({ path: `screenshots/swipe-${scheme}.png` });

    await freshPage(page, { seed: false });
    await page.screenshot({ path: `screenshots/empty-${scheme}.png`, fullPage: true });
  });
}
