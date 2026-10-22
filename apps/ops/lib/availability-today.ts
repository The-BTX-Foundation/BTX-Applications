// The Today item "Give your interview availability by Fri Nov 6": shown to a board member who has not sent their
// availability for a cycle whose interviews have not ended. Pure, so it is unit tested (tests/availability-today.test.ts).
import { easternIso } from './cycle-core';
import { bucketOf } from './daily-tasks';
import { dateOnlyLabel } from './format';
import type { TaskGroup, TaskRow } from '@/mock/today';
import type { TasksData } from './tasks-shared';

export const AVAILABILITY_HREF = '/scholarships/interviews/availability';

export type AvailabilityCycle = { id: string; closesAt: string | null; interviewStart: string | null; interviewEnd: string | null };

/** The Today row, or null when nothing is due (sent already, interviews over, or no interview dates yet). */
export function availabilityRow(a: { cycle: AvailabilityCycle | null; sentAt: string | null; today: string }): { row: TaskRow; due: string | null } | null {
  const c = a.cycle;
  if (!c || a.sentAt || !c.interviewStart || !c.interviewEnd || c.interviewEnd < a.today) return null;
  const due = c.closesAt ? easternIso(c.closesAt) : null;
  const dueText = due ? dateOnlyLabel(due) : '';
  const late = due !== null && due < a.today;
  const lateDays = late ? Math.round((Date.parse(a.today) - Date.parse(due)) / 86_400_000) : 0;
  const days = due ? Math.round((Date.parse(due) - Date.parse(a.today)) / 86_400_000) : null;
  const rel = late ? `${lateDays} day${lateDays === 1 ? '' : 's'} late` : days === 1 ? 'Tomorrow' : days === 0 ? 'Today' : undefined;
  return {
    due,
    row: {
      id: `availability-${c.id}`,
      title: `Give your interview availability${dueText ? ` by ${dueText}` : ''}`,
      phoneTitle: 'Give your interview availability',
      lead: 'icon',
      typeIcon: 'calendar',
      typeLabel: 'Request',
      sub: 'Interviews',
      area: 'Scholarships',
      due: dueText || 'No date',
      rel: rel ? { text: rel, late: late || undefined } : undefined,
      action: { label: 'Add times', kind: late ? 'p' : 's' },
      href: AVAILABILITY_HREF,
      phoneSub: 'Scholarships · request',
      phoneDue: rel ?? dueText ?? 'No date',
      phoneLate: late || undefined,
      // The phone always gets a visible button (a late request's is the main one).
      phoneActions: [{ label: 'Add times', kind: late ? 'p' : 's' }],
    },
  };
}

const ORDER = ['Late', 'This week', 'Next week', 'Later'] as const;
const LABEL = { late: 'Late', this_week: 'This week', next_week: 'Next week', later: 'Later' } as const;

/** Puts the row in its Late / This week / Next week / Later group (made if missing), first in the group. */
export function insertRow(groups: TaskGroup[], item: { row: TaskRow; due: string | null }, today: string): TaskGroup[] {
  const label = LABEL[bucketOf(today, item.due)];
  const out = groups.map((g) => (g.label === label ? { ...g, rows: [item.row, ...g.rows] } : g));
  if (out.some((g) => g.label === label)) return out;
  return [...out, { label, rows: [item.row] }].sort((x, y) => ORDER.indexOf(x.label as (typeof ORDER)[number]) - ORDER.indexOf(y.label as (typeof ORDER)[number]));
}

/** The Tasks page's data with the request added to Mine: kept apart from the tasks (it has no details, completion or comments) and counted in the Mine tab. */
export function withAvailabilityRequest(data: TasksData, item: { row: TaskRow } | null): TasksData {
  if (!item) return data;
  return { ...data, request: item.row, counts: { ...data.counts, mine: data.counts.mine + 1 } };
}
