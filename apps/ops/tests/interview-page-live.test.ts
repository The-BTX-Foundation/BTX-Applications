// Live loader for the page for one interview (lib/interview-page-live.ts) against a stand-in reader: a non-uuid or a
// missing time/booking/application is "missing" (404); a failed core read is "failed" (never zeros); a failed questions or
// notes read only marks that part; notes are not read for someone who may not read them.
import { describe, expect, it, vi } from 'vitest';
import type { ApReader } from '@/lib/applicants-live';
import { loadLiveInterviewPage } from '@/lib/interview-page-live';

const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const SLOT = '44444444-4444-4444-8444-444444444444';
const Q1 = '55555555-5555-4555-8555-555555555551';

type T = Record<string, Record<string, unknown>[]>;
const base = (): T => ({
  interview_slots: [{ id: SLOT, cycle_id: 'cy', starts_at: '2026-11-18T22:00:00Z', ends_at: '2026-11-18T22:30:00Z' }],
  bookings: [{ id: 'bk', application_id: 'app' }],
  interview_pairings: [{ slot_id: SLOT, interviewer_a: A, interviewer_b: B, video_url: 'https://teams.microsoft.com/l/x' }],
  applications: [{ id: 'app', applicant_code: 'APP-2026-00011', full_name: 'Ada Okafor' }],
  cycles: [{ id: 'cy', term: 'Fall 2026', award_name: 'Legacy Scholarship' }],
  staff_profiles: [
    { user_id: A, display_name: 'Dana Mercer', initials: 'DM' },
    { user_id: B, display_name: 'Keith Dawson', initials: 'KD' },
  ],
  rubric_criteria: [{ key: 'goals', name: 'Goals', weight: 100, position: 1 }],
  interview_questions: [{ id: Q1, criterion_key: 'goals', position: 1, text: 'Why?', created_at: '2026-11-01T00:00:00Z' }],
  interview_notes: [{ id: 'n1', question_id: Q1, author_id: B, body: 'good answer' }],
});

function reader(t: T, fail: string[] = []) {
  const read: string[] = [];
  const r: ApReader = {
    all: async (table) => {
      read.push(table);
      if (fail.includes(table)) throw { code: '42P01' };
      return t[table] ?? [];
    },
    rpc: async () => [],
  };
  return { r, read };
}

describe('loadLiveInterviewPage', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {});

  it('a slot id that is not a uuid is missing, with no read', async () => {
    const { r, read } = reader(base());
    expect(await loadLiveInterviewPage(r, 't6', A, false)).toEqual({ state: 'missing' });
    expect(read).toEqual([]);
  });
  it('no time, no active booking or no application is missing', async () => {
    for (const k of ['interview_slots', 'bookings', 'applications']) {
      const t = base();
      t[k] = [];
      expect((await loadLiveInterviewPage(reader(t).r, SLOT, A, false)).state).toBe('missing');
    }
  });
  it('a failed core read fails the page', async () => {
    for (const k of ['interview_slots', 'bookings', 'interview_pairings', 'applications', 'cycles', 'staff_profiles']) {
      expect((await loadLiveInterviewPage(reader(base(), [k]).r, SLOT, A, false)).state).toBe('failed');
    }
  });
  it('an interviewer gets the questions, the link and the other person\'s notes', async () => {
    const res = await loadLiveInterviewPage(reader(base()).r, SLOT, A, false);
    if (res.state !== 'ok') throw new Error(res.state);
    expect(res.view.groups[0].questions[0].text).toBe('Why?');
    expect(res.view.link).toBe('https://teams.microsoft.com/l/x');
    expect(res.view.others[Q1][0].name).toBe('Keith Dawson');
  });
  it('a failed notes read marks only the notes; a failed questions or rubric read marks only the questions', async () => {
    const n = await loadLiveInterviewPage(reader(base(), ['interview_notes']).r, SLOT, A, false);
    if (n.state !== 'ok') throw new Error(n.state);
    expect([n.view.notesFailed, n.view.questionsFailed]).toEqual([true, false]);
    for (const k of ['interview_questions', 'rubric_criteria']) {
      const q = await loadLiveInterviewPage(reader(base(), [k]).r, SLOT, A, false);
      if (q.state !== 'ok') throw new Error(q.state);
      expect([q.view.notesFailed, q.view.questionsFailed]).toEqual([false, true]);
    }
  });
  it('someone not on it and not admin: notes are never read, the link is hidden', async () => {
    const { r, read } = reader(base());
    const res = await loadLiveInterviewPage(r, SLOT, C, false);
    if (res.state !== 'ok') throw new Error(res.state);
    expect(read).not.toContain('interview_notes');
    expect(res.view.link).toBeNull();
    expect(res.view.linkHidden).toBe(true);
  });
});
