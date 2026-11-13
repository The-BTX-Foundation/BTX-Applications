// The Newsletter section write (components/newsletter/newsletter-writes.ts): only the status, a time limit, and true only
// when exactly one row changed.
import { describe, expect, it, vi } from 'vitest';
vi.mock('@btx/data', () => ({ getBrowserClient: () => ({}) }));
import { setSectionStatus, type NlDb } from '@/components/newsletter/newsletter-writes';

// A stand-in client that records the call and answers with `res` (or throws).
function fake(res: { data: { id: string }[] | null; error: unknown } | Error) {
  const seen: Record<string, unknown> = {};
  const db: NlDb = {
    from: (t) => {
      seen.table = t;
      return {
        update: (v) => {
          seen.update = v;
          return {
            eq: (c, x) => {
              seen.eq = [c, x];
              return {
                select: (cols) => {
                  seen.select = cols;
                  return {
                    abortSignal: (s) => {
                      seen.signal = s;
                      return res instanceof Error ? Promise.reject(res) : Promise.resolve(res);
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { db, seen };
}

describe('setSectionStatus', () => {
  it('sends only the status and asks for the row back with a time limit', async () => {
    const { db, seen } = fake({ data: [{ id: 's1' }], error: null });
    expect(await setSectionStatus('s1', 'writing', db)).toBe(true);
    expect(seen).toMatchObject({ table: 'newsletter_sections', update: { status: 'writing' }, eq: ['id', 's1'], select: 'id' });
    expect(Object.keys(seen.update as object)).toEqual(['status']);
    expect(seen.signal).toBeInstanceOf(AbortSignal);
  });
  it('fails when no row changed (row-level security filtered it out)', async () => {
    expect(await setSectionStatus('s1', 'done', fake({ data: [], error: null }).db)).toBe(false);
  });
  it('fails on more than one row, an error, no data, or a throw (timeout)', async () => {
    expect(await setSectionStatus('s1', 'done', fake({ data: [{ id: 'a' }, { id: 'b' }], error: null }).db)).toBe(false);
    expect(await setSectionStatus('s1', 'done', fake({ data: [{ id: 's1' }], error: { message: 'no' } }).db)).toBe(false);
    expect(await setSectionStatus('s1', 'done', fake({ data: null, error: null }).db)).toBe(false);
    expect(await setSectionStatus('s1', 'done', fake(new Error('aborted')).db)).toBe(false);
  });
});
