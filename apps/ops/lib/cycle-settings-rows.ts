// What the Cycle settings page draws for each setting (demo p-cycle-settings): the rows, their labels and plain-word values,
// which form fields each row edits, the quiet "4 days ago" line, the dates line, the confirm wording for a published cycle,
// and what each person may do (caps). Pure, so the board, the live loader and the tests share it. Every date is a calendar
// day string ("2026-11-12", Eastern) counted from the view's `today`, never parsed as UTC midnight of another zone.
import { centsToField, clockName, easternToIso, isDate, missingForPublish, parseAmountCents, type CycleForm, type FieldErrors, type FieldKey } from './cycle-settings';
import { unchanged, type CyclePatch, type PatchKey } from './cycle-settings-merge';
import { atDay, daysFrom, fullDate, MO, shortDate, weekday } from './refresh-time';
import type { CycleSettingsCaps } from './cycle-settings-view';

/** One setting row on the page (the requirements list is its own section, key 'reqs'). */
export type RowKey = 'awardName' | 'amount' | 'opens' | 'closes' | 'interviews' | 'decision' | 'nextMonth' | 'photoDue' | 'payment' | 'event' | 'eventAt';
/** A row, or the requirements list. */
export type SaveKey = RowKey | 'reqs';

/** The rows of each section, in page order. */
export const SECTIONS: Record<'award' | 'dates' | 'after', RowKey[]> = {
  award: ['awardName', 'amount'],
  dates: ['opens', 'closes', 'interviews', 'decision', 'nextMonth'],
  after: ['photoDue', 'payment', 'event', 'eventAt'],
};

export const LABEL: Record<SaveKey, string> = {
  awardName: 'Award name',
  amount: 'Amount',
  opens: 'Applications open',
  closes: 'Deadline',
  interviews: 'Interview weeks',
  decision: 'Decision date',
  nextMonth: 'Next cycle opens',
  photoDue: 'Photo and story due',
  payment: 'How the award is paid',
  event: 'Meet-the-board event',
  eventAt: 'Event date',
  reqs: 'Requirements',
};

/** The form fields each row edits (and so the fields its save sends). */
export const FORM_KEYS: Record<SaveKey, PatchKey[]> = {
  awardName: ['awardName'],
  amount: ['amount'],
  opens: ['opensDate', 'opensTime'],
  closes: ['closesDate', 'closesTime'],
  interviews: ['interviewStart', 'interviewEnd'],
  decision: ['decisionDate'],
  nextMonth: ['nextCycleMonth'],
  photoDue: ['photoDue'],
  payment: ['paymentNote'],
  event: ['eventEnabled'],
  eventAt: ['eventDate', 'eventTime'],
  reqs: ['requirements'],
};

/** The missing-for-publish key (lib/cycle-settings FieldKey) that points at each row. */
const MISSING_ROW: Partial<Record<FieldKey, RowKey>> = { awardName: 'awardName', amount: 'amount', opens: 'opens', closes: 'closes' };

/** The icon drawn beside each row. */
export const KIND_ICON = {
  awardName: 'cap',
  amount: 'money',
  opens: 'cal',
  closes: 'lock',
  interviews: 'video',
  decision: 'flag',
  nextMonth: 'cal',
  photoDue: 'photo',
  payment: 'money',
  event: 'people',
  eventAt: 'cal',
} as const satisfies Record<RowKey, string>;

/** What students see on the Portal (a save of one of these on a published cycle brings the "Students see it now" card). */
export const SEEN = new Set<SaveKey>(['awardName', 'amount', 'opens', 'closes', 'interviews', 'decision', 'reqs']);
/** Money and student-facing dates: a save on a published cycle first asks "students will see…". */
export const CONFIRM = new Set<SaveKey>(['amount', 'opens', 'closes', 'interviews', 'decision']);

/** The form values a row edits, copied (the "before" of a save and the "old" kept for Undo). */
export function pick(form: CycleForm, k: SaveKey): CyclePatch {
  return Object.fromEntries(FORM_KEYS[k].map((p) => [p, Array.isArray(form[p]) ? [...(form[p] as string[])] : form[p]])) as CyclePatch;
}

/** True once a cycle's open time (an instant, as stored) has come. Null (never set) has not. */
export function hasOpened(opensAt: string | null, nowMs: number): boolean {
  if (!opensAt) return false;
  const t = Date.parse(opensAt);
  return !Number.isNaN(t) && t <= nowMs;
}

/**
 * What a person may do, from their role (admin), the cycle's status, how many submitted applications it has and
 * whether applications have opened. Unpublish needs both "not opened yet" and "none submitted": staff can only see
 * submitted applications, so after the open time a student may have started one the count can't show.
 */
export function capsFor(admin: boolean, status: string, applications: number, opened: boolean): CycleSettingsCaps {
  const edit = admin && (status === 'draft' || status === 'published');
  return { edit, publish: edit && status === 'draft', unpublish: edit && status === 'published' && applications === 0 && !opened };
}

/**
 * Whether a row's Undo may still run: the row must still hold the value that save wrote (`saved`). When a refresh brings
 * a later change (another admin's), putting the old value back would overwrite it, so the Undo is hidden.
 */
export function undoable(form: CycleForm, saved: CyclePatch | undefined): boolean {
  return !!saved && unchanged(form, saved);
}

// ---------- plain words ----------

/** "$2,500" (cents only when there are some). */
export function money(cents: number): string {
  return '$' + (cents / 100).toLocaleString('en-US', { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
}

/** "Monday, October 12, 2026" (hover titles). */
export function longDate(day: string): string {
  return `${fullDate(day)}, ${atDay(day).getUTCFullYear()}`;
}

/** "Oct 12" (the dates line's end labels). */
export function monthDay(day: string): string {
  const d = atDay(day);
  return `${MO[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** The quiet line under a date: "Yesterday", "4 days ago", "Today", "Tomorrow", "Thu", "in 12 days", else "Thu Dec 3". */
export function relWord(today: string, day: string): string {
  const n = daysFrom(today, day);
  if (n === -1) return 'Yesterday';
  if (n < 0) return `${-n} days ago`;
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n <= 5) return weekday(day);
  if (n <= 20) return `in ${n} days`;
  return shortDate(day);
}

/** A row's value in parts the board draws (null = "Not set"). Dates come with their hover title. */
export type Display =
  | { kind: 'text'; text: string }
  | { kind: 'money'; text: string }
  | { kind: 'when'; day: string; time: string; title: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'day'; day: string; title: string };

/** How a row's value reads. */
export function display(form: CycleForm, k: RowKey): Display | null {
  const f = form;
  switch (k) {
    case 'awardName':
      return f.awardName.trim() ? { kind: 'text', text: f.awardName } : null;
    case 'amount': {
      const c = parseAmountCents(f.amount);
      return c === null ? null : { kind: 'money', text: money(c) };
    }
    case 'opens':
    case 'closes': {
      const d = k === 'opens' ? f.opensDate : f.closesDate;
      const t = k === 'opens' ? f.opensTime : f.closesTime;
      if (!isDate(d)) return null;
      return { kind: 'when', day: `${shortDate(d)},`, time: t ? clockName(t) : 'time not set', title: longDate(d) };
    }
    case 'interviews':
      return isDate(f.interviewStart) ? { kind: 'range', from: shortDate(f.interviewStart), to: isDate(f.interviewEnd) ? shortDate(f.interviewEnd) : 'not set' } : null;
    case 'decision':
      return isDate(f.decisionDate) ? { kind: 'day', day: shortDate(f.decisionDate), title: longDate(f.decisionDate) } : null;
    case 'photoDue':
      return isDate(f.photoDue) ? { kind: 'day', day: shortDate(f.photoDue), title: longDate(f.photoDue) } : null;
    case 'nextMonth':
      return f.nextCycleMonth ? { kind: 'text', text: f.nextCycleMonth } : null;
    case 'payment':
      return f.paymentNote.trim() ? { kind: 'text', text: f.paymentNote } : null;
    case 'eventAt':
      return isDate(f.eventDate) ? { kind: 'when', day: `${shortDate(f.eventDate)},`, time: f.eventTime ? clockName(f.eventTime) : 'time not set', title: longDate(f.eventDate) } : null;
    case 'event':
      return null;
  }
}

/** The quiet relative line under a dated row ("Now" while the interview weeks run). Empty for undated rows. */
export function relOf(form: CycleForm, today: string, k: RowKey): string {
  const d = { opens: form.opensDate, closes: form.closesDate, interviews: form.interviewStart, decision: form.decisionDate, photoDue: form.photoDue, eventAt: form.eventDate }[k as string];
  if (!d || !isDate(d)) return '';
  if (k === 'interviews' && isDate(form.interviewEnd) && daysFrom(today, form.interviewStart) <= 0 && daysFrom(today, form.interviewEnd) >= 0) return 'Now';
  return relWord(today, d);
}

/** The rows a draft still needs before Publish (in page order), with the needs card's words. */
export function missingRows(form: CycleForm): { row: RowKey; label: string }[] {
  return missingForPublish(form).flatMap((m) => (MISSING_ROW[m.key] ? [{ row: MISSING_ROW[m.key] as RowKey, label: m.label }] : []));
}

// ---------- the dates line ----------

export type DateLine = {
  apps: { left: string; width: string };
  interviews: { left: string; width: string } | null;
  decision: string;
  today: string | null;
  start: string;
  end: string;
};

/** Where the dates line draws its marks (percent of its width), or null when opens, deadline or decision is missing. */
export function dateLine(form: CycleForm, today: string): DateLine | null {
  const f = form;
  if (!isDate(f.opensDate) || !isDate(f.closesDate) || !isDate(f.decisionDate)) return null;
  const span = daysFrom(f.opensDate, f.decisionDate) + 4;
  const p = (d: string) => `${((daysFrom(f.opensDate, d) + 2) / span) * 100}%`;
  const seg = (a: string, b: string) => ({ left: p(a), width: `calc(${p(b)} - ${p(a)})` });
  const t = daysFrom(f.opensDate, today) + 2;
  return {
    apps: seg(f.opensDate, f.closesDate),
    interviews: isDate(f.interviewStart) && isDate(f.interviewEnd) ? seg(f.interviewStart, f.interviewEnd) : null,
    decision: p(f.decisionDate),
    today: t > 0 && t < span ? `${(t / span) * 100}%` : null,
    start: monthDay(f.opensDate),
    end: monthDay(f.decisionDate),
  };
}

// ---------- confirming a change students see ----------

/** The confirm's first line: who sees the change. */
export function confirmWho(term: string, applications: number): string {
  if (applications <= 0) return 'Anyone who opens the Portal sees this right away.';
  return `The ${applications} ${term} applicants and anyone who opens the Portal see this right away.`;
}

/**
 * The confirm's second line: what changes, from `form` (now) to `next` (the editor). `nowMs` is the moment the confirm
 * shows: the deadline says applications open again only when the deadline has passed and the new one is still ahead
 * (both compared as Eastern instants, the hour included).
 */
export function confirmWhat(k: SaveKey, form: CycleForm, next: CycleForm, nowMs: number, applications: number, booked: number | null): string {
  const at = (t: string) => clockName(t || '00:00');
  const day = (d: string) => (isDate(d) ? shortDate(d) : 'not set');
  const instant = (d: string, t: string) => {
    const iso = isDate(d) ? easternToIso(d, t || '00:00') : null;
    return iso ? Date.parse(iso) : null;
  };
  if (k === 'amount') {
    const was = parseAmountCents(form.amount);
    const now = parseAmountCents(next.amount);
    const w = was === null ? 'not set' : money(was);
    const n = now === null ? 'not set' : money(now);
    return applications > 0 ? `The award changes from ${w} to ${n} on the Portal. Students applied for ${w}.` : `The award changes from ${w} to ${n} on the Portal.`;
  }
  if (k === 'closes') {
    if (!isDate(next.closesDate)) return 'Applicants will no longer see a deadline.';
    const line = `New deadline: ${shortDate(next.closesDate)}, ${at(next.closesTime)}.`;
    const was = instant(form.closesDate, form.closesTime);
    const will = instant(next.closesDate, next.closesTime);
    const reopens = was !== null && was <= nowMs && will !== null && will > nowMs;
    return reopens ? `${line} That is still ahead, so applications open again on the Portal until then.` : line;
  }
  if (k === 'interviews') {
    if (!isDate(next.interviewStart) && !isDate(next.interviewEnd)) return 'Applicants will no longer see interview weeks.';
    const line = `New interview weeks: ${day(next.interviewStart)} to ${day(next.interviewEnd)}.`;
    if (booked === null || applications <= 0) return line;
    return `${line} ${booked} of the ${applications} have booked a time; the other ${Math.max(0, applications - booked)} pick from times inside these dates.`;
  }
  if (k === 'decision') {
    if (!isDate(next.decisionDate)) return 'Applicants will no longer see a decision date.';
    return `New decision date: ${shortDate(next.decisionDate)}. Applicants see it as the day they hear back.`;
  }
  if (!isDate(next.opensDate)) return 'Applicants will no longer see an open date.';
  return `New open date: ${shortDate(next.opensDate)}, ${at(next.opensTime)}.`;
}

/** The confirm button's words. */
export function confirmLabel(k: SaveKey): string {
  return k === 'amount' ? 'Change the amount' : 'Change it for students';
}

// ---------- the error a row shows ----------

/** The error key(s) (lib/cycle-settings FieldKey) that belong to each row. */
const ERR_KEYS: Record<SaveKey, FieldKey[]> = {
  awardName: ['awardName'],
  amount: ['amount'],
  opens: ['opens'],
  closes: ['closes'],
  interviews: ['interviewStart', 'interviewEnd'],
  decision: ['decisionDate'],
  nextMonth: ['nextCycleMonth'],
  photoDue: ['photoDue'],
  payment: ['paymentNote'],
  event: ['event'],
  eventAt: ['event'],
  reqs: ['requirements'],
};

/** The first error in `errors` that belongs to row `k`, else the first one at all (a change can break another row's order). */
export function rowError(k: SaveKey, errors: FieldErrors | undefined, message: string): string {
  if (!errors) return message;
  const own = ERR_KEYS[k].map((e) => errors[e]).find(Boolean);
  return own ?? Object.values(errors).find(Boolean) ?? message;
}

/** The amount as the editor shows it ("2,500" for whole dollars, as the demo types it). */
export function amountField(cents: number | null): string {
  if (cents === null) return '';
  return cents % 100 ? centsToField(cents) : (cents / 100).toLocaleString('en-US');
}
