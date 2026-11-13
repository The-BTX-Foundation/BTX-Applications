// The shell's signed-in name: the board profile's display name wins, then the sign-up name, then the email's first part.
import { describe, expect, it } from 'vitest';
import { initialsOf, pickDisplayName } from '@/lib/user';

describe('pickDisplayName', () => {
  it('prefers the board profile name', () => {
    expect(pickDisplayName('Dominick Littleton', 'Dom', 'dominicklittleton@x.org')).toBe('Dominick Littleton');
  });

  it('falls back to the sign-up name when there is no profile name', () => {
    expect(pickDisplayName(null, 'Dana Mercer', 'dana@x.org')).toBe('Dana Mercer');
    expect(pickDisplayName('   ', 'Dana Mercer', 'dana@x.org')).toBe('Dana Mercer');
  });

  it('falls back to the email only when no name exists anywhere', () => {
    expect(pickDisplayName(undefined, undefined, 'dana.mercer@x.org')).toBe('Dana Mercer');
    expect(pickDisplayName('', '', '')).toBe('BTX staff');
  });

  it('gives two-letter initials for a profile name', () => {
    expect(initialsOf(pickDisplayName('Dominick Littleton', null, 'x@x.org'))).toBe('DL');
  });
});
