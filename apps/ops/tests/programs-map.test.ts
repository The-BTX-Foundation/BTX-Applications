import { describe, expect, it } from 'vitest';
import { mapCertPlan, mapCertSteps, mapIdeas, mapMentor, mapSponsorships, type StepIn } from '@/lib/programs-map';
import { staffMap } from '@/lib/area-map';

const dania = { id: 'u1', name: 'Dania Morris', initials: 'DM' };
const steps: StepIn[] = [
  { id: 't1', title: 'Agree the program goal', note: null, due_on: '2026-10-01', done: true, owner: null },
  { id: 't2', title: 'Pick the first certifications', note: 'Planning call 7:00 PM', due_on: '2026-10-22', done: false, owner: dania },
  { id: 't3', title: 'Set who can apply', note: null, due_on: null, done: false, owner: null },
];

describe('mapCertSteps', () => {
  const out = mapCertSteps(steps);
  it('marks the first open step next and the rest to do', () => {
    expect(out.map((s) => s.state)).toEqual(['done', 'next', 'todo']);
  });
  it('offers "Add an idea" only on a certification step that is next', () => {
    expect(out[1].action).toBe('Add an idea');
    expect(out[2].action).toBeUndefined();
    expect(mapCertSteps([{ ...steps[1], title: 'Announce it' }])[0].action).toBeUndefined();
  });
  it('writes the laptop and phone lines', () => {
    expect(out[0]).toMatchObject({ dueNote: 'Done', due: 'Thu Oct 1', sub: '', owner: null, phoneSub: 'Thu Oct 1' });
    expect(out[1]).toMatchObject({ sub: 'Planning call 7:00 PM', phoneSub: 'Dania Morris · Thu Oct 22' });
    expect(out[2]).toMatchObject({ owner: 'unassigned', sub: 'Not started', phoneSub: 'Unassigned' });
  });
  it('handles an empty checklist', () => {
    expect(mapCertSteps([])).toEqual([]);
  });
});

describe('mapCertPlan', () => {
  it('shows "Not set" when the program has no numbers', () => {
    const p = mapCertPlan(undefined, [], 'Not decided');
    expect(p).toMatchObject({ budget: 'Not set', students: 'Not set', studentsNote: 'Cost not set', budgetNote: 'Period not set', ideasNote: 'None yet', first: 'To pick' });
  });
  it('formats the real numbers and counts ideas', () => {
    const ideas = mapIdeas(
      [
        { id: 'i1', name: 'FE', decision: 'chosen', suggested_by: 'u1' },
        { id: 'i2', name: 'AWS', decision: 'not_decided', suggested_by: 'zz' },
      ],
      staffMap([{ user_id: 'u1', display_name: 'Dania Morris', initials: 'DM' }]),
    );
    expect(ideas.map((i) => i.by)).toEqual(['Dania Morris', 'Someone']);
    const p = mapCertPlan({ pilot_budget_cents: 150000, budget_period: 'Q4 2026', students_target: 5, cost_per_student_cents: 30000 }, ideas, 'x');
    expect(p).toMatchObject({ budget: '$1,500', budgetNote: 'Q4 2026', students: 'up to 5', studentsNote: 'About $300 each', first: '1 chosen', ideasNote: '1 not decided' });
  });
});

describe('mapSponsorships', () => {
  const rows = [
    { id: 's1', title: 'NSBE convention', kind: 'conference', students: 5, amount_cents: 275000, when_label: 'Spring 2026', occurred_on: '2026-03-20', status: 'done' },
    { id: 's2', title: 'Old', kind: 'fee', students: 1, amount_cents: 1000, occurred_on: '2025-05-01', status: 'done' },
    { id: 's3', title: 'Cancelled', kind: 'fee', students: 1, amount_cents: 1000, occurred_on: '2026-05-01', status: 'cancelled' },
    { id: 's4', title: 'Planned trip', kind: 'travel', students: 2, amount_cents: 50000, occurred_on: '2026-12-31', status: 'planned' },
  ];
  it('keeps this year, drops cancelled, maps state and wording', () => {
    const out = mapSponsorships(rows, 2026);
    expect(out.map((r) => r.id)).toEqual(['s1', 's4']);
    expect(out[0]).toMatchObject({ amount: 2750, when: 'Spring 2026', state: 'Done', phoneWhen: 'Spring 2026 · also on Budget' });
    expect(out[1]).toMatchObject({ state: 'Not started', when: 'Thu Dec 31', phoneWhen: 'Thu Dec 31' });
  });
});

describe('mapMentor', () => {
  it('counts done steps, flags unassigned ones and reads the launch date from its step', () => {
    const m = mapMentor({ status: 'planned' }, [
      { id: 'a', title: 'Draft the application', note: null, due_on: null, done: true, owner: null },
      { id: 'b', title: 'Set the launch date', note: null, due_on: '2027-01-15', done: false, owner: null },
    ]);
    expect(m).toMatchObject({ done: 1, total: 2, nowLabel: 'Set the launch date', launch: { value: 'Fri Jan 15' } });
    expect(m.steps[1]).toMatchObject({ unassigned: true, status: 'Not started', phoneSub: 'Fri Jan 15' });
    expect(m.subtitle).toBe('Planned, not active yet · launch Fri Jan 15');
    expect(m.phoneSub).toBe('Programs · planned, not active');
  });
  it('says the launch date is to be set when no step has one', () => {
    expect(mapMentor({ status: 'planned' }, []).launch).toEqual({ value: 'To be set', note: 'Nothing is scheduled' });
  });
});
