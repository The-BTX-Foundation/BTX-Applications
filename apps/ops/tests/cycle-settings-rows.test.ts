// Cycle settings page logic (lib/cycle-settings-rows.ts): who may do what, the plain words the rows and the confirm use,
// the dates line, and which error a row shows. DATE columns stay "YYYY-MM-DD" strings and never move a day.
import { describe, expect, it } from 'vitest';
import { rowToForm } from '@/lib/cycle-settings';
import { amountField, capsFor, confirmLabel, confirmWhat, confirmWho, dateLine, display, hasOpened, missingRows, money, relOf, relWord, rowError, undoable } from '@/lib/cycle-settings-rows';
import { CS_NOW, CS_TODAY, CS_VIEW, CS_VIEW_DRAFT, CS_VIEW_STRESS } from '@/mock/cycle-settings-view';

const NOW = Date.parse(CS_NOW);

const FALL = rowToForm(CS_VIEW.cycle!);
const DRAFT = rowToForm(CS_VIEW_DRAFT.cycle!);

describe('capsFor', () => {
  it('lets an admin edit and publish a draft', () => expect(capsFor(true, 'draft', 0, false)).toEqual({ edit: true, publish: true, unpublish: false }));
  it('lets an admin unpublish only before applications open and while none is submitted', () => {
    expect(capsFor(true, 'published', 0, false).unpublish).toBe(true);
    expect(capsFor(true, 'published', 21, false)).toEqual({ edit: true, publish: false, unpublish: false });
    // opened: a student may have started one staff can't see
    expect(capsFor(true, 'published', 0, true)).toEqual({ edit: true, publish: false, unpublish: false });
  });
  it('gives a board member and an archived cycle nothing', () => {
    expect(capsFor(false, 'draft', 0, false)).toEqual({ edit: false, publish: false, unpublish: false });
    expect(capsFor(true, 'archived', 0, false)).toEqual({ edit: false, publish: false, unpublish: false });
  });
  it('hasOpened counts the open instant itself as opened', () => {
    const at = '2026-10-12T13:00:00.000Z';
    expect(hasOpened(at, Date.parse(at) - 1)).toBe(false);
    expect(hasOpened(at, Date.parse(at))).toBe(true);
    expect(hasOpened(null, NOW)).toBe(false);
    expect(hasOpened('nonsense', NOW)).toBe(false);
  });
});

describe('undoable', () => {
  it('only while the row still holds what the save wrote', () => {
    expect(undoable(FALL, { awardName: 'Legacy Scholarship' })).toBe(true);
    expect(undoable({ ...FALL, awardName: 'Changed by another admin' }, { awardName: 'Legacy Scholarship' })).toBe(false);
    expect(undoable(FALL, undefined)).toBe(false);
    expect(undoable(FALL, { requirements: [...FALL.requirements] })).toBe(true);
    expect(undoable({ ...FALL, requirements: ['Other'] }, { requirements: [...FALL.requirements] })).toBe(false);
  });
});

describe('plain words', () => {
  it('money drops the cents only when there are none', () => {
    expect(money(250_000)).toBe('$2,500');
    expect(money(250_050)).toBe('$2,500.50');
    expect(money(100_000_000)).toBe('$1,000,000');
    expect(amountField(250_000)).toBe('2,500');
    expect(amountField(null)).toBe('');
  });
  it('relWord reads the day against today', () => {
    expect(relWord(CS_TODAY, '2026-11-09')).toBe('Yesterday');
    expect(relWord(CS_TODAY, '2026-11-06')).toBe('4 days ago');
    expect(relWord(CS_TODAY, '2026-11-10')).toBe('Today');
    expect(relWord(CS_TODAY, '2026-11-11')).toBe('Tomorrow');
    expect(relWord(CS_TODAY, '2026-11-30')).toBe('in 20 days');
  });
  it('rows read like the demo, with Eastern times and no day shift', () => {
    expect(display(FALL, 'opens')).toMatchObject({ kind: 'when', day: 'Mon Oct 12,', time: '9:00 AM' });
    expect(display(FALL, 'closes')).toMatchObject({ day: 'Fri Nov 6,', time: '11:59 PM' });
    expect(display(FALL, 'interviews')).toEqual({ kind: 'range', from: 'Tue Nov 10', to: 'Fri Nov 20' });
    expect(display(FALL, 'decision')).toMatchObject({ day: 'Mon Nov 30', title: 'Monday, November 30, 2026' });
    expect(display(FALL, 'nextMonth')).toBeNull();
    expect(relOf(FALL, CS_TODAY, 'interviews')).toBe('Now');
    expect(relOf(FALL, CS_TODAY, 'opens')).toBe('29 days ago');
  });
  it('a stress event keeps its Eastern hour', () => {
    expect(display(rowToForm(CS_VIEW_STRESS.cycle!), 'eventAt')).toMatchObject({ day: 'Sat Dec 5,', time: '2:00 PM' });
  });
});

describe('the draft checklist and the dates line', () => {
  it('lists what a draft still needs, each tied to its row', () => {
    expect(missingRows(DRAFT).map((m) => [m.row, m.label])).toEqual([
      ['amount', 'Award amount'],
      ['opens', 'Applications open date'],
      ['closes', 'Deadline date'],
    ]);
    expect(missingRows(FALL)).toEqual([]);
  });
  it('draws the line only with opens, deadline and decision, with today on it', () => {
    expect(dateLine(DRAFT, CS_TODAY)).toBeNull();
    const l = dateLine(FALL, CS_TODAY)!;
    expect(l.start).toBe('Oct 12');
    expect(l.end).toBe('Nov 30');
    expect(l.today).not.toBeNull();
    expect(l.interviews).not.toBeNull();
  });
});

describe('the confirm', () => {
  it('says who sees it', () => {
    expect(confirmWho('Fall 2026', 21)).toBe('The 21 Fall 2026 applicants and anyone who opens the Portal see this right away.');
    expect(confirmWho('Fall 2026', 0)).toBe('Anyone who opens the Portal sees this right away.');
  });
  it('says what changes, like the demo', () => {
    expect(confirmWhat('amount', FALL, { ...FALL, amount: '3,000' }, NOW, 21, 5)).toBe('The award changes from $2,500 to $3,000 on the Portal. Students applied for $2,500.');
    expect(confirmWhat('interviews', FALL, FALL, NOW, 21, 5)).toContain('5 of the 21 have booked a time; the other 16');
    expect(confirmWhat('interviews', FALL, FALL, NOW, 21, null)).toBe('New interview weeks: Tue Nov 10 to Fri Nov 20.');
    expect(confirmLabel('amount')).toBe('Change the amount');
    expect(confirmLabel('decision')).toBe('Change it for students');
  });
});

describe('the confirm for a cleared date', () => {
  it('says the date goes away, never "Invalid"', () => {
    expect(confirmWhat('decision', FALL, { ...FALL, decisionDate: '' }, NOW, 21, 5)).toBe('Applicants will no longer see a decision date.');
    expect(confirmWhat('interviews', FALL, { ...FALL, interviewStart: '', interviewEnd: '' }, NOW, 21, 5)).toBe('Applicants will no longer see interview weeks.');
    expect(confirmWhat('interviews', FALL, { ...FALL, interviewEnd: '' }, NOW, 21, null)).toBe('New interview weeks: Tue Nov 10 to not set.');
    expect(confirmWhat('decision', FALL, { ...FALL, decisionDate: '2026-12-02' }, NOW, 21, 5)).toBe('New decision date: Wed Dec 2. Applicants see it as the day they hear back.');
  });
});

describe('the deadline confirm', () => {
  // FALL closes Fri Nov 6, 11:59 PM Eastern; NOW is Tue Nov 10, 9:00 AM Eastern.
  const at = (date: string, time: string) => Date.parse(`${date}T${time}:00-05:00`);
  it('says applications open again only when the deadline has passed and the new one is ahead', () => {
    expect(confirmWhat('closes', FALL, { ...FALL, closesDate: '2026-11-13' }, NOW, 21, 5)).toBe('New deadline: Fri Nov 13, 11:59 PM. That is still ahead, so applications open again on the Portal until then.');
  });
  it('gives the plain deadline when the new one has passed too', () => {
    expect(confirmWhat('closes', FALL, { ...FALL, closesDate: '2026-11-08' }, NOW, 21, 5)).toBe('New deadline: Sun Nov 8, 11:59 PM.');
  });
  it('gives the plain deadline while the cycle is still open', () => {
    const open = { ...FALL, closesDate: '2026-11-20', closesTime: '17:00' };
    expect(confirmWhat('closes', open, { ...open, closesDate: '2026-11-27' }, NOW, 21, 5)).toBe('New deadline: Fri Nov 27, 5:00 PM.');
  });
  it('compares the hour too: later today is still ahead, earlier today has passed', () => {
    const later = { ...FALL, closesDate: '2026-11-10', closesTime: '17:00' };
    expect(confirmWhat('closes', FALL, later, at('2026-11-10', '09:00'), 21, 5)).toContain('applications open again');
    expect(confirmWhat('closes', FALL, later, at('2026-11-10', '17:00'), 21, 5)).toBe('New deadline: Tue Nov 10, 5:00 PM.');
    // the current deadline at this very minute has passed (closes <= now)
    const closingNow = { ...FALL, closesDate: '2026-11-10', closesTime: '09:00' };
    expect(confirmWhat('closes', closingNow, { ...closingNow, closesDate: '2026-11-12' }, at('2026-11-10', '09:00'), 21, 5)).toContain('applications open again');
    expect(confirmWhat('closes', closingNow, { ...closingNow, closesDate: '2026-11-12' }, at('2026-11-10', '08:59'), 21, 5)).toBe('New deadline: Thu Nov 12, 9:00 AM.');
  });
});

describe('rowError', () => {
  it("prefers the row's own error, else another row's, else the message", () => {
    expect(rowError('interviews', { interviewEnd: 'end', closes: 'c' }, 'm')).toBe('end');
    expect(rowError('decision', { closes: 'c' }, 'm')).toBe('c');
    expect(rowError('amount', undefined, 'm')).toBe('m');
  });
});
