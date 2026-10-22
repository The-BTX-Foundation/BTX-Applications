import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import path from 'node:path';

// Analytics end to end, with the real Google tag on the production address: gtag.js for the real property
// (G-36BN7DJ7DN, set in playwright.config.ts) is fetched from Google, so the property's own automatic events (link
// clicks, forms, downloads, history page views, scroll) run as they will live.
//
// The browser resolves apply.thebtxfoundation.org to this machine, so the Portal's own production-host rule decides
// to load the tag. Every request to Google's analytics and advertising hosts is answered here with an empty 204 and
// never leaves the machine, and so is every request to the tag's host except the tag script itself; as a second wall
// the collect and ad hosts don't resolve at all. What the tests read is what the browser tried to send: the dataLayer,
// and every request to a Google host from any page, frame or worker of the context.
//
// Marker values (CANARY) are typed into every field and put into addresses and referrers. None may appear anywhere
// Google could see it, plain, encoded or hashed (security-playbook IN-51). The rules themselves are unit-tested in
// tests/analytics.test.ts.

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
// What GA4's user-provided data would send: SHA-256 of the normalized email and phone. Base64 of the email too.
const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');
const MARKERS = [
  'zqcanary',
  '3015550199',
  '301-555-0199',
  sha256(CANARY.email),
  sha256(CANARY.badEmail),
  sha256(`+1${CANARY.phone}`),
  sha256(CANARY.phone),
  Buffer.from(CANARY.email).toString('base64').replace(/=+$/, '').toLowerCase(),
];

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

// A GA4 collect path or the tag's service-worker frame, on any host (server-side and first-party tagging included).
const MEASUREMENT_PATH = /(\/g\/collect|\/g\/s\/collect|\/ga\/g\/c|\/ag\/g\/c|\/mc\/collect|\/_\/service_worker|sw_iframe)/;

// Records every request the context makes (pages, frames and service workers) to a Google host or to a measurement path
// on any host, and answers every Google one locally (204) except the tag script, which is fetched from Google.
async function watchGoogle(context: BrowserContext) {
  const sent: Sent[] = [];
  context.on('request', (req) => {
    const url = new URL(req.url());
    if (/google|doubleclick|\.goog$/i.test(url.hostname) || MEASUREMENT_PATH.test(url.pathname)) sent.push({ url: req.url(), body: req.postData() ?? '' });
  });
  await context.route(/^https:\/\/([^/]*\.)?(google-analytics\.com|analytics\.google\.com|google\.[a-z.]+|doubleclick\.net|googletagmanager\.com)\//, (route) =>
    /^https:\/\/www\.googletagmanager\.com\/gtag\/(js|destination)\?/.test(route.request().url()) ? route.continue() : route.fulfill({ status: 204, body: '' }),
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

// True for the Google tag's own page-change record (event "gtm.historyChange-v2"). The tag's history listener writes
// one on every client-side navigation, holding copies of history.state, where Next.js keeps its router state and the
// address's query string ("renderedSearch"). The record stays in the page: the tag reads it to decide on a history
// page view, which the hit filter drops, and the request checks below prove no part of it is sent. The location it
// copies is one the tag can already read from `location`, so skipping it hides nothing new. Seen 2026-10-22.
function isGoogleHistoryRecord(entry: unknown): boolean {
  const event = (entry as { event?: unknown } | null)?.event;
  return typeof event === 'string' && event.startsWith('gtm.historyChange');
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

test('the funnel events fire through the real Google tag and nothing an applicant typed leaves the browser', async ({ page, context }) => {
  const sent = await watchGoogle(context);

  // arrive from the website with markers in the referrer and the address
  await page.goto(`/?utm_source=newsletter&utm_campaign=fall-2026-legacy&utm_term=${CANARY.id}&id=${CANARY.id}`, {
    referer: `https://thebtxfoundation.org/apply/?email=${CANARY.email}&r=${CANARY.ref}`,
  });
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  await expect.poll(() => sent.some((s) => s.url.includes('googletagmanager.com/gtag/js')), { message: 'gtag.js requested' }).toBe(true);
  // wait until the tag is running, so its own listeners (history, clicks, forms) watch the whole funnel: the worst
  // case, every run (before 2026-10-22 the first click raced the tag, so a run sometimes left them out)
  await page.waitForFunction(() => Boolean((window as unknown as { google_tag_manager?: unknown }).google_tag_manager));
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
    ({ id, meet, emHash }) => {
      history.pushState({}, '', `/status/interview/${id}?slot=${id}`);
      const g = (window as unknown as { gtag: (...a: unknown[]) => void }).gtag;
      g('event', 'click', { link_url: `https://meet.example.com/${meet}`, link_domain: 'meet.example.com', outbound: true });
      g('event', 'page_view', { page_location: location.href, page_title: `${id} interview` });
      g('event', 'file_download', { link_url: `https://files.example.com/${id}/transcript.pdf`, file_name: `${meet}.pdf` });
      // every other way out the tag has, each with a raw hit: a 1x1 image (its retry when a beacon is refused, by
      // property and by attribute), a beacon, a Request object, XMLHttpRequest, a hidden Google frame, and fields no
      // rule knows: hashed user-provided data (em), an unknown field, a repeated event name
      const collect = 'https://www.google-analytics.com/g/collect?v=2&tid=G-36BN7DJ7DN&cid=1.1';
      const dirty = `dl=${encodeURIComponent(location.href)}&dt=${id}&em=tv.1~em.${emHash}&zz=${meet}`;
      new Image(1, 1).src = `${collect}&en=click&ep.link_url=https%3A%2F%2Fmeet.example.com%2F${meet}`;
      new Image(1, 1).src = `${collect}&en=scroll&epn.percent_scrolled=90&${dirty}`;
      new Image(1, 1).setAttribute('src', `${collect}&en=form_submit&ep.form_destination=${encodeURIComponent(location.href)}`);
      navigator.sendBeacon(`${collect}&${dirty}`, `en=click&ep.link_url=${meet}\nen=user_engagement&_et=5&${dirty}\nen=scroll&en=click&ep.link_url=${meet}`);
      void fetch(new Request(`${collect}&en=user_engagement&${dirty}`, { method: 'POST', body: meet }));
      // a first-party collect path (the Google tag gateway) is rebuilt like a hit to Google
      void fetch(`/ga/g/c?v=2&tid=G-36BN7DJ7DN&cid=1.1&en=user_engagement&_et=7&${dirty}`, { method: 'POST', body: `en=click&ep.link_url=${meet}` });
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${collect}&en=user_engagement&${dirty}`);
      xhr.send(meet);
      const frame = document.createElement('iframe');
      frame.src = `https://www.googletagmanager.com/static/service_worker/x/sw_iframe.html?origin=${encodeURIComponent(location.href)}`;
      document.body.appendChild(frame);
      const frame2 = document.createElement('iframe');
      frame2.setAttribute('src', `https://www.googletagmanager.com/static/service_worker/y/sw_iframe.html?id=${id}`);
      document.body.appendChild(frame2);
    },
    { id: CANARY.id, meet: CANARY.meet, emHash: sha256(CANARY.email) },
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
  // the image retry and the beacon went out rebuilt (not dropped), and no Google frame loaded
  expect(events.some((e) => e.en === 'scroll' && new URL(e.dl).pathname === '/other' && e.dt === 'Other page')).toBe(true);
  expect(events.some((e) => e.en === 'user_engagement' && e._et === '5' && new URL(e.dl).pathname === '/other')).toBe(true);
  expect(sent.some((s) => s.url.includes('sw_iframe'))).toBe(false);
  // only known technical fields left: no hashed user data, no unknown field, no event named twice
  for (const e of events) {
    expect(Object.keys(e).filter((k) => ['em', 'zz', 'uid', 'ep.form_destination', 'ep.link_url'].includes(k)), 'unknown fields').toEqual([]);
  }
  expect(sent.filter((s) => s.body.split(/\r?\n/).some((l) => new URLSearchParams(l).getAll('en').length > 1))).toEqual([]);
  // the first-party collect hit went out rebuilt, to this site, with the click line removed
  const gateway = sent.filter((s) => new URL(s.url).pathname === '/ga/g/c');
  expect(gateway.length).toBe(1);
  expect(Object.fromEntries(new URL(gateway[0].url).searchParams)).toMatchObject({ en: 'user_engagement', _et: '7' });
  expect(gateway[0].body).toBe('');
  // nothing went to the tag's host but the tag script
  expect(sent.filter((s) => /googletagmanager\.com/.test(s.url) && !/\/gtag\/(js|destination)\?/.test(s.url))).toEqual([]);
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

  // 4. no marker value anywhere: not in any request to a Google host, and not in the dataLayer outside the Google tag's
  // own page-change records (isGoogleHistoryRecord: a copy of history.state that stays in the page)
  for (const s of sent) expectNoMarkers(`request ${new URL(s.url).host}`, `${s.url}\n${s.body}`);
  (JSON.parse(dataLayer) as unknown[]).forEach((entry, i) => {
    if (!isGoogleHistoryRecord(entry)) expectNoMarkers(`dataLayer[${i}]`, JSON.stringify(entry));
  });
});

test('a browser that sends Global Privacy Control never loads the tag', async ({ page, context }) => {
  const sent = await watchGoogle(context);
  await page.addInitScript(() => Object.defineProperty(Navigator.prototype, 'globalPrivacyControl', { get: () => true }));
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  // events still land in the page's own dataLayer
  await expect.poll(async () => (await dataLayerEvents(page)).some(([n]) => n === 'page_view')).toBe(true);
  expect(sent).toEqual([]);
});

test('?analytics=off switches this browser off for good, and ?analytics=on back on', async ({ page, context }) => {
  const sent = await watchGoogle(context);
  await page.goto('/?analytics=off');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  await page.goto('/sign-in');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Sign in');
  await page.waitForTimeout(1000);
  expect(sent).toEqual([]);
  await page.goto('/?analytics=on');
  await expect.poll(() => sent.some((s) => s.url.includes('googletagmanager.com/gtag/js'))).toBe(true);
});

test('previews and local runs record events but never load the tag', async ({ page, context }) => {
  const sent = await watchGoogle(context);
  await page.goto(`${LOCAL}/`);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Legacy');
  await expect.poll(async () => (await dataLayerEvents(page)).some(([n]) => n === 'page_view')).toBe(true);
  await page.waitForTimeout(1000);
  expect(sent).toEqual([]);
});

test('an account created from the email link is counted once', async ({ page, context }) => {
  await watchGoogle(context);
  await context.addCookies([{ name: 'btx-signup', value: '1', url: PROD }]);
  await page.goto('/sign-in');
  await expect.poll(async () => (await dataLayerEvents(page)).filter(([n]) => n === 'sign_up')).toEqual([['sign_up', { method: 'email_link' }]]);
  expect((await context.cookies(PROD)).some((c) => c.name === 'btx-signup')).toBe(false);
  // a later page does not count it again
  await page.goto('/');
  await page.waitForTimeout(500);
  expect((await dataLayerEvents(page)).filter(([n]) => n === 'sign_up')).toEqual([]);
});
