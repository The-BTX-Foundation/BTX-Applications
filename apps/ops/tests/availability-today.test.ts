import { describe, expect, it } from 'vitest';
import { availabilityRow, insertRow, AVAILABILITY_HREF } from '@/lib/availability-today';
import { buildToday } from '@/lib/daily-tasks';

const cycle = { id: 'c1', closesAt: '2026-11-07T04:59:00Z', interviewStart: '2026-11-10', interviewEnd: '2026-11-20' };

describe('availabilityRow', () => {
  it('asks for availability by the Eastern close date and links to the page', () => {
    const r = availabilityRow({ cycle, sentAt: null, today: '2026-11-02' })!;
    expect(r.due).toBe('2026-11-06');
    expect(r.row.title).toBe('Give your interview availability by Fri Nov 6');
    expect(r.row.href).toBe(AVAILABILITY_HREF);
    expect(r.row.due).toBe('Fri Nov 6');
    expect(r.row.phoneLate).toBeUndefined();
  });
  it('says late once the close date has passed', () => {
    const r = availabilityRow({ cycle, sentAt: null, today: '2026-11-08' })!;
    expect(r.row.rel).toEqual({ text: '2 days late', late: true });
    expect(r.row.phoneLate).toBe(true);
  });
  it('shows nothing once sent, once interviews are over, or with no interview dates', () => {
    expect(availabilityRow({ cycle, sentAt: '2026-11-01T12:00:00Z', today: '2026-11-02' })).toBeNull();
    expect(availabilityRow({ cycle, sentAt: null, today: '2026-11-21' })).toBeNull();
    expect(availabilityRow({ cycle: { ...cycle, interviewStart: null, interviewEnd: null }, sentAt: null, today: '2026-11-02' })).toBeNull();
    expect(availabilityRow({ cycle: null, sentAt: null, today: '2026-11-02' })).toBeNull();
  });
  it('still shows when interviews are on and the close date is missing', () => {
    const r = availabilityRow({ cycle: { ...cycle, closesAt: null }, sentAt: null, today: '2026-11-12' })!;
    expect(r.row.title).toBe('Give your interview availability');
  });
});

describe('insertRow', () => {
  const empty = buildToday({ today: '2026-11-02', first: 'Dania', mine: [], team: [], facts: { mineByArea: {}, ring: {}, cycle: null, fundsCents: null, raisedCents: 0, raiseTargetCents: null, programName: null, programStatus: null, planningCall: null, monthName: 'November', postsPlanned: 0, postsDone: 0, nextPost: null } });
  it('makes the group for its due date and keeps groups in order', () => {
    const item = availabilityRow({ cycle, sentAt: null, today: '2026-11-02' })!;
    const g = insertRow([{ label: 'Later', rows: [] }, ...empty.groups], item, '2026-11-02');
    expect(g.map((x) => x.label)).toEqual(['This week', 'Later']);
    expect(g[0].rows[0].id).toBe('availability-c1');
  });
});
