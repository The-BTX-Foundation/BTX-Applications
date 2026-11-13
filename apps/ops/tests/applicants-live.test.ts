// Live Applicants loading (lib/applicants-live.ts) against a stand-in reader: every read is ordered, `in()` filters go
// in chunks of 100, a failed read is the page's load error (never an empty list), the average shows only with two
// published scores, contact details reach the list only for admins (export), an unknown code is missing, and the mock
// loader's ?demo= flags.
import { describe, expect, it } from 'vitest';
import type { Row } from '@/lib/applicants-map';
import { loadLiveApplicant, loadLiveApplicants, type ApReader, type ApReadOpts } from '@/lib/applicants-live';
import { mockApplicant, mockApplicants } from '@/lib/applicants-view-loader';

const NOW = new Date('2026-11-18T14:00:00.000Z');
const APPS: Row[] = Array.from({ length: 150 }, (_, i) => ({
  id: `app${String(i).padStart(3, '0')}`,
  cycle_id: 'c1',
  applicant_code: `APP-2026-${String(i).padStart(5, '0')}`,
  full_name: `Student ${i}`,
  terpmail: `s${i}@terpmail.umd.edu`,
  phone: '301-555-0100',
  submitted_at: '2026-10-20T15:00:00.000Z',
  answer_1: 'one two three',
  answer_2: '',
  answer_3: null,
  stay_in_touch: true,
}));
const TABLES: Record<string, Row[]> = {
  cycles: [
    { id: 'c0', term: 'Spring 2026', created_at: '2026-01-01' },
    { id: 'c1', term: 'Fall 2026', award_name: 'Legacy Scholarship', opens_at: '2026-10-12T16:00:00.000Z', decision_date: '2026-11-30', created_at: '2026-09-01' },
  ],
  rubric_criteria: Array.from({ length: 5 }, (_, i) => ({ id: `r${i}` })),
  calendar_events: [{ id: 'e1', starts_at: '2026-11-25T00:00:00.000Z' }],
  applications: APPS,
  staff_profiles: [
    { user_id: 'u-me', display_name: 'Dana Mercer', initials: 'DM' },
    { user_id: 'u-kd', display_name: 'Keith Dawson', initials: 'KD' },
  ],
  bookings: [
    { id: 'b1', application_id: 'app000', slot_id: 's1', interview_slots: { starts_at: '2026-11-16T22:00:00.000Z', ends_at: '2026-11-16T22:30:00.000Z' } },
    { id: 'b2', application_id: 'app001', slot_id: 's2', interview_slots: { starts_at: '2026-11-16T23:00:00.000Z', ends_at: '2026-11-16T23:30:00.000Z' } },
  ],
  interview_pairings: [
    { slot_id: 's1', interviewer_a: 'u-me', interviewer_b: 'u-kd' },
    { slot_id: 's2', interviewer_a: 'u-me', interviewer_b: 'u-kd' },
  ],
  interview_summaries: [],
  scores: [
    { id: 'sc1', application_id: 'app000', scorer_id: 'u-me', criteria_count: 5, weighted_score: 4.2, published: true },
    { id: 'sc2', application_id: 'app000', scorer_id: 'u-kd', criteria_count: 5, weighted_score: 4.8, published: true },
    { id: 'sc3', application_id: 'app001', scorer_id: 'u-me', criteria_count: 3, weighted_score: null, published: false },
  ],
  application_files: [{ id: 'f1', kind: 'resume', filename: 'resume.pdf' }],
};
const PROGRESS: Row[] = [
  { application_id: 'app000', scorer_id: 'u-kd', published: true },
  { application_id: 'app000', scorer_id: 'u-me', published: true },
  { application_id: 'zzz', scorer_id: 'u-me', published: true },
];

function reader(fail?: string) {
  const log: { table: string; o: ApReadOpts }[] = [];
  const read: ApReader = {
    async all(table, _select, o) {
      log.push({ table, o });
      if (table === fail) throw new Error('boom');
      let rows = TABLES[table] ?? [];
      for (const [k, v] of Object.entries(o.eq ?? {})) if (table !== 'cycles' || k === 'id') rows = rows.filter((r) => r[k] === undefined || r[k] === v);
      for (const [k, v] of Object.entries(o.in ?? {})) rows = rows.filter((r) => v.includes(r[k]));
      return rows;
    },
    async rpc(fn) {
      if (fn === fail) throw new Error('boom');
      return PROGRESS;
    },
  };
  return { read, log };
}

describe('loadLiveApplicants', () => {
  it('builds the list from the newest published cycle', async () => {
    const { read, log } = reader();
    const v = await loadLiveApplicants(read, { id: 'u-me', admin: false }, NOW);
    if (v.failed) throw new Error('failed');
    expect(v.cycle).toMatchObject({ term: 'Fall 2026', criteriaTotal: 5, scoresDue: null, selectionAt: '2026-11-25T00:00:00.000Z' });
    expect(v.applicants).toHaveLength(150);
    expect(v.caps).toEqual({ nudge: false, export: false });
    const a0 = v.applicants.find((a) => a.id === 'app000')!;
    expect(a0.avg).toBe(4.5);
    expect(a0.published.sort()).toEqual(['u-kd', 'u-me']);
    expect(a0.interviewMinutes).toBe(30);
    const a1 = v.applicants.find((a) => a.id === 'app001')!;
    expect(a1.avg).toBeNull();
    expect(a1.draft).toBe(3);
    // A board member's browser never gets contact details from the list.
    expect(v.applicants.every((a) => a.email === null && a.phone === null)).toBe(true);
    // Every read has an order; in() filters at most 100 ids.
    expect(log.every((l) => l.o.order.length > 0)).toBe(true);
    const ins = log.filter((l) => l.o.in).flatMap((l) => Object.values(l.o.in!));
    expect(ins.every((ids) => ids.length <= 100)).toBe(true);
    expect(log.filter((l) => l.table === 'scores')).toHaveLength(2);
    expect(v.people.map((p) => p.id)).toEqual(['u-me', 'u-kd']);
  });
  it('admins get contact details (export) and the export cap', async () => {
    const v = await loadLiveApplicants(reader().read, { id: 'u-me', admin: true }, NOW);
    if (v.failed) throw new Error('failed');
    expect(v.caps.export).toBe(true);
    expect(v.applicants[0].email).toMatch(/@terpmail/);
  });
  it('any failed read is a load error, never an empty list', async () => {
    for (const t of ['cycles', 'applications', 'scores', 'bookings', 'interview_pairings', 'score_progress', 'rubric_criteria']) {
      expect(await loadLiveApplicants(reader(t).read, { id: 'u-me', admin: false }, NOW)).toEqual({ failed: true });
    }
  });
  it('no published cycle is an empty list, not an error', async () => {
    const empty: ApReader = { all: async () => [], rpc: async () => [] };
    const v = await loadLiveApplicants(empty, { id: 'u-me', admin: false }, NOW);
    expect(v).toMatchObject({ failed: false, applicants: [] });
  });
});

describe('loadLiveApplicant', () => {
  it('one application with contact details, answers and files', async () => {
    const v = await loadLiveApplicant(reader().read, { id: 'u-kd', admin: false }, 'APP-2026-00000', NOW);
    if (v.failed || v.missing) throw new Error('no view');
    expect(v.applicant.code).toBe('APP-2026-00000');
    expect(v.applicant.email).toBe('s0@terpmail.umd.edu');
    expect(v.identity.find((f) => f.label === 'Phone')?.value).toBe('301-555-0100');
    expect(v.shortAnswers).toEqual(['one two three', '', '']);
    expect(v.files).toEqual([
      { kind: 'resume', label: 'Resume', filename: 'resume.pdf' },
      { kind: 'transcript', label: 'Transcript', filename: null },
    ]);
    expect(v.answers.find((f) => f.label === 'Stay in touch')?.value).toBe('Yes');
  });
  it('an unknown code is missing; a failed read is failed', async () => {
    expect(await loadLiveApplicant(reader().read, { id: 'u-me', admin: false }, 'NOPE', NOW)).toEqual({ failed: false, missing: true });
    expect(await loadLiveApplicant(reader('application_files').read, { id: 'u-me', admin: false }, 'APP-2026-00000', NOW)).toEqual({ failed: true, missing: false });
  });
});

describe('mock flags', () => {
  it('list', () => {
    expect(mockApplicants('failed')).toEqual({ failed: true });
    const n = mockApplicants();
    const e = mockApplicants('empty');
    const s = mockApplicants('stress');
    const x = mockApplicants('error');
    if (n.failed || e.failed || s.failed || x.failed) throw new Error('failed');
    expect(n.applicants).toHaveLength(21);
    expect(e.applicants).toHaveLength(0);
    expect(s.applicants).toHaveLength(141);
    expect(x.loadFailed).toBe(true);
  });
  it('detail', () => {
    expect(mockApplicant('APP-2026-00011')).toMatchObject({ failed: false, missing: false });
    expect(mockApplicant('NOPE')).toEqual({ failed: false, missing: true });
    expect(mockApplicant('APP-2026-00011', 'failed')).toEqual({ failed: true, missing: false });
  });
});
