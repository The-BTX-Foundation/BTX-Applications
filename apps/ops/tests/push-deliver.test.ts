import { describe, expect, it } from 'vitest';
import { deliverPush, type PushItem } from '@btx/push';

// An in-memory stand-in for the three database calls the delivery makes.
function fakeDb(devices: { id: string; user_id: string; token: string }[]) {
  const log: { id: number; user_id: string; key: string; title: string; result?: string }[] = [];
  const disabled: string[] = [];
  let next = 1;
  const db = {
    log,
    disabled,
    from(table: string) {
      if (table === 'ops_push_devices') {
        return {
          select: () => ({ in: (_c: string, ids: string[]) => ({ is: async () => ({ data: devices.filter((d) => ids.includes(d.user_id) && !disabled.includes(d.id)), error: null }) }) }),
          update: () => ({ in: async (_c: string, ids: string[]) => { disabled.push(...ids); return { error: null }; } }),
        };
      }
      return {
        insert: (row: { user_id: string; key: string; title: string }) => ({
          select: () => ({
            single: async () => {
              if (log.some((l) => l.user_id === row.user_id && l.key === row.key)) return { data: null, error: { code: '23505', message: 'duplicate' } };
              const entry = { id: next++, ...row };
              log.push(entry);
              return { data: { id: entry.id }, error: null };
            },
          }),
        }),
        update: (patch: { result: string }) => ({ eq: async (_c: string, id: number) => { Object.assign(log.find((l) => l.id === id)!, patch); return { error: null }; } }),
        delete: () => ({ eq: async (_c: string, id: number) => { log.splice(log.findIndex((l) => l.id === id), 1); return { error: null }; } }),
      };
    },
  };
  return db;
}

const item = (over: Partial<PushItem> = {}): PushItem => ({ userId: 'u1', key: 'k1', title: 'Interview booked', body: 'Applicant 15 · Tue Nov 10, 6:00 PM', url: '/scholarships/interviews', ...over });
const phone = { id: 'd1', user_id: 'u1', token: 'a'.repeat(64) };

describe('deliverPush', () => {
  it('sends nothing and reserves nothing when the Apple key is not set', async () => {
    const db = fakeDb([phone]);
    const s = await deliverPush(db, [item()], { env: {} });
    expect(s.configured).toBe(false);
    expect(db.log).toHaveLength(0);
  });
  it('sends once and logs it; the same push again is skipped', async () => {
    const db = fakeDb([phone]);
    const sent: unknown[] = [];
    const send = async (token: string, n: unknown) => { sent.push([token, n]); return { result: 'delivered' as const, detail: 'ok' }; };
    expect((await deliverPush(db, [item()], { send })).delivered).toBe(1);
    expect((await deliverPush(db, [item()], { send })).skipped).toBe(1);
    expect(sent).toHaveLength(1);
    expect(db.log[0]).toMatchObject({ user_id: 'u1', key: 'k1', result: 'delivered' });
  });
  it('skips a person with no phone without logging', async () => {
    const db = fakeDb([]);
    const s = await deliverPush(db, [item()], { send: async () => ({ result: 'delivered', detail: '' }) });
    expect(s.noDevice).toBe(1);
    expect(db.log).toHaveLength(0);
  });
  it('gives the reservation back when Apple says try later, so a later run can retry', async () => {
    const db = fakeDb([phone]);
    const s = await deliverPush(db, [item()], { send: async () => ({ result: 'retry', detail: 'apns 500' }) });
    expect(s.retry).toBe(1);
    expect(db.log).toHaveLength(0);
  });
  it('retires a phone Apple says is gone', async () => {
    const db = fakeDb([phone]);
    const s = await deliverPush(db, [item()], { send: async () => ({ result: 'dead', detail: 'apns 410 Unregistered' }) });
    expect(s.retired).toBe(1);
    expect(db.disabled).toEqual(['d1']);
  });
  it('counts a push delivered when at least one of the person\'s phones got it', async () => {
    const db = fakeDb([phone, { id: 'd2', user_id: 'u1', token: 'b'.repeat(64) }]);
    const s = await deliverPush(db, [item()], { send: async (t) => (t.startsWith('a') ? { result: 'delivered', detail: '' } : { result: 'dead', detail: 'gone' }) });
    expect(s.delivered).toBe(1);
    expect(db.disabled).toEqual(['d2']);
  });
  it('enforces two rows on whatever it is given', async () => {
    const db = fakeDb([phone]);
    const seen: { title: string; body?: string }[] = [];
    await deliverPush(db, [item({ title: 'T'.repeat(90), body: 'line one\nline two ' + 'x'.repeat(200) })], { send: async (_t, n) => { seen.push(n); return { result: 'delivered', detail: '' }; } });
    expect(seen[0].title.length).toBeLessThanOrEqual(40);
    expect(seen[0].body!.length).toBeLessThanOrEqual(60);
    expect(seen[0].body).not.toMatch(/\n/);
  });
  it('never throws when the database errors', async () => {
    const broken = { from: () => ({ select: () => ({ in: () => ({ is: async () => ({ data: null, error: { message: 'boom' } }) }) }) }) };
    const s = await deliverPush(broken, [item()], { send: async () => ({ result: 'delivered', detail: '' }) });
    expect(s.failed).toBe(1);
  });
});
