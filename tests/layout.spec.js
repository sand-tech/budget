import { test, expect } from '@playwright/test';
import { SCREENS, openScreen, freshPage } from './helpers.js';

test.describe('layout', () => {
  for (const screen of SCREENS) {
    test(`no horizontal overflow on ${screen}`, async ({ page }) => {
      await freshPage(page);
      await openScreen(page, screen);
      const { scrollW, clientW } = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        clientW: document.documentElement.clientWidth,
      }));
      expect(scrollW).toBeLessThanOrEqual(clientW);
      // No element pokes out past the right edge of the viewport.
      const offenders = await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        return [...document.querySelectorAll('body *')]
          .filter((el) => {
            if (el.closest('.chips-row') && !el.classList.contains('chips-row')) return false; // inner scroll row
            if (el.closest('dialog:not([open])')) return false;
            const r = el.getBoundingClientRect();
            return r.width > 0 && r.right > w + 0.5;
          })
          .map((el) => `${el.tagName.toLowerCase()}.${el.className}`)
          .slice(0, 5);
      });
      expect(offenders).toEqual([]);
    });
  }

  test('tab bar switches screens and marks the current tab', async ({ page }) => {
    await freshPage(page);
    for (const screen of SCREENS) {
      await page.locator(`.tab[data-tab="${screen}"]`).click();
      await expect(page.locator(`#screen-${screen}`)).toBeVisible();
      await expect(page.locator(`.tab[data-tab="${screen}"]`)).toHaveAttribute('aria-current', 'page');
    }
  });

  test('interactive controls are at least 44x44', async ({ page }) => {
    await freshPage(page);
    for (const screen of SCREENS) {
      await openScreen(page, screen);
      await page.waitForFunction(() => !document.querySelector('.screen.is-entering')); // measure after the entry animation
      const small = await page.evaluate(() => {
        const sel = 'button, a[href], input:not([type=hidden]):not(.sr-only), select, label.btn, [role=button]';
        return [...document.querySelectorAll(sel)]
          .filter((el) => el.offsetParent !== null && !el.closest('dialog:not([open])'))
          .filter((el) => !el.classList.contains('skip-link'))
          .filter((el) => !el.closest('.seg-radio, .cat-option, .chart-hits'))
          .map((el) => ({ el, r: el.getBoundingClientRect() }))
          .filter(({ r }) => r.width < 43.5 || r.height < 43.5)
          .map(({ el, r }) => `${el.tagName.toLowerCase()}#${el.id}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      expect(small, `small targets on ${screen}`).toEqual([]);
    }
  });
});
