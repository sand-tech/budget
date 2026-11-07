import { test, expect } from '@playwright/test';
import { freshPage, openScreen, SCREENS } from './helpers.js';

/** Runs in the page: finds visible text whose contrast is below WCAG AA. */
function contrastFailures() {
  const parse = (c) => {
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r, g, b, a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const bgOf = (el) => {
    for (let n = el; n; n = n.parentElement) {
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0.9) return c;
    }
    return parse(getComputedStyle(document.body).backgroundColor);
  };
  const out = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const el = node.parentElement;
    if (!node.textContent.trim() || !el || seen.has(el)) continue;
    seen.add(el);
    if (el.closest('.sr-only, [hidden], dialog:not([open]), .skip-link')) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    const st = getComputedStyle(el);
    if (st.visibility === 'hidden' || Number(st.opacity) === 0) continue;
    if (el.closest('button:disabled')) continue; // disabled controls are exempt
    const isSvg = el instanceof SVGElement;
    const fg = parse(isSvg ? st.fill : st.color);
    const bg = bgOf(isSvg ? el.closest('div') : el);
    if (!fg || !bg) continue;
    const size = parseFloat(st.fontSize);
    const bold = Number(st.fontWeight) >= 700;
    const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5;
    const got = ratio(fg, bg);
    if (got < need) out.push(`${el.tagName.toLowerCase()}.${el.className?.baseVal ?? el.className} "${node.textContent.trim().slice(0, 30)}" ${got.toFixed(2)} < ${need}`);
  }
  return out;
}

for (const scheme of ['light', 'dark']) {
  test(`text contrast is at least 4.5:1 on every screen (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
    await freshPage(page);
    for (const screen of SCREENS) {
      await openScreen(page, screen);
      expect(await page.evaluate(contrastFailures), `${screen} (${scheme})`).toEqual([]);
    }
    // The add sheet with an error showing
    await page.locator('#fab').click();
    await page.locator('#tx-save').click();
    expect(await page.evaluate(contrastFailures), `sheet (${scheme})`).toEqual([]);
    await page.keyboard.press('Escape');
    // The toast
    await page.evaluate(async () => (await import('/js/ui.js')).showToast('Saved', { actionLabel: 'Undo', duration: 10000 }));
    expect(await page.evaluate(contrastFailures), `toast (${scheme})`).toEqual([]);
  });
}

test('every form control has a label and every button a name', async ({ page }) => {
  await freshPage(page);
  await page.locator('#fab').click();
  const problems = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('input, select, textarea')) {
      const named = el.labels?.length || el.getAttribute('aria-label') || el.getAttribute('aria-labelledby');
      if (!named) out.push(`unlabelled ${el.tagName} #${el.id} [name=${el.name}]`);
    }
    for (const el of document.querySelectorAll('button, a[href]')) {
      const name = (el.getAttribute('aria-label') || el.textContent || '').trim();
      if (!name) out.push(`nameless ${el.tagName} #${el.id}.${el.className}`);
    }
    return out;
  });
  expect(problems).toEqual([]);
});

test('keyboard focus shows a visible focus ring', async ({ page }) => {
  await freshPage(page);
  await page.keyboard.press('Tab'); // skip link
  await page.keyboard.press('Tab');
  const style = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement);
    return { outline: s.outlineStyle, width: parseFloat(s.outlineWidth), tag: document.activeElement.tagName };
  });
  expect(style.outline).not.toBe('none');
  expect(style.width).toBeGreaterThanOrEqual(2);
});

test('skip link jumps to the main content', async ({ page }) => {
  await freshPage(page);
  await page.keyboard.press('Tab');
  await expect(page.locator('.skip-link')).toBeFocused();
  await expect(page.locator('.skip-link')).toBeInViewport();
});

test('reduced motion: no count-up and no sheet animation', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await freshPage(page);
  const value = page.locator('[data-kpi="income"] .kpi-value [aria-hidden="true"]');
  const finalText = await page.evaluate(async () => {
    const { moneyShort } = await import('/js/format.js');
    const state = await import('/js/state.js');
    return moneyShort(state.kpis(state.getData(), new Date()).income, 'PHP');
  });
  await expect(value).toHaveText(finalText, { timeout: 100 });
  await page.locator('#fab').click();
  const dur = await page.locator('#tx-sheet').evaluate((el) => parseFloat(getComputedStyle(el).animationDuration));
  expect(dur).toBeLessThanOrEqual(0.01);
});

test('transitions stay within 150–250ms', async ({ page }) => {
  await freshPage(page);
  const durations = await page.evaluate(() => {
    const read = (sel) => getComputedStyle(document.querySelector(sel)).transitionDuration.split(',').map((d) => parseFloat(d) * 1000);
    return { tab: read('.tab'), seg: read('#period-seg button'), bar: read('.chart-bar') };
  });
  for (const list of Object.values(durations)) for (const d of list) {
    expect(d).toBeGreaterThanOrEqual(150);
    expect(d).toBeLessThanOrEqual(250);
  }
});

test('the contrast checker itself catches low-contrast text', async ({ page }) => {
  await freshPage(page);
  await page.evaluate(() => {
    const p = document.createElement('p');
    p.textContent = 'too light';
    p.style.color = '#9CA3AF';
    p.style.background = '#FFFFFF';
    document.querySelector('#screen-home').prepend(p);
  });
  const failures = await page.evaluate(contrastFailures);
  expect(failures.some((f) => f.includes('too light'))).toBe(true);
});

test('count-up animates KPI numbers on first load', async ({ page }) => {
  await page.addInitScript(() => {
    window.__samples = [];
    const tick = () => {
      const el = document.querySelector('[data-kpi="income"] .kpi-value [aria-hidden="true"]');
      if (el) window.__samples.push(el.textContent);
      if (window.__samples.length < 90) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.goto('/');
  await page.waitForFunction(() => window.__samples.length >= 60, null, { timeout: 5000 });
  const samples = await page.evaluate(() => window.__samples);
  const finalText = await page.evaluate(async () => {
    const { moneyShort } = await import('/js/format.js');
    const state = await import('/js/state.js');
    return moneyShort(state.kpis(state.getData(), new Date()).income, 'PHP');
  });
  expect(new Set(samples).size).toBeGreaterThan(3);
  expect(samples.at(-1)).toBe(finalText);
});
