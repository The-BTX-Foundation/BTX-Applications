import { describe, expect, it } from 'vitest';
import { safeNext } from '@/lib/safe-next';

describe('Ops safeNext', () => {
  it('allows same-site paths', () => {
    for (const ok of ['/', '/scholarships', '/scholarships/applicants?status=new', '/finance#budget', '/daily/tasks']) {
      expect(safeNext(ok)).toBe(ok);
    }
  });

  it('refuses other sites, the sign-in screen and the auth routes', () => {
    for (const bad of ['//evil.example', 'https://evil.example', 'evil.example', '/\\evil.example', '/sign-in', '/sign-in?next=/', '/auth/denied', '/auth/callback?code=x', '', null, undefined]) {
      expect(safeNext(bad), String(bad)).toBeUndefined();
    }
  });

  it('refuses control characters, which URL parsers drop (an open redirect via ?next=/%09/evil.example)', () => {
    for (const bad of ['/\t/evil.example', '/\n/evil.example', '/\r/evil.example', '/\t\t/evil.example', '/x\u0000', '/x\u007f']) {
      expect(safeNext(bad), JSON.stringify(bad)).toBeUndefined();
    }
    // what the decoded query value looks like, and why it matters: it would resolve to another site
    const decoded = new URLSearchParams('next=/%09/evil.example').get('next');
    expect(new URL(decoded!, 'https://ops.thebtxfoundation.org').host).toBe('evil.example');
    expect(safeNext(decoded)).toBeUndefined();
  });

  it('checks the cleaned-up path, so dot segments cannot reach the sign-in screen or auth routes', () => {
    expect(safeNext('/./sign-in')).toBeUndefined();
    expect(safeNext('/x/../auth/denied')).toBeUndefined();
  });

  it('ignores anything that is not one string (a repeated ?next= arrives as an array)', () => {
    expect(safeNext(['/finance', '/scholarships'])).toBeUndefined();
    expect(safeNext(42)).toBeUndefined();
  });
});
