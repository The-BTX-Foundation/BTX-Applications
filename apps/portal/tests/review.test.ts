import { afterEach, describe, expect, it, vi } from 'vitest';
import RaykenReview from '@/app/RaykenReview';
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
