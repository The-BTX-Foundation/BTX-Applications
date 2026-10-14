import { afterEach, describe, expect, it, vi } from 'vitest';
import RaykenReview from '@/app/RaykenReview';
import { reviewScreen } from '@/lib/review-screens';
import { accountFromRoleText } from '@/lib/review-account';

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
});

describe('reviewScreen', () => {
  it('names the main screens', () => {
    expect(reviewScreen('/')).toEqual({ screen: 'Today', routeKey: '/' });
    expect(reviewScreen('/scholarships/interviews/availability')).toEqual({ screen: 'Interview availability', routeKey: '/scholarships/interviews/availability' });
  });

  it('generalizes the applicant code', () => {
    expect(reviewScreen('/scholarships/applicants/ABC123')).toEqual({ screen: 'Applicant detail', routeKey: '/scholarships/applicants/[code]' });
    expect(reviewScreen('/scholarships/applicants/ABC123/file/essay').routeKey).toBe('/scholarships/applicants/[code]/file/[kind]');
  });

  it('generalizes unknown paths', () => {
    expect(reviewScreen('/zzz/jane@umd.edu')).toEqual({ screen: 'Other page', routeKey: '/[other]' });
  });

  it('turns the role text into the account kind', () => {
    expect(accountFromRoleText('Admin rights')).toBe('Admin');
    expect(accountFromRoleText('Board member')).toBe('Board member');
  });
});
