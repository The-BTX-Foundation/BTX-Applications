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

import { TERPMAIL_REFUSAL, refusalIsTerpmail } from '@/lib/terpmail';
import { submitApplication } from '../../../packages/data/src/submit';
import { ensureApplication, isTerpmailRefusal } from '../../../packages/data/src/cycles';
import type { BtxClient } from '../../../packages/data/src/client';

describe('database refusal of non-Terpmail applicants', () => {
  it('uses the sign-in copy', () => {
    expect(TERPMAIL_REFUSAL).toBe('Use your Terpmail address, like yourname@terpmail.umd.edu.');
  });
  it('maps the submit_application refusal terpmail_required', async () => {
    const client = { rpc: async () => ({ data: null, error: { message: 'terpmail_required', code: '42501' } }) } as unknown as BtxClient;
    expect(await submitApplication(client, 'x')).toEqual({ ok: false, kind: 'terpmail_required' });
  });
  it('recognises the row-level-security refusal on starting a draft', () => {
    expect(isTerpmailRefusal({ code: '42501', message: 'new row violates row-level security policy for table "applications"' })).toBe(true);
    expect(isTerpmailRefusal({ message: 'new row violates row-level security policy' })).toBe(true);
    expect(isTerpmailRefusal({ code: '23505', message: 'duplicate key' })).toBe(false);
  });
  it('ensureApplication reports a refused draft insert', async () => {
    const cycle = { id: 'c1', status: 'published', opens_at: '2020-01-01T00:00:00Z', closes_at: '2099-01-01T00:00:00Z' };
    const client = {
      from: (table: string) =>
        table === 'cycles'
          ? { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: cycle, error: null }) }) }) }
          : {
              select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
              insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '42501', message: 'new row violates row-level security policy' } }) }) }),
            },
    } as unknown as BtxClient;
    expect(await ensureApplication(client)).toEqual({ kind: 'refused' });
  });
});

describe('which refusal it was', () => {
  it('shows the Terpmail copy only when the signed-in address fails the rule', () => {
    expect(refusalIsTerpmail('someone@gmail.com', [])).toBe(true);
    expect(refusalIsTerpmail('ecoleman@terpmail.umd.edu', [])).toBe(false); // the cycle closed, not her address
    expect(refusalIsTerpmail(null, [])).toBe(false);
    expect(refusalIsTerpmail('tester@example.com', ['tester@example.com'])).toBe(false);
  });
});
