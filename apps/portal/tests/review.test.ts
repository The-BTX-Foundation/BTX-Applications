import { afterEach, describe, expect, it, vi } from 'vitest';
import RaykenReview from '@/app/RaykenReview';
import { REVIEW_PROJECT } from '@/lib/config';
import { holdsReviewPass, isRealStudent } from '@/lib/review-pass';
import { reviewScreen } from '@/lib/review-screens';


describe('RaykenReview', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('renders nothing when NEXT_PUBLIC_RAYKEN_REVIEW is unset', () => {
    vi.stubEnv('NEXT_PUBLIC_RAYKEN_REVIEW', '');
    expect(RaykenReview()).toBeNull();
  });

  it('renders nothing for any value other than 1', () => {
    vi.stubEnv('NEXT_PUBLIC_RAYKEN_REVIEW', '0');
    expect(RaykenReview()).toBeNull();
  });

  it('renders the loader script when the value is 1', () => {
    vi.stubEnv('NEXT_PUBLIC_RAYKEN_REVIEW', '1');
    expect(RaykenReview()).not.toBeNull();
  });

  it("stamps the loader with the request's script nonce (Content-Security-Policy)", () => {
    vi.stubEnv('NEXT_PUBLIC_RAYKEN_REVIEW', '1');
    expect(RaykenReview({ nonce: 'abc123==' })?.props.nonce).toBe('abc123==');
  });

  it('wakes only on the live Portal, for the project analytics checks', () => {
    vi.stubEnv('NEXT_PUBLIC_RAYKEN_REVIEW', '1');
    const html: string = RaykenReview()?.props.dangerouslySetInnerHTML.__html;
    expect(html).toContain(`var P = "${REVIEW_PROJECT}"`);
    expect(html).toContain('H = ["apply.thebtxfoundation.org"]');
    expect(html).toContain('S = "https://review.raykendigital.com"');
  });
});

describe('holdsReviewPass', () => {
  const store = (v: string | null) => ({ getItem: () => v });

  it('is true when the loader stored a pass', () => {
    expect(holdsReviewPass(store('rrp_abcdefghijklmnopqrstu'), '')).toBe(true);
  });

  it("is true from the pass cookie when storage is empty or blocked", () => {
    const cookie = `a=1; rr_${REVIEW_PROJECT}=rrp_abcdefghijklmnopqrstu; b=2`;
    expect(holdsReviewPass(store(null), cookie)).toBe(true);
    expect(holdsReviewPass({ getItem: () => { throw new Error('blocked'); } }, cookie)).toBe(true);
    expect(holdsReviewPass(null, cookie)).toBe(true);
  });

  it('is false for everyone else', () => {
    expect(holdsReviewPass(store(null), '')).toBe(false);
    expect(holdsReviewPass(null, 'rr_other-project=rrp_abcdefghijklmnopqrstu; x=rr_btx-apply')).toBe(false);
  });
});

describe('reviewScreen', () => {
  it('names the main screens', () => {
    expect(reviewScreen('/')).toEqual({ screen: 'Landing page', routeKey: '/' });
    expect(reviewScreen('/apply/review')).toEqual({ screen: 'Application: review and submit', routeKey: '/apply/review' });
    expect(reviewScreen('/status/schedule/')).toEqual({ screen: 'Pick interview time', routeKey: '/status/schedule' });
  });

  it('generalizes unknown paths', () => {
    expect(reviewScreen('/something/jane@umd.edu')).toEqual({ screen: 'Other page', routeKey: '/[other]' });
  });
});

describe('the loader without a pass', () => {
  it('only opens IndexedDB when the review database already exists', () => {
    vi.stubEnv('NEXT_PUBLIC_RAYKEN_REVIEW', '1');
    const html: string = RaykenReview()?.props.dangerouslySetInnerHTML.__html;
    const last = html.trim().split('\n').slice(-3).join('\n');
    expect(last).toContain('indexedDB.databases().then(');
    expect(last).toContain('x.name == "rayken-review"');
    // the only indexedDB.open is inside db(), which the last line now calls only when the database exists
    expect(html.match(/indexedDB\.open\(/g)).toHaveLength(1);
  });
});

describe('isRealStudent (who the review pass is taken from)', () => {
  const allow = ['kearle624+apply@gmail.com', '+apply'];

  it('is a signed-in Terpmail applicant', () => {
    expect(isRealStudent({ email: 'jane@terpmail.umd.edu', app_metadata: { role: 'applicant' } }, allow)).toBe(true);
    expect(isRealStudent({ email: ' Jane@Terpmail.UMD.edu ' }, allow)).toBe(true);
  });

  it('is never nobody, staff, a non-Terpmail tester or an allow-listed Terpmail tester', () => {
    expect(isRealStudent(null, allow)).toBe(false);
    expect(isRealStudent(undefined, allow)).toBe(false);
    expect(isRealStudent({ email: 'kearle624+apply@gmail.com' }, allow)).toBe(false);
    expect(isRealStudent({ email: 'jane@terpmail.umd.edu', app_metadata: { role: 'board' } }, allow)).toBe(false);
    expect(isRealStudent({ email: 'jane@terpmail.umd.edu', app_metadata: { role: 'admin' } }, allow)).toBe(false);
    expect(isRealStudent({ email: 'intern+apply@terpmail.umd.edu' }, allow)).toBe(false);
  });

  it('treats a +tag Terpmail address as a student when the list has no tag entry', () => {
    expect(isRealStudent({ email: 'intern+apply@terpmail.umd.edu' }, ['kearle624+apply@gmail.com'])).toBe(true);
  });
});
