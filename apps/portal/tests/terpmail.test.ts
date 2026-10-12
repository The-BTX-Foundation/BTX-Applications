import { describe, expect, it } from 'vitest';
import { terpmailError } from '@/lib/terpmail';

describe('Terpmail rule', () => {
  it('accepts a Terpmail address in any case, with spaces around it', () => {
    expect(terpmailError('ecoleman@terpmail.umd.edu', [])).toBeNull();
    expect(terpmailError('  Ebony@Terpmail.UMD.edu ', [])).toBeNull();
  });
  it('asks for an address when empty', () => {
    expect(terpmailError('', [])).toBe('Enter your Terpmail address.');
  });
  it('rejects other addresses and look-alikes', () => {
    for (const bad of ['a@gmail.com', 'a@umd.edu', 'a@terpmail.umd.edu.evil.com', 'a@b@terpmail.umd.edu', 'terpmail.umd.edu']) {
      expect(terpmailError(bad, [])).toMatch(/Terpmail/);
    }
  });
  it('lets allow-listed test addresses skip the rule, and only those', () => {
    expect(terpmailError('tester@example.com', ['tester@example.com'])).toBeNull();
    expect(terpmailError('other@example.com', ['tester@example.com'])).not.toBeNull();
  });
});
