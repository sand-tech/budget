import { test, expect } from '@playwright/test';
import { freshPage } from './helpers.js';

test.describe('home dashboard', () => {
  test('shows greeting, 4 KPIs, chart, top categories and recent transactions', async ({ page }) => {
    await freshPage(page);
    await expect(page.locator('#home-title')).toContainText('Welcome back, Friend');
    await expect(page.locator('#bell-btn')).toHaveAttribute('aria-label', /Notifications/);
    await expect(page.locator('.kpi')).toHaveCount(4);
    for (const label of ['Balance', 'Income', 'Expenses', 'Savings Rate']) {
      await expect(page.locator('.kpi-label', { hasText: label })).toBeVisible();
    }
    await expect(page.locator('#sample-banner')).toBeVisible();
    await expect(page.locator('#chart .chart-bar')).toHaveCount(12);
    await expect(page.locator('#chart .chart-bar.is-selected')).toHaveCount(1);
    await expect(page.locator('#top-cats > li')).toHaveCount(4);
    await expect(page.locator('#recent-list > li')).toHaveCount(5);
  });

  test('KPI values match the stored transactions', async ({ page }) => {
    await freshPage(page);
    const expected = await page.evaluate(async () => {
      const state = await import('/js/state.js');
      const k = state.kpis(state.getData(), new Date());
      return { balance: k.balance, income: k.income, expense: k.expense };
    });
    await expect(page.locator('[data-kpi="balance"] .kpi-value')).toHaveAttribute('data-value', String(expected.balance));
    await expect(page.locator('[data-kpi="income"] .kpi-value')).toHaveAttribute('data-value', String(expected.income));
    await expect(page.locator('[data-kpi="expenses"] .kpi-value')).toHaveAttribute('data-value', String(expected.expense));
    await expect(page.locator('#overview-total')).toHaveAttribute('data-cents', String(expected.expense));
  });

  test('tapping a bar selects it and moves the tooltip', async ({ page }) => {
    await freshPage(page);
    const tip = page.locator('.chart-tip');
    const before = await tip.evaluate((el) => el.style.transform);
    await expect(tip).toContainText(/Income/);
    const hits = page.locator('.chart-hit');
    await hits.nth(10).click();
    await expect(hits.nth(10)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.chart-bar').nth(10)).toHaveClass(/is-selected/);
    await expect(page.locator('.chart-bar.is-selected')).toHaveCount(1);
    await expect.poll(() => tip.evaluate((el) => el.style.transform)).not.toBe(before);
    const label = await page.locator('#overview-label').textContent();
    await expect(tip.locator('.chart-tip-title')).toHaveText(label.replace('Expenses · ', ''));
  });

  test('arrow keys move between bars', async ({ page }) => {
    await freshPage(page);
    await page.locator('.chart-hit[aria-pressed="true"]').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator('.chart-hit').nth(10)).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.chart-hit').nth(10)).toBeFocused();
  });

  test('Week / Month / Year pills change the bars', async ({ page }) => {
    await freshPage(page);
    await page.locator('#period-seg [data-mode="week"]').click();
    await expect(page.locator('#period-seg [data-mode="week"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#chart .chart-bar')).toHaveCount(12);
    await expect(page.locator('#overview-label')).toContainText('Week of');
    await page.locator('#period-seg [data-mode="year"]').click();
    await expect(page.locator('#chart .chart-bar')).toHaveCount(5);
    await expect(page.locator('#overview-label')).toContainText(String(new Date().getFullYear()));
  });

  test('top categories are sorted by amount with budget bars', async ({ page }) => {
    await freshPage(page);
    const amounts = await page.locator('#top-cats .tile').evaluateAll((els) => els.map((e) => Number(e.dataset.cents)));
    expect([...amounts].sort((a, b) => b - a)).toEqual(amounts);
    await expect(page.locator('#top-cats [role="progressbar"]').first()).toBeVisible();
  });

  test('empty state offers to add the first transaction', async ({ page }) => {
    await freshPage(page, { seed: false });
    await expect(page.locator('#recent-list .empty')).toBeVisible();
    await expect(page.locator('#recent-list button', { hasText: 'Add your first transaction' })).toBeVisible();
  });
});
