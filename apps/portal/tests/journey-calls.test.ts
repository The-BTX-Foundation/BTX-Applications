import { describe, expect, it } from 'vitest';
import {
  fetchFreeTimes, fetchMyDecision, fetchMyInterview, fetchOpenSlots, fetchStory, parseDecision, parseInterview, photoPath, photoUrl, saveFreeTimes, saveStory, uploadAwardPhoto,
} from '../../../packages/data/src/journey';
import { bookSlot } from '../../../packages/data/src/booking';
import type { BtxClient } from '../../../packages/data/src/client';

// A stand-in client that records what it was asked and answers the rpc with the given result.
function rpcClient(result: { data?: unknown; error?: { message: string; code?: string } }) {
  const calls: { fn: string; args: unknown }[] = [];
  const client = {
    rpc: async (fn: string, args: unknown) => {
      calls.push({ fn, args });
      return { data: result.data ?? null, error: result.error ?? null };
    },
  } as unknown as BtxClient;
  return { client, calls };
}

// A stand-in for from(table): records upserts and answers selects with a row.
function tableClient(row: unknown, error: unknown = null) {
  const log: { table: string; op: string; payload?: unknown; opts?: unknown }[] = [];
  const client = {
    from: (table: string) => ({
      select: (cols: string) => ({
        eq: (col: string, val: string) => ({
          maybeSingle: async () => {
            log.push({ table, op: `select ${cols} where ${col}=${val}` });
            return { data: row, error };
          },
        }),
      }),
      upsert: async (payload: unknown, opts: unknown) => {
        log.push({ table, op: 'upsert', payload, opts });
        return { error };
      },
    }),
  } as unknown as BtxClient;
  return { client, log };
}

describe('open times', () => {
  it('calls open_interview_slots with the cycle and maps the rows', async () => {
    const { client, calls } = rpcClient({ data: [{ id: 's1', starts_at: '2026-10-06T22:00:00Z', ends_at: '2026-10-06T22:30:00Z' }] });
    expect(await fetchOpenSlots(client, 'c1')).toEqual([{ id: 's1', startsAt: '2026-10-06T22:00:00Z', endsAt: '2026-10-06T22:30:00Z' }]);
    expect(calls).toEqual([{ fn: 'open_interview_slots', args: { p_cycle_id: 'c1' } }]);
  });
  it('returns null when the read fails (the page shows the load error)', async () => {
    expect(await fetchOpenSlots(rpcClient({ error: { message: 'x' } }).client, 'c1')).toBeNull();
  });
});

describe('her interview', () => {
  const json = { slotId: 's1', startsAt: '2026-10-06T22:00:00Z', endsAt: '2026-10-06T22:30:00Z', interviewers: ['Kelsey Davis', 'Tomi Falodun'], videoUrl: 'https://meet.example/x' };
  it('reads time, interviewers and video link', async () => {
    const { client, calls } = rpcClient({ data: json });
    expect(await fetchMyInterview(client, 'c1')).toEqual({ failed: false, interview: json });
    expect(calls[0]).toEqual({ fn: 'my_interview', args: { p_cycle_id: 'c1' } });
  });
  it('is null when she holds no time, and tolerates no pairing yet', () => {
    expect(parseInterview(null)).toBeNull();
    expect(parseInterview({ slotId: 's', startsAt: 'a', endsAt: 'b', interviewers: [], videoUrl: null })).toEqual({ slotId: 's', startsAt: 'a', endsAt: 'b', interviewers: [], videoUrl: null });
  });
});

describe('her decision (null until released)', () => {
  it('is null before the decisions are released', async () => {
    const { client, calls } = rpcClient({ data: null });
    expect(await fetchMyDecision(client, 'c1')).toEqual({ failed: false, decision: null });
    expect(calls[0]).toEqual({ fn: 'my_decision', args: { p_cycle_id: 'c1' } });
  });
  it('reads won and not-picked', () => {
    expect(parseDecision({ kind: 'won', awardId: 'a1', awardName: 'Legacy', amountCents: 200000, storySent: false })).toEqual({
      kind: 'won', awardId: 'a1', awardName: 'Legacy', amountCents: 200000, storySent: false,
    });
    expect(parseDecision({ kind: 'won', awardId: 'a1', storySent: true })).toMatchObject({ storySent: true, amountCents: null });
    expect(parseDecision({ kind: 'not-picked' })).toEqual({ kind: 'not-picked' });
    expect(parseDecision({ kind: 'something-else' })).toBeNull();
  });
  it('reports a failed read', async () => {
    expect((await fetchMyDecision(rpcClient({ error: { message: 'x' } }).client, 'c1')).failed).toBe(true);
  });
});

describe('free times', () => {
  it('reads her saved answer', async () => {
    const { client, log } = tableClient({ days: ['Sun'], windows: ['morning'], note: null });
    expect(await fetchFreeTimes(client, 'app1')).toEqual({ failed: false, row: { days: ['Sun'], windows: ['morning'], note: '' } });
    expect(log[0]).toEqual({ table: 'interview_free_times', op: 'select days, windows, note where application_id=app1' });
  });
  it('upserts one row per application with the exact values', async () => {
    const { client, log } = tableClient(null);
    expect(await saveFreeTimes(client, 'app1', { days: ['Mon', 'Sun'], windows: ['morning', 'evening'], note: '  labs  ' })).toEqual({ ok: true });
    expect(log[0]).toEqual({
      table: 'interview_free_times',
      op: 'upsert',
      payload: { application_id: 'app1', days: ['Mon', 'Sun'], windows: ['morning', 'evening'], note: 'labs' },
      opts: { onConflict: 'application_id' },
    });
  });
  it('sends no note as null and reports a refusal', async () => {
    const { client, log } = tableClient(null);
    await saveFreeTimes(client, 'app1', { days: ['Sat'], windows: ['afternoon'], note: '' });
    expect((log[0].payload as { note: unknown }).note).toBeNull();
    expect(await saveFreeTimes(tableClient(null, { code: '42501' }).client, 'app1', { days: ['Sat'], windows: ['afternoon'], note: '' })).toEqual({ ok: false });
  });
});

describe('change your time with a note', () => {
  it('passes p_note only when there is one', async () => {
    const a = rpcClient({ data: 'switched' });
    expect(await bookSlot(a.client, 's1', '  lab until 6:30  ')).toEqual({ ok: true, result: 'switched' });
    expect(a.calls[0]).toEqual({ fn: 'switch_booking', args: { p_new_slot: 's1', p_note: 'lab until 6:30' } });
    const b = rpcClient({ data: 'booked' });
    await bookSlot(b.client, 's1');
    expect(b.calls[0].args).toEqual({ p_new_slot: 's1' });
    const c = rpcClient({ data: 'booked' });
    await bookSlot(c.client, 's1', '   ');
    expect(c.calls[0].args).toEqual({ p_new_slot: 's1' });
  });
  it('maps note_too_long', async () => {
    expect(await bookSlot(rpcClient({ error: { message: 'note_too_long', code: '22023' } }).client, 's1', 'x')).toEqual({ ok: false, kind: 'note_too_long' });
  });
  it('returns unchanged so the screen can say "Note saved."', async () => {
    expect(await bookSlot(rpcClient({ data: 'unchanged' }).client, 's1', 'note')).toEqual({ ok: true, result: 'unchanged' });
  });
});

describe('photo and story', () => {
  it('builds the storage path as {user}/{award}/photo.jpg|png', () => {
    expect(photoPath('u1', 'a1', 'image/png')).toBe('u1/a1/photo.png');
    expect(photoPath('u1', 'a1', 'image/jpeg')).toBe('u1/a1/photo.jpg');
  });
  it('uploads to award-photos, replacing a photo of the other type', async () => {
    const ops: unknown[] = [];
    const client = {
      storage: {
        from: (bucket: string) => ({
          upload: async (path: string, _f: unknown, opts: unknown) => {
            ops.push({ bucket, op: 'upload', path, opts });
            return { error: null };
          },
          remove: async (paths: string[]) => {
            ops.push({ bucket, op: 'remove', paths });
            return { error: null };
          },
          createSignedUrl: async (path: string, secs: number) => ({ data: { signedUrl: `https://x/${path}?t=${secs}` }, error: null }),
        }),
      },
    } as unknown as BtxClient;
    const file = new Blob(['x'], { type: 'image/png' });
    expect(await uploadAwardPhoto(client, 'u1', 'a1', file, 'u1/a1/photo.jpg')).toBe('u1/a1/photo.png');
    expect(ops).toEqual([
      { bucket: 'award-photos', op: 'upload', path: 'u1/a1/photo.png', opts: { upsert: true, contentType: 'image/png' } },
      { bucket: 'award-photos', op: 'remove', paths: ['u1/a1/photo.jpg'] },
    ]);
    expect(await photoUrl(client, 'u1/a1/photo.png')).toBe('https://x/u1/a1/photo.png?t=3600');
  });
  it('upserts award_stories, with sent_at only when sending', async () => {
    const draft = tableClient(null);
    await saveStory(draft.client, 'a1', { story: ' I build bridges. ', photoPath: 'u1/a1/photo.jpg', consent: true });
    expect(draft.log[0]).toEqual({
      table: 'award_stories',
      op: 'upsert',
      payload: { award_id: 'a1', story: 'I build bridges.', photo_path: 'u1/a1/photo.jpg', consent: true },
      opts: { onConflict: 'award_id' },
    });
    const sent = tableClient(null);
    await saveStory(sent.client, 'a1', { story: 'x', photoPath: 'p', consent: true, sentAt: '2026-10-23T14:00:00Z' });
    expect((sent.log[0].payload as { sent_at: string }).sent_at).toBe('2026-10-23T14:00:00Z');
  });
  it('reads her saved row', async () => {
    const { client, log } = tableClient({ story: 'Hi', photo_path: 'u1/a1/photo.jpg', consent: false, sent_at: null });
    expect(await fetchStory(client, 'a1')).toEqual({ failed: false, row: { story: 'Hi', photoPath: 'u1/a1/photo.jpg', consent: false, sentAt: null } });
    expect(log[0].table).toBe('award_stories');
  });
});
