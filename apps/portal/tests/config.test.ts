import { describe, expect, it } from 'vitest';
import { CODE_LIFETIME_MINUTES, parseTestEmails } from '@/lib/config';

describe('config', () => {
  it('a sign-in code works for 10 minutes everywhere', () => {
    expect(CODE_LIFETIME_MINUTES).toBe(10);
  });
  it('splits the test-address list, trimmed and lower-cased, keeping +tags', () => {
    expect(parseTestEmails(' A@x.com, +Apply ,,')).toEqual(['a@x.com', '+apply']);
    expect(parseTestEmails(undefined)).toEqual([]);
  });
});
