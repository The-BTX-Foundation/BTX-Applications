import { describe, expect, it } from 'vitest';
import { isTestApplication } from '@/lib/test-application';

describe('isTestApplication', () => {
  it('is false for Terpmail addresses, in any case and with spaces', () => {
    expect(isTestApplication('ada@terpmail.umd.edu')).toBe(false);
    expect(isTestApplication('  Ada.Okafor@TERPMAIL.UMD.EDU ')).toBe(false);
  });
  it('is true for any other address', () => {
    expect(isTestApplication('dania+apply@gmail.com')).toBe(true);
    expect(isTestApplication(' Name+Apply@Gmail.com ')).toBe(true);
    expect(isTestApplication('someone@umd.edu')).toBe(true);
    expect(isTestApplication('x@terpmail.umd.edu.evil.com')).toBe(true);
  });
  it('is false when there is no email', () => {
    expect(isTestApplication(null)).toBe(false);
    expect(isTestApplication(undefined)).toBe(false);
    expect(isTestApplication('')).toBe(false);
    expect(isTestApplication('   ')).toBe(false);
  });
});
