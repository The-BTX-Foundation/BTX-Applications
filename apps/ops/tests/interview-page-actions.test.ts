// The page for one interview's server actions (lib/actions/interview-page.ts) and their pure checks
// (lib/interview-page-rules.ts): the role comes from the auth server; notes only by the two interviewers or an admin, for a
// question of that cycle; who is free and the change itself only for admins, with the server's own words on failure.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BAD_INPUT, changeRefusal, cleanChange, cleanNote, NOT_ADMIN, NOT_ON_IT, NOT_STAFF, NOTE_FAILED, noteRefusal } from '@/lib/interview-page-rules';

const ME = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const SLOT = '44444444-4444-4444-8444-444444444444';
const Q = '55555555-5555-4555-8555-555555555555';

const h = vi.hoisted(() => ({
  env: true,
  user: null as null | { id: string; app_metadata?: { role?: string } },
  access: null as null | { cycleId: string; pair: string[] },
  inCycle: true,
  save: { ok: true } as { ok: true } | { ok: false; code: string },
  saved: [] as unknown[],
  list: vi.fn(),
  reassign: vi.fn(),
}));

vi.mock('@btx/data', () => ({ hasSupabaseEnv: () => h.env }));
vi.mock('@/lib/supabase-server', () => ({ sessionClient: async () => ({ auth: { getUser: async () => ({ data: { user: h.user } }) } }) }));
vi.mock('@/lib/interview-notes-db', async (orig) => ({
  ...(await orig<typeof import('@/lib/interview-notes-db')>()),
  readSlotAccess: async () => h.access,
  questionInCycle: async () => h.inCycle,
  saveOwnNote: async (_c: unknown, w: unknown) => (h.saved.push(w), h.save),
}));
vi.mock('@/lib/interview-reassign', () => ({ listFreeReplacements: h.list, reassignInterviewer: h.reassign, NO_ONE_FREE: 'Nobody else is free for the whole time.' }));

import { changeInterviewerAction, listReplacementsAction, saveInterviewNoteAction } from '@/lib/actions/interview-page';

const as = (role: string | undefined, id = ME) => (h.user = { id, app_metadata: role ? { role } : {} });

beforeEach(() => {
  h.env = true;
  h.user = null;
  h.access = { cycleId: 'cy', pair: [ME, B] };
  h.inCycle = true;
  h.save = { ok: true };
  h.saved = [];
  h.list.mockReset();
  h.reassign.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('rules', () => {
  it('notes: admin always, board only on the pair, nobody else', () => {
    expect(noteRefusal({ id: C, role: 'admin' }, [ME, B])).toBeNull();
    expect(noteRefusal({ id: ME, role: 'board' }, [ME, B])).toBeNull();
    expect(noteRefusal({ id: C, role: 'board' }, [ME, B])).toBe(NOT_ON_IT);
    expect(noteRefusal({ id: C, role: 'applicant' }, [ME, B])).toBe(NOT_STAFF);
    expect(noteRefusal({ id: null, role: 'admin' }, [ME, B])).toBe(NOT_STAFF);
  });
  it('change: admins only', () => {
    expect(changeRefusal({ id: ME, role: 'admin' })).toBeNull();
    expect(changeRefusal({ id: ME, role: 'board' })).toBe(NOT_ADMIN);
    expect(changeRefusal({ id: ME, role: null })).toBe(NOT_STAFF);
  });
  it('input checks: real ids, a string body cut to the limit, two different people', () => {
    expect(cleanNote({ slotId: 't6', questionId: null, body: 'x' })).toBeNull();
    expect(cleanNote({ slotId: SLOT, questionId: 'q1', body: 'x' })).toBeNull();
    expect(cleanNote({ slotId: SLOT, questionId: Q, body: 5 })).toBeNull();
    expect(cleanNote({ slotId: SLOT, questionId: null, body: 'ok' })).toEqual({ slotId: SLOT, questionId: null, body: 'ok' });
    expect(cleanChange({ slotId: SLOT, outgoingId: ME, incomingId: ME })).toBeNull();
    expect(cleanChange({ slotId: SLOT, outgoingId: ME, incomingId: C })).toEqual({ slotId: SLOT, outgoingId: ME, incomingId: C });
  });
});

describe('saveInterviewNoteAction', () => {
  const note = { slotId: SLOT, questionId: Q, body: 'words' };
  it('without Supabase env it does nothing', async () => {
    h.env = false;
    expect((await saveInterviewNoteAction(note)).ok).toBe(false);
    expect(h.saved).toEqual([]);
  });
  it('an interviewer saves their own words as themselves', async () => {
    as('board');
    expect(await saveInterviewNoteAction(note)).toEqual({ ok: true });
    expect(h.saved).toEqual([{ slotId: SLOT, questionId: Q, authorId: ME, body: 'words' }]);
  });
  it('a board member not on it, or no staff role, is refused before any write', async () => {
    as('board', C);
    expect(await saveInterviewNoteAction(note)).toEqual({ ok: false, message: NOT_ON_IT });
    as(undefined);
    expect(await saveInterviewNoteAction(note)).toEqual({ ok: false, message: NOT_STAFF });
    expect(h.saved).toEqual([]);
  });
  it('an admin not on it may write', async () => {
    as('admin', C);
    expect(await saveInterviewNoteAction(note)).toEqual({ ok: true });
  });
  it('a question from another cycle or a bad id is refused; a failed save says Couldn\'t save', async () => {
    as('board');
    h.inCycle = false;
    expect(await saveInterviewNoteAction(note)).toEqual({ ok: false, message: BAD_INPUT });
    expect(await saveInterviewNoteAction({ ...note, slotId: 'x' })).toEqual({ ok: false, message: BAD_INPUT });
    h.inCycle = true;
    h.save = { ok: false, code: 'timeout' };
    expect(await saveInterviewNoteAction(note)).toEqual({ ok: false, message: NOTE_FAILED });
    h.access = null;
    expect(await saveInterviewNoteAction(note)).toEqual({ ok: false, message: NOTE_FAILED });
  });
});

describe('listReplacementsAction / changeInterviewerAction', () => {
  it('board members are refused before the list or the change runs', async () => {
    as('board');
    expect(await listReplacementsAction(SLOT)).toEqual({ ok: false, message: NOT_ADMIN });
    expect(await changeInterviewerAction({ slotId: SLOT, outgoingId: B, incomingId: C })).toEqual({ ok: false, message: NOT_ADMIN });
    expect(h.list).not.toHaveBeenCalled();
    expect(h.reassign).not.toHaveBeenCalled();
  });
  it('admins list who is free; a throw is a clear error, never an empty list', async () => {
    as('admin');
    h.list.mockResolvedValueOnce([{ id: C, name: 'Camila Keane', initials: 'CK' }]);
    expect(await listReplacementsAction(SLOT)).toEqual({ ok: true, people: [{ id: C, name: 'Camila Keane', initials: 'CK' }] });
    h.list.mockRejectedValueOnce(new Error('not built'));
    expect(await listReplacementsAction(SLOT)).toEqual({ ok: false, message: "Couldn't check who is free. Try again." });
  });
  it('admins change with why covered_by_admin; the server\'s message comes back; a throw is an error', async () => {
    as('admin');
    h.reassign.mockResolvedValueOnce({ ok: true, incomingId: C, incomingName: 'Camila Keane' });
    expect(await changeInterviewerAction({ slotId: SLOT, outgoingId: B, incomingId: C })).toEqual({ ok: true, incomingId: C, incomingName: 'Camila Keane' });
    expect(h.reassign).toHaveBeenCalledWith({ slotId: SLOT, outgoingId: B, incomingId: C, why: 'covered_by_admin' });
    h.reassign.mockResolvedValueOnce({ ok: false, message: 'Nobody else is free for the whole time.' });
    expect(await changeInterviewerAction({ slotId: SLOT, outgoingId: B, incomingId: C })).toEqual({ ok: false, message: 'Nobody else is free for the whole time.' });
    h.reassign.mockRejectedValueOnce(new Error('boom'));
    expect((await changeInterviewerAction({ slotId: SLOT, outgoingId: B, incomingId: C })).ok).toBe(false);
  });
});
