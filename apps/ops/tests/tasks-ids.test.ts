import { describe, expect, it } from 'vitest';
import { commentKey, isDuplicate, newId, retryIds, RETRY_MS, taskKey } from '@/lib/tasks-ids';

// A counter in place of random ids, so reuse is visible.
const counter = () => {
  let n = 0;
  return () => `id-${++n}`;
};

describe('retry ids', () => {
  it('a retry of the same payload reuses the failed attempt id', () => {
    const r = retryIds(counter());
    const k = taskKey('Call the venue', 'outreach', '2026-11-12', 'me');
    const a = r.take(k, 0);
    r.fail(k, a, 0);
    expect(r.take(k, 60_000)).toBe(a);
  });
  it('a different payload gets a new id', () => {
    const r = retryIds(counter());
    const k = taskKey('Call the venue', 'outreach', null, 'me');
    const a = r.take(k, 0);
    r.fail(k, a, 0);
    expect(r.take(taskKey('Call the venue', 'outreach', '2026-11-12', 'me'), 1000)).not.toBe(a);
    expect(r.take(commentKey('t1', 'Done', 'me'), 1000)).not.toBe(a);
  });
  it('the memory expires after two minutes', () => {
    const r = retryIds(counter());
    const k = commentKey('t1', 'Sent the link', 'me');
    const a = r.take(k, 0);
    r.fail(k, a, 0);
    expect(r.take(k, RETRY_MS - 1)).toBe(a);
    expect(r.take(k, RETRY_MS)).not.toBe(a);
  });
  it('a success forgets the payload, so the same words typed again make a new row', () => {
    const r = retryIds(counter());
    const k = taskKey('A', 'money', null, 'me');
    const a = r.take(k, 0);
    r.fail(k, a, 0);
    r.done(k);
    expect(r.take(k, 10)).not.toBe(a);
  });
});

describe('isDuplicate', () => {
  it('counts only the unique-key clash (23505) as "already there"', () => {
    expect(isDuplicate({ code: '23505', message: 'duplicate key' })).toBe(true);
    expect(isDuplicate({ code: '42501' })).toBe(false);
    expect(isDuplicate(null)).toBe(false);
    expect(isDuplicate('23505')).toBe(false);
  });
});

describe('newId', () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
  it('uses randomUUID when the browser has it', () => {
    expect(newId({ randomUUID: () => 'from-random-uuid', getRandomValues: <T,>(b: T) => b })).toBe('from-random-uuid');
  });
  it('builds a v4 UUID from getRandomValues when randomUUID is missing', () => {
    const fill = <T extends ArrayBufferView | null>(b: T): T => {
      if (b) new Uint8Array(b.buffer).fill(0xff);
      return b;
    };
    expect(newId({ getRandomValues: fill })).toMatch(V4);
    expect(newId({ getRandomValues: <T,>(b: T) => b })).toMatch(V4);
    expect(newId()).toMatch(V4);
  });
});

describe('forget (the refresh listed the id)', () => {
  it('a remembered id the board now shows is forgotten, so the same words on purpose make a new task', () => {
    const r = retryIds(counter());
    const k = taskKey('Call Sam', 'outreach', null, 'me');
    const a = r.take(k, 0);
    r.fail(k, a, 0);
    r.forget(['other', a]);
    expect(r.take(k, 1000)).not.toBe(a);
  });
  it('leaves other payloads alone', () => {
    const r = retryIds(counter());
    const k = taskKey('Call Sam', 'outreach', null, 'me');
    const a = r.take(k, 0);
    r.fail(k, a, 0);
    r.forget(['unrelated']);
    expect(r.take(k, 1000)).toBe(a);
  });
});
