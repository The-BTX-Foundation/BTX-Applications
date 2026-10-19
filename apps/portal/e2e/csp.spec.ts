import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';

// The Content-Security-Policy-Report-Only trial (lib/csp.ts, proxy.ts, owner notes CSP.md), end to end.
//
// The tests open the app under its production name (the browser maps apply.thebtxfoundation.org to this machine, as in
// e2e/analytics.spec.ts), so Google's real tag loads and its hits go out the way they will live. Every request to
// Google's collect hosts is answered here and never leaves. The browser reports each load the policy would refuse as a
// `securitypolicyviolation` event; an init script records them all, from the very first byte of each page. The pass mark
// for the trial is zero, across every screen the applicant can reach and every review screen.

const PORT = process.env.PORT ?? '3210';
const PROD = `http://apply.thebtxfoundation.org:${PORT}`;
// API requests come from Node, not the browser, so the name mapping doesn't apply to them: they use localhost
const LOCAL = `http://localhost:${PORT}`;
const pdf = path.join(__dirname, 'files', 'sample.pdf');

test.use({
  baseURL: PROD,
  launchOptions: {
    args: [
      `--host-resolver-rules=MAP apply.thebtxfoundation.org 127.0.0.1, MAP *.google-analytics.com ~NOTFOUND, MAP *.analytics.google.com ~NOTFOUND, MAP www.google.com ~NOTFOUND, MAP *.doubleclick.net ~NOTFOUND`,
    ],
  },
});

type Violation = { directive: string; blocked: string; source: string; line: number; page: string };

// Records every CSP violation in every page of the context, and answers Google's hosts locally except the tag script.
async function watchCsp(context: BrowserContext) {
  await context.addInitScript(() => {
    const w = window as unknown as { __csp?: unknown[] };
    w.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      w.__csp!.push({ directive: e.effectiveDirective, blocked: e.blockedURI, source: e.sourceFile, line: e.lineNumber, page: location.pathname });
    });
  });
  await context.route(/^https:\/\/([^/]*\.)?(google-analytics\.com|analytics\.google\.com|google\.[a-z.]+|doubleclick\.net|googletagmanager\.com)\//, (route) =>
    /^https:\/\/www\.googletagmanager\.com\/gtag\/(js|destination)\?/.test(route.request().url()) ? route.continue() : route.fulfill({ status: 204, body: '' }),
  );
}

// The violations recorded on the page so far.
async function violations(page: Page): Promise<Violation[]> {
  return page.evaluate(() => ((window as unknown as { __csp?: Violation[] }).__csp ?? []).slice());
}

test('every page carries the report-only policy with a fresh nonce, and Next.js stamps it on every inline script', async ({ request }) => {
  const a = await request.get(`${LOCAL}/sign-in`);
  const b = await request.get(`${LOCAL}/sign-in`);
  const policy = a.headers()['content-security-policy-report-only'] ?? '';
  const nonceOf = (p: string) => p.match(/'nonce-([A-Za-z0-9+/_-]+={0,2})'/)?.[1] ?? '';
  const nonce = nonceOf(policy);
  expect(nonce, 'nonce in the policy').not.toBe('');
  expect(nonceOf(b.headers()['content-security-policy-report-only'] ?? '')).not.toBe(nonce);
  const scriptSrc = policy.split('; ').find((d) => d.startsWith('script-src ')) ?? '';
  expect(scriptSrc).not.toMatch(/unsafe-inline|strict-dynamic/);
  expect(policy).toContain('report-uri /api/csp-report');
  expect(policy).toContain("object-src 'none'");
  expect(policy).not.toContain('report-to');
  // the enforced framing policy is still there, unchanged
  expect(a.headers()['content-security-policy']).toBe("frame-ancestors 'self'; base-uri 'self'; object-src 'none'");
  // every inline script in the HTML carries this response's nonce
  const html = await a.text();
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>/g)].map((m) => m[1]);
  expect(inline.length).toBeGreaterThan(0);
  for (const attrs of inline) expect(attrs, 'inline script nonce').toContain(`nonce="${nonce}"`);
});

test('the whole applicant path, with the Google tag loaded, causes no violation', async ({ page, context }) => {
  await watchCsp(context);
  const seen: Violation[] = [];
  const check = async () => seen.push(...(await violations(page)));

  await page.goto('/?utm_source=newsletter');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  await expect.poll(() => page.evaluate(() => document.cookie.includes('_ga='))).toBe(true);
  await check();
  await page.getByRole('link', { name: 'Start your application' }).first().click();
  await page.getByLabel('Terpmail address').fill('csp.check@terpmail.umd.edu');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('6-digit code').last().fill('123456');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page).toHaveURL(/\/apply\/basic-info/);
  await page.getByLabel('Full name').fill('Csp Check');
  await page.getByLabel('Phone number').fill('3015550100');
  await page.getByRole('button', { name: 'Female' }).click();
  await page.getByLabel('Race').selectOption('Asian');
  await page.getByLabel('How did you hear about this scholarship?').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Junior' }).click();
  await page.getByLabel('Credits left to finish your degree').fill('48');
  await page.getByLabel('Major').selectOption('Mechanical Engineering');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/apply\/scholarship/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/apply\/short-answers/);
  await page.getByLabel(/community you're part of/).fill('One answer.');
  await page.getByLabel(/class that pushed you/).fill('Two answer.');
  await page.getByLabel(/problem do you want to work on/).fill('Three answer.');
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/apply\/documents/);
  await page.getByLabel('Choose a PDF for Resume').setInputFiles(pdf);
  await page.getByLabel('Choose a PDF for Unofficial transcript').setInputFiles(pdf);
  await expect(page.getByText('Uploaded', { exact: true })).toHaveCount(2, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/apply\/review/);
  await page.getByRole('checkbox', { name: /My answers are true/ }).click();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page).toHaveURL(/\/status/);
  // Google's tag hits went out (to the local stand-in), so connect-src was exercised; the whole path above is one
  // document (the app changes screens without a reload), so its resource list covers every screen
  expect(await page.evaluate(() => performance.getEntriesByType('resource').some((e) => e.name.includes('google-analytics.com/g/collect')))).toBe(true);
  await check();
  // the story screen previews a chosen photo through a blob: address
  await page.goto('/status/story?demo=story');
  const photo = page.locator('input[type=file]').first();
  if (await photo.count()) await photo.setInputFiles({ name: 'photo.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64') });
  await page.waitForTimeout(500);
  await check();
  expect(seen, 'CSP violations').toEqual([]);
});

const screens = [
  '/?preview=soon', '/?preview=closed', '/?preview=error',
  '/sign-in?demo=email', '/sign-in?demo=code', '/sign-in?demo=wrong', '/sign-in?demo=expired', '/sign-in?error=link',
  '/apply/basic-info?demo=1', '/apply/scholarship?demo=1', '/apply/short-answers?demo=1', '/apply/documents?demo=uploading',
  '/apply/documents?demo=failed', '/apply/review?demo=1', '/apply/review?demo=terpmail', '/apply/start?demo=terpmail',
  '/status?demo=before-booking', '/status?demo=sent', '/status?demo=booked', '/status?demo=soon', '/status?demo=today',
  '/status?demo=after', '/status?demo=won', '/status?demo=won-sent', '/status?demo=not-picked',
  '/status/schedule?demo=schedule', '/status/schedule?demo=taken', '/status/change?demo=change', '/status/no-time?demo=no-time',
  '/status/story?demo=story', '/sign-out', '/a-page-that-does-not-exist',
];

test('every review screen loads without a violation', async ({ page, context }) => {
  await watchCsp(context);
  const seen: Violation[] = [];
  for (const url of screens) {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    seen.push(...(await violations(page)).map((v) => ({ ...v, page: url })));
  }
  expect(seen, 'CSP violations').toEqual([]);
});

test('a load the policy would refuse is reported to /api/csp-report, and nothing is blocked', async ({ page, context }) => {
  await watchCsp(context);
  await context.route('https://stray.example.org/**', (route) => route.fulfill({ status: 204, body: '' }));
  await page.goto('/sign-in');
  const reported = page.waitForRequest((r) => r.url().endsWith('/api/csp-report') && r.method() === 'POST');
  const loaded = page.waitForRequest((r) => r.url().startsWith('https://stray.example.org/'));
  await page.evaluate(() => {
    new Image().src = 'https://stray.example.org/pixel.png?token=x';
  });
  const report = JSON.parse((await reported).postData() ?? '{}')['csp-report'] ?? {};
  expect(report['effective-directive'] ?? report['violated-directive']).toMatch(/^img-src/);
  // report-only: the browser still made the request
  await loaded;
  expect((await violations(page)).map((v) => v.directive)).toEqual(['img-src']);
});

test('the report endpoint takes reports quietly and echoes nothing', async ({ request }) => {
  const report = { 'csp-report': { 'document-uri': `${LOCAL}/sign-in?x=1`, 'effective-directive': 'img-src', 'blocked-uri': 'https://example.com/a.png', disposition: 'report' } };
  const ok = await request.post(`${LOCAL}/api/csp-report`, { data: JSON.stringify(report), headers: { 'content-type': 'application/csp-report' } });
  expect(ok.status()).toBe(204);
  expect(await ok.text()).toBe('');
  const big = await request.post(`${LOCAL}/api/csp-report`, { data: 'x'.repeat(40_000), headers: { 'content-type': 'application/reports+json' } });
  expect(big.status()).toBe(204);
  const wrongType = await request.post(`${LOCAL}/api/csp-report`, { data: 'hello', headers: { 'content-type': 'text/plain' } });
  expect(wrongType.status()).toBe(204);
  expect((await request.get(`${LOCAL}/api/csp-report`)).status()).toBe(405);
});
