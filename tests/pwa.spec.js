import { test, expect } from '@playwright/test';
import { freshPage, readState } from './helpers.js';

function pngSize(buf) {
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

test.describe('installable and offline', () => {
  test('manifest is linked and complete, icons have the right sizes', async ({ page, request }) => {
    await freshPage(page);
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    const res = await request.get(`/${href}`);
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m).toMatchObject({ name: 'Budget', short_name: 'Budget', display: 'standalone', start_url: './', theme_color: '#E11D2E' });
    for (const icon of m.icons) {
      const r = await request.get(`/${icon.src}`);
      expect(r.ok(), icon.src).toBe(true);
      const [w, h] = icon.sizes.split('x').map(Number);
      expect(pngSize(await r.body())).toEqual({ w, h });
    }
    expect(m.icons.some((i) => i.purpose === 'maskable')).toBe(true);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(1);
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute('content', /script-src 'self'/);
  });

  test('the app loads offline after the first visit', async ({ page, context }) => {
    await freshPage(page);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => document.documentElement.dataset.ready === '1');
    await expect(page.locator('#home-title')).toContainText('Welcome back');
    await expect(page.locator('.kpi')).toHaveCount(4);
    await expect(page.locator('#chart .chart-bar')).toHaveCount(12);

    // Still usable offline
    await page.locator('#fab').click();
    await page.locator('#tx-amount').fill('9.99');
    await page.locator('.cat-option', { hasText: 'Food' }).click();
    await page.locator('#tx-note').fill('Offline snack');
    await page.locator('#tx-save').click();
    await expect(page.locator('#recent-list')).toContainText('Offline snack');

    // Navigating directly to another screen works offline too
    await page.goto('/#settings');
    await expect(page.locator('#screen-settings')).toBeVisible();
    await context.setOffline(false);
    expect((await readState(page)).transactions.some((t) => t.note === 'Offline snack')).toBe(true);
  });

  test('no network requests leave the device except Google Fonts', async ({ page }) => {
    const hosts = new Set();
    page.on('request', (r) => hosts.add(new URL(r.url()).host));
    await freshPage(page);
    await page.locator('#fab').click();
    await page.keyboard.press('Escape');
    const external = [...hosts].filter((h) => !h.startsWith('127.0.0.1'));
    for (const h of external) expect(['fonts.googleapis.com', 'fonts.gstatic.com']).toContain(h);
  });
});
