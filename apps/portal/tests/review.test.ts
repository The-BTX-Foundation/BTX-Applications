import { afterEach, describe, expect, it, vi } from 'vitest';
import RaykenReview from '@/app/RaykenReview';
import { REVIEW_PROJECT } from '@/lib/config';
import { holdsReviewPass } from '@/lib/analytics-client';
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
