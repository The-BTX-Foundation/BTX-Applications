// MOCK (no Supabase env): the interview flow's story from the Figma page "Options: interview flow": 7 board members,
// 18 applicants, 24 proposed times between Nov 10 and Nov 20, an uneven split of interviews and the 12 starter
// questions. Live mode reads all of this from the database (lib/interview-flow-db.ts); nothing here is saved.
import type { TimeChip } from '@/lib/interview-times';

/** "Now" for the interview flow's mock: Mon Nov 9, 2:00 PM Eastern. */
export const FLOW_NOW = '2026-11-09T14:00:00-05:00';

export const FLOW_CYCLE = {
  id: 'mock-cycle',
  term: 'Fall 2026',
  award: 'Legacy Scholarship',
  interviewStart: '2026-11-10',
  interviewEnd: '2026-11-20',
  closesLine: 'Fri Nov 6',
  applicants: 18,
};

export type MockPerson = { userId: string; name: string; freeHours: number; maxInterviews: number | null; sent: boolean };

export const FLOW_PEOPLE: MockPerson[] = [
  { userId: 'mock-staff-dm', name: 'Dana Mercer', freeHours: 20, maxInterviews: null, sent: true },
  { userId: 'mock-staff-kd', name: 'Keith Dawson', freeHours: 32, maxInterviews: null, sent: true },
  { userId: 'mock-staff-ck', name: 'Camila Keane', freeHours: 14, maxInterviews: null, sent: true },
  { userId: 'mock-staff-md', name: 'Miles Donovan', freeHours: 12, maxInterviews: 4, sent: true },
  { userId: 'mock-staff-tf', name: 'Toby Faraday', freeHours: 26, maxInterviews: null, sent: true },
  { userId: 'mock-staff-cg', name: 'Charlie Gaines', freeHours: 18, maxInterviews: null, sent: true },
  { userId: 'mock-staff-ds', name: 'Dorian Sutton', freeHours: 10, maxInterviews: null, sent: true },
];

/** The two board members the "waiting on availability" frame is still waiting on. */
export const FLOW_WAITING_IDS = ['mock-staff-md', 'mock-staff-ds'];

// [day, hour, minute, free] in Eastern standard time (UTC-5): the 24 proposed times of the frame.
const PROPOSED: [string, number, number, number][] = [
  ['2026-11-10', 18, 0, 3], ['2026-11-10', 18, 30, 2],
  ['2026-11-11', 17, 0, 4], ['2026-11-11', 17, 30, 4], ['2026-11-11', 18, 0, 3],
  ['2026-11-12', 19, 0, 2], ['2026-11-12', 19, 30, 2],
  ['2026-11-13', 17, 30, 3], ['2026-11-13', 18, 0, 3],
  ['2026-11-14', 10, 0, 5], ['2026-11-14', 10, 30, 5], ['2026-11-14', 11, 0, 4],
  ['2026-11-16', 17, 0, 4], ['2026-11-16', 17, 30, 4], ['2026-11-16', 18, 0, 3],
  ['2026-11-17', 18, 0, 3], ['2026-11-17', 18, 30, 3], ['2026-11-17', 19, 0, 2],
  ['2026-11-18', 17, 0, 3], ['2026-11-18', 17, 30, 2],
  ['2026-11-19', 18, 0, 4], ['2026-11-19', 18, 30, 3],
  ['2026-11-20', 17, 0, 2], ['2026-11-20', 17, 30, 2],
];

const pad = (n: number) => String(n).padStart(2, '0');
const toIso = (day: string, h: number, m: number) => new Date(`${day}T${pad(h)}:${pad(m)}:00-05:00`).toISOString();
const label = (h: number, m: number) => `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;

/** The 24 proposed times as chips. `opened` marks them as sent to applicants; `bookedAt` holds some by a student. */
export function mockChips(opened: boolean, booked: Record<string, string> = {}): TimeChip[] {
  return PROPOSED.map(([day, h, m, free]) => {
    const startsAt = toIso(day, h, m);
    const who = booked[`${day} ${pad(h)}:${pad(m)}`] ?? null;
    return { slotId: `mock-time-${day}-${pad(h)}${pad(m)}`, startsAt, time: label(h, m), freeCount: free, opened, booked: who !== null, bookedBy: who };
  });
}

/** Two bookings once times are sent (the "after sending" frame). */
export const MOCK_BOOKED_TIMES = { '2026-11-11 17:00': 'Sade Price', '2026-11-14 10:00': 'Esi Coleman' };

// ---- fairness ----------------------------------------------------------------------------------------------------

export const FLOW_FAIR: { userId: string; name: string; interviews: number; target: number; maxInterviews: number | null }[] = [
  { userId: 'mock-staff-dm', name: 'Dana Mercer', interviews: 5, target: 5, maxInterviews: null },
  { userId: 'mock-staff-kd', name: 'Keith Dawson', interviews: 7, target: 5, maxInterviews: null },
  { userId: 'mock-staff-ck', name: 'Camila Keane', interviews: 5, target: 5, maxInterviews: null },
  { userId: 'mock-staff-md', name: 'Miles Donovan', interviews: 4, target: 4, maxInterviews: 4 },
  { userId: 'mock-staff-tf', name: 'Toby Faraday', interviews: 7, target: 5, maxInterviews: null },
  { userId: 'mock-staff-cg', name: 'Charlie Gaines', interviews: 4, target: 5, maxInterviews: null },
  { userId: 'mock-staff-ds', name: 'Dorian Sutton', interviews: 4, target: 5, maxInterviews: null },
];

/** The booked interviews ahead in the fairness frames, with their two interviewers (user ids). */
export const FLOW_BOOKED: { slotId: string; startsAt: string; code: string; applicant: string; pair: [string, string] }[] = [
  { slotId: 'mock-fair-1', startsAt: toIso('2026-11-12', 19, 0), code: 'APP-2026-00021', applicant: 'Jordan Wells', pair: ['mock-staff-kd', 'mock-staff-tf'] },
  { slotId: 'mock-fair-2', startsAt: toIso('2026-11-13', 17, 30), code: 'APP-2026-00019', applicant: 'Maya Adeyemi', pair: ['mock-staff-kd', 'mock-staff-dm'] },
  { slotId: 'mock-fair-3', startsAt: toIso('2026-11-16', 17, 0), code: 'APP-2026-00024', applicant: 'Tobi Bello', pair: ['mock-staff-tf', 'mock-staff-ck'] },
  { slotId: 'mock-fair-4', startsAt: toIso('2026-11-17', 18, 0), code: 'APP-2026-00027', applicant: 'Amara Grant', pair: ['mock-staff-kd', 'mock-staff-cg'] },
];

/** What a rebalance does to those four (Keith and Toby give interviews to Charlie and Dorian). */
export const FLOW_MOVES: { slotId: string; from: string; to: string }[] = [
  { slotId: 'mock-fair-1', from: 'mock-staff-kd', to: 'mock-staff-ds' },
  { slotId: 'mock-fair-2', from: 'mock-staff-kd', to: 'mock-staff-cg' },
  { slotId: 'mock-fair-3', from: 'mock-staff-tf', to: 'mock-staff-ds' },
];

// ---- questions ---------------------------------------------------------------------------------------------------

/** The starter questions by rubric key (null = "To close"); the database seeds the same 12. */
export const STARTER_QUESTIONS: { key: string | null; text: string }[] = [
  { key: 'community', text: 'Tell us about a community you’re part of and what you’ve given back to it.' },
  { key: 'community', text: 'Why does community matter to you as an engineer?' },
  { key: 'resilience', text: 'Tell us about a time something went wrong at school or work. What did you do next?' },
  { key: 'resilience', text: 'Walk us through a hard problem you solved, step by step.' },
  { key: 'leadership', text: 'Describe a team project where you had to step up. What did you learn?' },
  { key: 'leadership', text: 'Tell us about a disagreement on a team and how it ended.' },
  { key: 'financial', text: 'What would this scholarship make possible for you this year?' },
  { key: 'communication', text: 'Explain an engineering idea you like to someone outside engineering.' },
  { key: 'passion', text: 'What got you into engineering, and what keeps you in it?' },
  { key: 'passion', text: 'Where do you want to be in five years?' },
  { key: null, text: 'Is there anything you’d like us to know that your application didn’t show?' },
  { key: null, text: 'What questions do you have for us?' },
];
