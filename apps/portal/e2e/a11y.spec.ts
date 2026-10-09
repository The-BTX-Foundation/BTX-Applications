import { expect, test } from '@playwright/test';
import fs from 'node:fs';

const axeSource = fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const pages = [
  '/', '/?preview=soon', '/?preview=closed', '/?preview=error',
  '/sign-in?demo=email', '/sign-in?demo=code', '/sign-in?demo=wrong', '/sign-in?demo=expired',
  '/apply/basic-info?demo=1', '/apply/basic-info?demo=stress', '/apply/scholarship?demo=1', '/apply/essay?demo=1',
  '/apply/documents?demo=empty', '/apply/documents?demo=uploading', '/apply/documents?demo=failed',
  '/apply/review?demo=1', '/apply/review?demo=failed', '/status',
  '/apply/review?demo=terpmail', '/apply/start?demo=terpmail',
  '/status?demo=before-booking', '/status?demo=sent', '/status?demo=booked', '/status?demo=switched', '/status?demo=soon', '/status?demo=today',
  '/status?demo=after', '/status?demo=won', '/status?demo=won-sent', '/status?demo=not-picked', '/status?demo=booked-stress', '/status?demo=won-stress',
  '/status/schedule?demo=schedule', '/status/schedule?demo=taken', '/status/schedule?demo=schedule-stress', '/status/change?demo=change',
  '/status/no-time?demo=no-time', '/status/no-time?demo=no-time-stress', '/status/story?demo=story', '/status/schedule?demo=error',
];

// axe-core on every page at laptop and phone width: no serious or critical problems (and, today, no moderate ones).
for (const [name, viewport] of [['laptop', { width: 1440, height: 900 }], ['phone', { width: 390, height: 844 }]] as const) {
  test.describe(`axe at ${name} width`, () => {
    test.use({ viewport });
    for (const url of pages) {
      test(url, async ({ page }) => {
        await page.goto(url);
        await page.waitForLoadState('networkidle');
        await page.evaluate(axeSource);
        const violations = await page.evaluate(async () => {
          // @ts-expect-error axe is injected above
          const r = await window.axe.run(document);
          return r.violations.map((v: { id: string; impact: string; nodes: { target: string[] }[] }) => `${v.impact} ${v.id} ${v.nodes[0].target.join(' ')}`);
        });
        expect(violations).toEqual([]);
      });
    }
  });
}

// Keyboard: every Tab stop on the sign-in screen and the Documents step shows a visible focus ring.
test('keyboard focus is always visible', async ({ page }) => {
  for (const url of ['/sign-in?demo=email', '/apply/documents?demo=empty', '/apply/review?demo=1']) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el.tagName.startsWith('NEXTJS')) return 'body'; // (the dev-server overlay is not ours)
        const has = (e: Element | null) => !!e && getComputedStyle(e).outlineStyle !== 'none' && parseFloat(getComputedStyle(e).outlineWidth) > 0;
        // inputs draw their ring on the field around them; the code input draws it on its boxes
        const ok = has(el) || has(el.closest('.in')) || !!el.closest('.cx')?.querySelector('.f5') || el.classList.contains('sr-only');
        return ok ? 'ok' : `no ring on ${el.tagName}.${el.className}`;
      });
      expect(state, url).not.toMatch(/^no ring/);
    }
  }
});
