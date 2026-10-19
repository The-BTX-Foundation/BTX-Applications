import { expect, test, type Page } from '@playwright/test';
import path from 'node:path';

// Analytics end to end, with the real Google tag (gtag.js is fetched from Google) on the production address.
//
// The browser resolves apply.thebtxfoundation.org to this machine, so the Portal's own production-host rule decides
// to load the tag, exactly as it will live. Every request to Google's analytics and advertising hosts is answered
// here with an empty 204 and never leaves the machine; as a second wall those hosts don't resolve at all. What the
// tests read is what the page tried to send: the dataLayer, and every request to a Google host.
//
// Marker values (CANARY) are typed into every field and put into addresses and referrers. None may appear anywhere
// Google could see it (security-playbook IN-51). The rules themselves are unit-tested in tests/analytics.test.ts.

const PORT = process.env.PORT ?? '3210';
const PROD = `http://apply.thebtxfoundation.org:${PORT}`;
const LOCAL = `http://localhost:${PORT}`;
const pdf = path.join(__dirname, 'files', 'sample.pdf');

const CANARY = {
  email: 'zqcanary.student@terpmail.umd.edu',
  badEmail: 'zqcanary.person@gmail.com',
  name: 'Zqcanary Fullname',
  phone: '3015550199',
  answer: 'Zqcanaryanswer',
  id: 'ZQCANARYID',
  meet: 'zqcanarymeet',
  ref: 'zqcanaryref',
};
const MARKERS = ['zqcanary', '3015550199', '301-555-0199'];

test.use({
  baseURL: PROD,
  launchOptions: {
    args: [
      // the production address points at the local dev server; Google's collect and ad hosts don't resolve at all
      `--host-resolver-rules=MAP apply.thebtxfoundation.org 127.0.0.1, MAP *.google-analytics.com ~NOTFOUND, MAP *.analytics.google.com ~NOTFOUND, MAP www.google.com ~NOTFOUND, MAP *.doubleclick.net ~NOTFOUND`,
    ],
  },
});

type Sent = { url: string; body: string };

// Records every request the page makes to a Google host, and answers the collect and ad hosts locally (204).
async function watchGoogle(page: Page) {
  const sent: Sent[] = [];
  page.on('request', (req) => {
    if (/google|doubleclick/i.test(new URL(req.url()).hostname)) sent.push({ url: req.url(), body: req.postData() ?? '' });
  });
  await page.route(/^https:\/\/([^/]*\.)?(google-analytics\.com|analytics\.google\.com|google\.com|doubleclick\.net)\//, (route) =>
    route.fulfill({ status: 204, body: '' }),
  );
  return sent;
}

// The GA4 events in what was sent: one per hit address that names one, plus one per body line.
function sentEvents(sent: Sent[]): Array<Record<string, string>> {
  const events: Array<Record<string, string>> = [];
  for (const s of sent) {
    const url = new URL(s.url);
    if (!/\/g\/collect$/.test(url.pathname)) continue;
    const shared = Object.fromEntries(url.searchParams);
    if (shared.en) events.push(shared);
    for (const line of s.body.split(/\r?\n/).filter(Boolean)) events.push({ ...shared, ...Object.fromEntries(new URLSearchParams(line)) });
  }
  return events;
}

// The page's dataLayer as text (gtag stores `arguments` objects, which serialize as {"0":..,"1":..}).
async function dataLayerText(page: Page): Promise<string> {
  return page.evaluate(() => JSON.stringify((window as unknown as { dataLayer?: unknown[] }).dataLayer ?? []));
}

// Our own events in the dataLayer, as [name, params] pairs.
async function dataLayerEvents(page: Page): Promise<Array<[string, Record<string, unknown>]>> {
  return page.evaluate(() =>
    ((window as unknown as { dataLayer?: ArrayLike<unknown>[] }).dataLayer ?? [])
      .map((a) => Array.from(a))
      .filter((a) => a[0] === 'event')
      .map((a) => [a[1] as string, (a[2] ?? {}) as Record<string, unknown>]),
  );
}

// Fails with the offending text when any marker value appears, decoded or not.
function expectNoMarkers(where: string, text: string) {
  let decoded = text;
  try {
    decoded = decodeURIComponent(text.replace(/\+/g, ' '));
  } catch {
    // keep the raw text
  }
  for (const m of MARKERS) {
    for (const t of [text, decoded]) {
      const i = t.toLowerCase().indexOf(m);
      expect(i, `${where} carries "${m}": …${t.slice(Math.max(0, i - 80), i + 80)}…`).toBe(-1);
    }
  }
}

test('the funnel events fire through the real Google tag and nothing an applicant typed leaves the browser', async ({ page }) => {
  const sent = await watchGoogle(page);

  // arrive from the website with markers in the referrer and the address
  await page.goto(`/?utm_source=newsletter&utm_campaign=fall-2026-legacy&utm_term=${CANARY.id}&id=${CANARY.id}`, {
    referer: `https://thebtxfoundation.org/apply/?email=${CANARY.email}&r=${CANARY.ref}`,
  });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  await expect.poll(() => sent.some((s) => s.url.includes('googletagmanager.com/gtag/js')), { message: 'gtag.js requested' }).toBe(true);
  await page.getByRole('link', { name: 'Start your application' }).first().click();
  await expect(page).toHaveURL(/\/sign-in/);

  // sign-in errors are counted as codes, never the address or the code
  await page.getByLabel('Terpmail address').fill(CANARY.badEmail);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Use your Terpmail address')).toBeVisible();
  await page.getByLabel('Terpmail address').fill(CANARY.email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Enter your code').first()).toBeVisible();
  await page.getByLabel('6-digit code').last().fill('111111');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page.getByText("That code doesn't match")).toBeVisible();
  await page.getByLabel('6-digit code').last().fill('123456');
  await page.getByRole('button', { name: 'Verify and continue' }).click();
  await expect(page).toHaveURL(/\/apply\/basic-info/);

  // step 1, with marker values in every text field
  await page.getByLabel('Full name').fill(CANARY.name);
  await page.getByLabel('Phone number').fill(CANARY.phone);
  await page.getByRole('button', { name: 'Female' }).click();
  await page.getByLabel('Race').selectOption('Asian');
  await page.getByLabel('How did you hear about this scholarship?').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Junior' }).click();
  await page.getByLabel('Credits left to finish your degree').fill('48');
  await page.getByLabel('Major').selectOption('Mechanical Engineering');
  await page.getByRole('button', { name: 'Continue' }).click();

  // steps 2 to 5
  await expect(page).toHaveURL(/\/apply\/scholarship/);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/apply\/short-answers/);
  await page.getByLabel(/community you're part of/).fill(`${CANARY.answer} one`);
  await page.getByLabel(/class that pushed you/).fill(`${CANARY.answer} two`);
  await page.getByLabel(/problem do you want to work on/).fill(`${CANARY.answer} three`);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/apply\/documents/);
  await page.getByLabel('Choose a PDF for Resume').setInputFiles({ name: `${CANARY.name}-resume.pdf`, mimeType: 'application/pdf', buffer: await import('node:fs').then((fs) => fs.readFileSync(pdf)) });
  await page.getByLabel('Choose a PDF for Unofficial transcript').setInputFiles(pdf);
  await expect(page.getByText('Uploaded', { exact: true })).toHaveCount(2, { timeout: 10_000 });
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page).toHaveURL(/\/apply\/review/);
  await page.getByRole('checkbox', { name: /My answers are true/ }).click();
  await page.getByRole('button', { name: 'Submit application' }).click();
  await expect(page).toHaveURL(/\/status/);

  // the dataLayer as our own code left it (the next step writes raw Google-style events into it on purpose)
  const dataLayer = await dataLayerText(page);
  const ours = await dataLayerEvents(page);

  // Google's own automatic events, sent straight to gtag the way the tag's enhanced measurement would: an outbound
  // click on a meeting link, and a history-change page view on an address with an id in it
  await page.evaluate(
    ({ id, meet }) => {
      history.pushState({}, '', `/status/interview/${id}?slot=${id}`);
      const g = (window as unknown as { gtag: (...a: unknown[]) => void }).gtag;
      g('event', 'click', { link_url: `https://meet.example.com/${meet}`, link_domain: 'meet.example.com', outbound: true });
      g('event', 'page_view', { page_location: location.href, page_title: `${id} interview` });
      g('event', 'file_download', { link_url: `https://files.example.com/${id}/transcript.pdf`, file_name: `${meet}.pdf` });
    },
    { id: CANARY.id, meet: CANARY.meet },
  );
  // the Portal's own page view for that address (Next follows pushState), reported as /other
  const ownViews = () =>
    page.evaluate(() =>
      ((window as unknown as { dataLayer: ArrayLike<unknown>[] }).dataLayer ?? [])
        .map((a) => Array.from(a))
        .filter((a) => a[0] === 'event' && a[1] === 'page_view' && (a[2] as Record<string, unknown>)?.btx_page_view === '1')
        .map((a) => (a[2] as Record<string, string>).page_location),
    );
  await expect.poll(async () => (await ownViews()).some((l) => l.endsWith('/other'))).toBe(true);
  const ownViewCount = (await ownViews()).length;
  // leave the page so the tag flushes anything still queued
  await page.goto('about:blank');
  await expect.poll(() => sentEvents(sent).some((e) => e.en === 'application_submit'), { message: 'application_submit sent' }).toBe(true);
  // every page view that left is one of the Portal's own: Google's history-style page view was dropped
  await expect.poll(() => sentEvents(sent).filter((e) => e.en === 'page_view').length, { message: 'page views sent' }).toBe(ownViewCount);

  // 1. the funnel events are in the dataLayer, with only their allowed parameters
  const named = (n: string) => ours.filter(([name]) => name === n).map(([, p]) => p);
  expect(named('sign_in_error')).toEqual(expect.arrayContaining([{ code: 'email_not_terpmail' }, { code: 'code_wrong' }]));
  expect(named('sign_up')).toContainEqual({ method: 'email_code' });
  expect(named('application_begin').length).toBeGreaterThan(0);
  expect(named('application_step').map((p) => p.step_number)).toEqual(expect.arrayContaining([1, 2, 3, 4, 5]));
  expect(named('application_step')).toContainEqual({ step_number: 3, step_name: 'short_answers' });
  expect(named('application_submit').length).toBeGreaterThan(0);

  // 2. the same events left through the real tag, past the hit filter
  const events = sentEvents(sent);
  const names = new Set(events.map((e) => e.en));
  for (const n of ['page_view', 'sign_in_error', 'sign_up', 'application_begin', 'application_step', 'application_submit']) {
    expect(names, `${n} reached the collect endpoint`).toContain(n);
  }
  // Google's automatic link and download events never left
  expect(names).not.toContain('click');
  expect(names).not.toContain('file_download');
  // the page-view mark is removed before a hit leaves
  expect(events.filter((e) => 'ep.btx_page_view' in e)).toEqual([]);
  // nothing went to the advertising hosts
  expect(sent.filter((s) => /(^|\.)(google\.com|doubleclick\.net)$/.test(new URL(s.url).hostname))).toEqual([]);

  // 3. every page address and referrer sent is a clean one: a known path, campaign tags only
  for (const e of events) {
    const clean = /^http:\/\/apply\.thebtxfoundation\.org:\d+(\/|\/[a-z-]+(\/[a-z-]+)?)(\?utm_source=newsletter&utm_campaign=fall-2026-legacy)?$/;
    expect(e.dl, 'page address').toMatch(clean);
    if (e.dr && !e.dr.startsWith('https://thebtxfoundation.org')) expect(e.dr, 'referrer').toMatch(clean);
    if (e.dr && e.dr.startsWith('https://thebtxfoundation.org')) expect(e.dr, 'referrer').toBe('https://thebtxfoundation.org/');
  }
  expect(events.map((e) => new URL(e.dl).pathname)).toContain('/other');

  // 4. no marker value anywhere: not in the dataLayer, not in any request to a Google host
  expectNoMarkers('dataLayer', dataLayer);
  for (const s of sent) expectNoMarkers(`request ${new URL(s.url).host}`, `${s.url}\n${s.body}`);
});

test('a browser that sends Global Privacy Control never loads the tag', async ({ page }) => {
  const sent = await watchGoogle(page);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  // events still land in the page's own dataLayer
  await expect.poll(async () => (await dataLayerEvents(page)).some(([n]) => n === 'page_view')).toBe(true);
  expect(sent).toEqual([]);
});

test('?analytics=off switches this browser off for good, and ?analytics=on back on', async ({ page }) => {
  const sent = await watchGoogle(page);
  await page.goto('/?analytics=off');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sign in');
  await page.waitForTimeout(1000);
  expect(sent).toEqual([]);
  await page.goto('/?analytics=on');
  await expect.poll(() => sent.some((s) => s.url.includes('googletagmanager.com/gtag/js'))).toBe(true);
});

test('previews and local runs record events but never load the tag', async ({ page }) => {
  const sent = await watchGoogle(page);
  await page.goto(`${LOCAL}/`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  await expect.poll(async () => (await dataLayerEvents(page)).some(([n]) => n === 'page_view')).toBe(true);
  await page.waitForTimeout(1000);
  expect(sent).toEqual([]);
});

test('an account created from the email link is counted once', async ({ page, context }) => {
  await watchGoogle(page);
  await context.addCookies([{ name: 'btx-signup', value: '1', url: PROD }]);
  await page.goto('/sign-in');
  await expect.poll(async () => (await dataLayerEvents(page)).filter(([n]) => n === 'sign_up')).toEqual([['sign_up', { method: 'email_link' }]]);
  expect((await context.cookies(PROD)).some((c) => c.name === 'btx-signup')).toBe(false);
  // a later page does not count it again
  await page.goto('/');
  await page.waitForTimeout(500);
  expect((await dataLayerEvents(page)).filter(([n]) => n === 'sign_up')).toEqual([]);
});
