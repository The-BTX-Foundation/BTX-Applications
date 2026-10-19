// The analytics rules (lib/analytics.ts): clean page addresses, the event and parameter allow-lists, the filter on
// every Google hit, and who counts as staff. The browser end-to-end check is e2e/analytics.spec.ts.
import { describe, expect, it } from 'vitest';
import { isFirstSignIn } from '@btx/data';
import {
  cleanLocation,
  cleanParams,
  cleanPath,
  cleanReferrer,
  hitKind,
  isStaffOrTester,
  measurementId,
  scrubHit,
  stepNumber,
} from '@/lib/analytics';

const ORIGIN = 'https://apply.thebtxfoundation.org';
const COLLECT = 'https://region1.google-analytics.com/g/collect';

// Builds a GA4 hit address from fields, the way gtag.js does.
const hit = (fields: Record<string, string>) => `${COLLECT}?${new URLSearchParams({ v: '2', tid: 'G-TEST0PORTAL', ...fields })}`;
// Reads a cleaned hit back into its address fields and body lines.
const read = (out: { url: string; body: string | null } | null) => ({
  url: out ? Object.fromEntries(new URL(out.url).searchParams) : null,
  lines: out?.body ? out.body.split(/\r?\n/).map((l) => Object.fromEntries(new URLSearchParams(l))) : [],
});

describe('measurementId', () => {
  it('accepts a well-formed GA4 id and refuses anything else', () => {
    expect(measurementId('G-ABC123XYZ')).toBe('G-ABC123XYZ');
    expect(measurementId(' G-ABC123XYZ ')).toBe('G-ABC123XYZ');
    expect(measurementId('UA-12345-1')).toBe('');
    expect(measurementId('G-abc')).toBe('');
    expect(measurementId('')).toBe('');
  });

  it("defaults to the website's property", () => {
    expect(measurementId()).toBe(process.env.NEXT_PUBLIC_GA_ID || 'G-36BN7DJ7DN');
  });
});

describe('page addresses', () => {
  it('reports only known paths; anything else, an id in the path included, is /other', () => {
    expect(cleanPath('/apply/review')).toBe('/apply/review');
    expect(cleanPath('/apply/review/')).toBe('/apply/review');
    expect(cleanPath('/')).toBe('/');
    expect(cleanPath('/status/interview/8f14e45f-ceea-467a-9b36-3f0b1c2d4e5f')).toBe('/other');
    expect(cleanPath('/apply/APP-2026-00016')).toBe('/other');
  });

  it('drops every query parameter but well-formed campaign tags, and the fragment', () => {
    expect(cleanLocation(`${ORIGIN}/sign-in?next=%2Fapply%2Freview&error=link&demo=1#access_token=abc`)).toBe(`${ORIGIN}/sign-in`);
    expect(cleanLocation(`${ORIGIN}/?utm_source=Instagram&utm_medium=social&_gl=1*abc&id=APP-1`)).toBe(
      `${ORIGIN}/?utm_source=instagram&utm_medium=social`,
    );
    // a campaign tag holding an address, a sentence or an id is dropped, and so are utm_content and utm_term
    expect(cleanLocation(`${ORIGIN}/?utm_campaign=jane.doe%40terpmail.umd.edu&utm_source=hello%20there`)).toBe(`${ORIGIN}/`);
    expect(cleanLocation(`${ORIGIN}/?utm_campaign=fall-2026-legacy&utm_content=sub-1a2b3c4d&utm_term=x`)).toBe(
      `${ORIGIN}/?utm_campaign=fall-2026-legacy`,
    );
    expect(cleanLocation(`${ORIGIN}/?utm_source=list-8f14e45fceea&utm_medium=u-12345678&utm_campaign=2026-11`)).toBe(
      `${ORIGIN}/?utm_campaign=2026-11`,
    );
    // source and medium must be one of BTX's own values
    expect(cleanLocation(`${ORIGIN}/?utm_source=janedoe&utm_medium=jane-doe-2027&utm_campaign=bio`)).toBe(`${ORIGIN}/?utm_campaign=bio`);
    expect(cleanLocation(`${ORIGIN}/?utm_source=newsletter&utm_medium=email`)).toBe(`${ORIGIN}/?utm_source=newsletter&utm_medium=email`);
    expect(cleanLocation('data:text/calendar,UID:slot-1')).toBe('');
    expect(cleanLocation('not a url')).toBe('');
  });

  it('cuts another site to its origin and cleans a Portal referrer', () => {
    expect(cleanReferrer('https://thebtxfoundation.org/apply/?ref=newsletter', ORIGIN)).toBe('https://thebtxfoundation.org/');
    expect(cleanReferrer('https://mail.google.com/mail/u/0/#inbox/FMfcgz', ORIGIN)).toBe('https://mail.google.com/');
    expect(cleanReferrer(`${ORIGIN}/sign-in?next=%2Fstatus`, ORIGIN)).toBe(`${ORIGIN}/sign-in`);
    expect(cleanReferrer('', ORIGIN)).toBe('');
  });

  it('numbers the five application steps', () => {
    expect([1, 2, 3, 4, 5].map((n) => stepNumber(['/apply/basic-info', '/apply/scholarship', '/apply/short-answers', '/apply/documents', '/apply/review'][n - 1]))).toEqual([1, 2, 3, 4, 5]);
    expect(stepNumber('/apply/start')).toBe(0);
    expect(stepNumber('/other')).toBe(0);
  });
});

describe('our own events', () => {
  it('refuses events that are not on the allow-list', () => {
    expect(cleanParams('form_submit', {})).toBeNull();
    expect(cleanParams('page_view', {})).toBeNull();
    expect(cleanParams('application_submit', {})).toEqual({});
  });

  it('drops denied names, unknown names and values outside the rules', () => {
    expect(
      cleanParams('sign_in_error', { code: 'code_wrong', email: 'jane@terpmail.umd.edu', name: 'Jane', extra: 'x' }),
    ).toEqual({ code: 'code_wrong' });
    expect(cleanParams('sign_in_error', { code: 'jane@terpmail.umd.edu' })).toEqual({});
    expect(cleanParams('sign_up', { method: 'email_link' })).toEqual({ method: 'email_link' });
    expect(cleanParams('application_step', { step_number: 3, step_name: 'short_answers', application_id: 'abc' })).toEqual({
      step_number: 3,
      step_name: 'short_answers',
    });
    expect(cleanParams('application_step', { step_number: 9, step_name: 'essay' })).toEqual({});
    expect(cleanParams('application_step', { step_number: 2.5 })).toEqual({});
  });
});

describe('the hit filter', () => {
  it('leaves requests to anyone but Google alone, and sends nothing to advertising hosts', () => {
    expect(scrubHit('https://awiaebtqalcmfafvktwh.supabase.co/rest/v1/applications?id=eq.1', null, ORIGIN)).toEqual({
      url: 'https://awiaebtqalcmfafvktwh.supabase.co/rest/v1/applications?id=eq.1',
      body: null,
    });
    expect(hitKind('https://www.google.com/g/collect?en=page_view', ORIGIN)).toBe('blocked');
    expect(scrubHit('https://www.google.com/g/collect?en=page_view', null, ORIGIN)).toBeNull();
    expect(scrubHit('https://stats.g.doubleclick.net/g/collect?v=2', null, ORIGIN)).toBeNull();
    expect(hitKind(`${COLLECT}?v=2`, ORIGIN)).toBe('analytics');
    // analytics.google.com would carry the student's Google account cookies
    expect(hitKind('https://region1.analytics.google.com/g/collect?v=2', ORIGIN)).toBe('blocked');
    // a trailing dot is the same host
    expect(hitKind('https://www.google.com./g/collect?v=2', ORIGIN)).toBe('blocked');
    expect(hitKind('https://region1.google-analytics.com./g/collect?v=2', ORIGIN)).toBe('analytics');
    // other Google services are not measurement, and relative addresses are this site
    expect(hitKind('https://accounts.google.com/o/oauth2', ORIGIN)).toBe('other');
    expect(hitKind('/apply/review', ORIGIN)).toBe('other');
  });

  it('lets only the tag script through on the tag host, with its id and loader fields', () => {
    expect(scrubHit('https://www.googletagmanager.com/gtag/js?id=G-36BN7DJ7DN&l=dataLayer&dl=https%3A%2F%2Fx', null, ORIGIN)).toEqual({
      url: 'https://www.googletagmanager.com/gtag/js?id=G-36BN7DJ7DN&l=dataLayer',
      body: null,
    });
    expect(scrubHit(`https://www.googletagmanager.com/a?id=G-1&dl=${encodeURIComponent(ORIGIN)}%2Fstatus&u=x`, null, ORIGIN)).toBeNull();
    expect(scrubHit('https://www.googletagmanager.com/static/service_worker/x/sw_iframe.html', null, ORIGIN)).toBeNull();
    expect(scrubHit('https://www.googletagmanager.com/gtag/js?id=G-1', 'body', ORIGIN)).toBeNull();
  });

  it('rebuilds every hit from known fields: hashed user data, unknown fields and repeated event names never pass', () => {
    const out = read(
      scrubHit(
        hit({
          en: 'user_engagement',
          cid: '1.2',
          sid: '3',
          _et: '5',
          dl: `${ORIGIN}/apply/review`,
          em: 'tv.1~em.0a1b2c',
          zz: 'apply.thebtxfoundation.org/status?email=jane@terpmail.umd.edu',
          gtm: 'a/b',
        }),
        'en=page_view&ep.btx_page_view=1&em=tv.1~em.0a1b2c&ep.content_group=portal_apply\nen=scroll&en=click&ep.link_url=x\nen=user_engagement&_et=1&ul=jane%40x.com',
        ORIGIN,
      ),
    );
    expect(out.url).toEqual({ v: '2', tid: 'G-TEST0PORTAL', en: 'user_engagement', cid: '1.2', sid: '3', _et: '5', dl: `${ORIGIN}/apply/review` });
    expect(out.lines).toEqual([{ en: 'page_view', 'ep.content_group': 'portal_apply' }, { en: 'user_engagement', _et: '1' }]);
    // only the first value of a repeated field counts
    expect(read(scrubHit(`${COLLECT}?v=2&en=user_engagement&cid=1.2&cid=jane%40x.com`, null, ORIGIN)).url).toEqual({
      v: '2',
      en: 'user_engagement',
      cid: '1.2',
    });
    expect(scrubHit(`${COLLECT}?v=2&en=user_engagement&en=click&ep.link_url=x`, null, ORIGIN)).toBeNull();
  });

  it("drops Google's automatic link, download and form events", () => {
    for (const en of ['click', 'file_download', 'form_start', 'form_submit', 'view_search_results', 'video_start']) {
      expect(scrubHit(hit({ en, dl: `${ORIGIN}/status`, 'ep.link_url': 'https://meet.example.com/abc-defg?pwd=1' }), null, ORIGIN)).toBeNull();
    }
  });

  it('cleans the page address, referrer and title of an allowed hit, and drops user ids and properties', () => {
    const out = read(
      scrubHit(
        hit({
          en: 'page_view',
          dl: `${ORIGIN}/status/interview/8f14e45f?slot=99&email=jane%40terpmail.umd.edu`,
          dr: `${ORIGIN}/sign-in?next=%2Fstatus`,
          dt: 'Jane Doe | The BTX Foundation',
          uid: 'user-123',
          'up.school': 'UMD',
          'ep.content_group': 'portal_status',
          'ep.page_path': '/status/interview/8f14e45f',
          'ep.btx_page_view': '1',
        }),
        null,
        ORIGIN,
      ),
    );
    expect(out.url).toMatchObject({ en: 'page_view', dl: `${ORIGIN}/other`, dr: `${ORIGIN}/sign-in`, dt: 'Other page', 'ep.content_group': 'portal_status' });
    expect(out.url).not.toHaveProperty('uid');
    expect(out.url).not.toHaveProperty('up.school');
    expect(out.url).not.toHaveProperty('ep.page_path');
    // the page-view mark is removed once checked
    expect(out.url).not.toHaveProperty('ep.btx_page_view');
  });

  it("drops a page view the Portal did not send itself (the tag's own history-change page view)", () => {
    expect(scrubHit(hit({ en: 'page_view', dl: `${ORIGIN}/apply/review` }), null, ORIGIN)).toBeNull();
    expect(read(scrubHit(hit({ dl: `${ORIGIN}/apply/review` }), 'en=page_view\nen=page_view&ep.btx_page_view=1', ORIGIN)).lines).toEqual([
      { en: 'page_view' },
    ]);
  });

  it('filters a batch line by line, and keeps allowed body events when the address names a dropped one', () => {
    const body = [
      'en=sign_in_error&ep.code=code_wrong&ep.email=jane%40terpmail.umd.edu',
      'en=click&ep.link_url=https%3A%2F%2Fmeet.example.com%2Fabc',
      'en=application_step&epn.step_number=3&ep.step_name=short_answers&ep.application_id=abc',
      'en=application_step&epn.step_number=12&ep.step_name=essay',
      'ep.orphan=1',
    ].join('\r\n');
    const out = read(scrubHit(hit({ en: 'file_download', 'ep.file_name': 'transcript-jane.pdf', dl: `${ORIGIN}/apply/documents` }), body, ORIGIN));
    expect(out.url).not.toHaveProperty('en');
    expect(out.url).not.toHaveProperty('ep.file_name');
    expect(out.url?.dl).toBe(`${ORIGIN}/apply/documents`);
    expect(out.lines).toEqual([
      { en: 'sign_in_error', 'ep.code': 'code_wrong' },
      { en: 'application_step', 'epn.step_number': '3', 'ep.step_name': 'short_answers' },
      { en: 'application_step' },
    ]);
  });

  it('drops an analytics hit left with no allowed event', () => {
    expect(scrubHit(hit({ dl: `${ORIGIN}/` }), 'en=click&ep.link_url=x\nen=form_start', ORIGIN)).toBeNull();
  });
});

describe('who is measured', () => {
  it('treats staff roles and non-Terpmail test addresses as staff', () => {
    expect(isStaffOrTester({ email: 'kelsey@thebtxfoundation.org', app_metadata: { role: 'admin' } })).toBe(true);
    expect(isStaffOrTester({ email: 'someone@terpmail.umd.edu', app_metadata: { role: 'board' } })).toBe(true);
    expect(isStaffOrTester({ email: 'dominick+apply@example.com', app_metadata: {} })).toBe(true);
    expect(isStaffOrTester({ email: 'student@terpmail.umd.edu', app_metadata: {} })).toBe(false);
    expect(isStaffOrTester(null)).toBe(false);
  });

  it('counts a sign-in as a new account only when it is the first one (confirmation at first sign-in, as in production)', () => {
    // asked for a code at 13:55, typed it at 14:00: confirmed and signed in at the same moment
    const first = { created_at: '2026-10-19T13:55:00Z', email_confirmed_at: '2026-10-19T14:00:00.120Z', last_sign_in_at: '2026-10-19T14:00:00.130Z' };
    expect(isFirstSignIn(first)).toBe(true);
    expect(isFirstSignIn({ ...first, email_confirmed_at: '2026-09-01T10:00:00Z' })).toBe(false);
    expect(isFirstSignIn({ ...first, email_confirmed_at: null })).toBe(false);
    expect(isFirstSignIn(null)).toBe(false);
  });

  it('counts a slow first sign-in when the project confirms emails automatically (the local stack)', () => {
    // auto-confirmed when the code was asked for, at 13:55; signed in four minutes later
    const auto = { created_at: '2026-10-19T13:55:00Z', email_confirmed_at: '2026-10-19T13:55:00.400Z', last_sign_in_at: '2026-10-19T13:59:10Z' };
    expect(isFirstSignIn(auto)).toBe(true);
    expect(isFirstSignIn({ ...auto, last_sign_in_at: '2026-10-21T09:00:00Z' })).toBe(false);
  });
});
