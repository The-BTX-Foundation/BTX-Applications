// The rules for saving SOME of a cycle's settings (one row of the Cycle settings page at a time). Pure, so the page (to
// show the error before asking the server) and the server action saveCycleFields (lib/cycle-settings-actions.ts, which
// decides) run the same code, and the tests cover both. The whole-form rules stay in lib/cycle-settings.ts
// (validateForm, missingForPublish); this file adds: which form fields may be sent at all, the patch's types and sizes,
// "nobody changed this since you looked", "a date needs its hour", "a published cycle can't lose a setting students see",
// and the columns that a patch is allowed to write (only those of the fields sent).
import { easternParts, easternToIso, isDate, isTime, missingForPublish, parseAmountCents, rowToForm, validateForm, LIMITS, MONTHS, type CycleForm, type CycleRow, type FieldErrors, type FieldKey } from './cycle-settings';

/** The form fields a patch may carry: exactly the settings drawn on the page. Status, term, year, essay fields, the
 * sign-in code lifetime and decisions_released_at are not settings here and can never be written through a patch. */
export const PATCH_KEYS = [
  'awardName',
  'amount',
  'opensDate',
  'opensTime',
  'closesDate',
  'closesTime',
  'interviewStart',
  'interviewEnd',
  'decisionDate',
  'nextCycleMonth',
  'requirements',
  'photoDue',
  'paymentNote',
  'eventEnabled',
  'eventDate',
  'eventTime',
] as const satisfies readonly (keyof CycleForm)[];

export type PatchKey = (typeof PATCH_KEYS)[number];
export type CyclePatch = Partial<Pick<CycleForm, PatchKey>>;

/** The column(s) each form field is stored in. */
const COLUMN_OF: Record<PatchKey, string> = {
  awardName: 'award_name',
  amount: 'award_amount_cents',
  opensDate: 'opens_at',
  opensTime: 'opens_at',
  closesDate: 'closes_at',
  closesTime: 'closes_at',
  interviewStart: 'interview_start',
  interviewEnd: 'interview_end',
  decisionDate: 'decision_date',
  nextCycleMonth: 'next_cycle_month',
  requirements: 'requirements',
  photoDue: 'photo_due',
  paymentNote: 'payment_note',
  eventEnabled: 'event_enabled',
  eventDate: 'event_at',
  eventTime: 'event_at',
};

/** The error key (lib/cycle-settings FieldKey) each form field's problems are reported under. */
const ERROR_OF: Record<PatchKey, FieldKey> = {
  awardName: 'awardName',
  amount: 'amount',
  opensDate: 'opens',
  opensTime: 'opens',
  closesDate: 'closes',
  closesTime: 'closes',
  interviewStart: 'interviewStart',
  interviewEnd: 'interviewEnd',
  decisionDate: 'decisionDate',
  nextCycleMonth: 'nextCycleMonth',
  requirements: 'requirements',
  photoDue: 'photoDue',
  paymentNote: 'paymentNote',
  eventEnabled: 'event',
  eventDate: 'event',
  eventTime: 'event',
};

export const NOT_ALLOWED = 'That change is not allowed.';
export const STALE = 'Someone changed this since the page loaded. Reload to see it.';
export const ARCHIVED = 'An archived cycle can not be changed.';
export const NEEDS_HOUR = 'Pick a time too.';
export const NO_BLANK = "Students see this on the Portal, so it can't be empty.";
export const NO_SUCH_TIME = "That time doesn't exist on that day (clocks change). Pick another.";

// True when an Eastern date and hour exist (the hour skipped when clocks go forward in March does not: storing it would
// quietly move it an hour).
function realHour(date: string, time: string): boolean {
  if (!isDate(date) || !isTime(time)) return true;
  const back = easternParts(easternToIso(date, time));
  return back.date === date && back.time === time;
}

// The longest raw text accepted before the real checks (the payment note's limit, with room for spaces).
const MAX_RAW = LIMITS.paymentNote + 100;

// True for a plain object (not null, not an array).
function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Checks a patch that came from the browser: an object with at least one key, every key a setting on the page, every
 * value the right type and size (requirements: at most 12 strings of at most 200 characters). Null when it isn't one.
 */
export function readPatch(v: unknown): CyclePatch | null {
  if (!isObj(v)) return null;
  const keys = Object.keys(v);
  if (keys.length === 0 || keys.length > PATCH_KEYS.length) return null;
  const out: Record<string, unknown> = {};
  for (const k of keys) {
    if (!(PATCH_KEYS as readonly string[]).includes(k)) return null;
    const val = v[k];
    if (k === 'eventEnabled') {
      if (typeof val !== 'boolean') return null;
    } else if (k === 'requirements') {
      if (!Array.isArray(val) || val.length > LIMITS.requirements) return null;
      if (!val.every((s) => typeof s === 'string' && s.length <= LIMITS.requirement)) return null;
    } else if (typeof val !== 'string' || val.length > MAX_RAW) {
      return null;
    }
    out[k] = val;
  }
  return out as CyclePatch;
}

// True when two values of one field mean the same thing (amounts by cents, text trimmed, lists item by item).
function same(k: PatchKey, a: unknown, b: unknown): boolean {
  if (k === 'amount') return parseAmountCents(String(a ?? '')) === parseAmountCents(String(b ?? '')) && (parseAmountCents(String(a ?? '')) !== null || String(a ?? '').trim() === String(b ?? '').trim());
  if (k === 'requirements') {
    const x = Array.isArray(a) ? a.map((s) => String(s).trim()).filter(Boolean) : [];
    const y = Array.isArray(b) ? b.map((s) => String(s).trim()).filter(Boolean) : [];
    return x.length === y.length && x.every((s, i) => s === y[i]);
  }
  if (k === 'eventEnabled') return a === b;
  return String(a ?? '').trim() === String(b ?? '').trim();
}

/** True when the patch changes nothing compared with the form. */
export function unchanged(form: CycleForm, patch: CyclePatch): boolean {
  return (Object.keys(patch) as PatchKey[]).every((k) => same(k, form[k], patch[k]));
}

/**
 * The first problem a patch brings, or null. Shown in the row's editor, and the server refuses on the same answer.
 * Only problems that are the patch's own count: an error on a field it touches, or an error it creates or changes
 * elsewhere (moving the deadline after the interviews). A date needs its hour (a date alone would be stored as nothing).
 * A published cycle can't lose any of the four settings students see first.
 */
export function patchProblem(form: CycleForm, patch: CyclePatch, status: string): { message: string; errors?: FieldErrors } | null {
  const merged: CycleForm = { ...form, ...patch };
  const touched = new Set((Object.keys(patch) as PatchKey[]).map((k) => ERROR_OF[k]));
  if (('opensDate' in patch || 'opensTime' in patch) && merged.opensDate && !merged.opensTime) return { message: NEEDS_HOUR, errors: { opens: NEEDS_HOUR } };
  if (('closesDate' in patch || 'closesTime' in patch) && merged.closesDate && !merged.closesTime) return { message: NEEDS_HOUR, errors: { closes: NEEDS_HOUR } };
  if (('eventTime' in patch) && merged.eventTime && !merged.eventDate) return { message: 'Pick a date too.', errors: { event: 'Pick a date too.' } };
  if (('opensDate' in patch || 'opensTime' in patch) && !realHour(merged.opensDate, merged.opensTime)) return { message: NO_SUCH_TIME, errors: { opens: NO_SUCH_TIME } };
  if (('closesDate' in patch || 'closesTime' in patch) && !realHour(merged.closesDate, merged.closesTime)) return { message: NO_SUCH_TIME, errors: { closes: NO_SUCH_TIME } };
  if (('eventDate' in patch || 'eventTime' in patch) && merged.eventTime && !realHour(merged.eventDate, merged.eventTime)) return { message: NO_SUCH_TIME, errors: { event: NO_SUCH_TIME } };
  const before = validateForm(form);
  const after = validateForm(merged);
  const fresh = (Object.entries(after) as [FieldKey, string][]).find(([k, m]) => touched.has(k) || before[k] !== m);
  if (fresh) return { message: fresh[1], errors: { [fresh[0]]: fresh[1] } };
  if (status === 'published') {
    const gone = missingForPublish(merged).find((m) => touched.has(m.key));
    if (gone) return { message: NO_BLANK, errors: { [gone.key]: NO_BLANK } };
  }
  return null;
}

/**
 * The columns a patch writes, computed from the whole merged form but limited to the patch's own fields, so a stale
 * page never writes a field it did not change. Opens/closes/event times are stored as one Eastern instant each.
 */
export function patchColumns(merged: CycleForm, patch: CyclePatch): CycleColumns {
  const blank = (s: string) => (s.trim() === '' ? null : s.trim());
  const all = {
    award_name: blank(merged.awardName),
    award_amount_cents: parseAmountCents(merged.amount),
    opens_at: easternToIso(merged.opensDate, merged.opensTime),
    closes_at: easternToIso(merged.closesDate, merged.closesTime),
    interview_start: blank(merged.interviewStart),
    interview_end: blank(merged.interviewEnd),
    decision_date: blank(merged.decisionDate),
    next_cycle_month: blank(merged.nextCycleMonth),
    requirements: merged.requirements.map((s) => s.trim()).filter(Boolean),
    photo_due: blank(merged.photoDue),
    payment_note: blank(merged.paymentNote),
    event_enabled: merged.eventEnabled,
    // The event's date stays stored when the event is switched off, so switching it back on (or Undo) keeps it.
    event_at: isDate(merged.eventDate) ? easternToIso(merged.eventDate, merged.eventTime || '00:00') : null,
  };
  const cols = new Set((Object.keys(patch) as PatchKey[]).map((k) => COLUMN_OF[k]));
  return Object.fromEntries(Object.entries(all).filter(([c]) => cols.has(c))) as CycleColumns;
}

/** The cycles columns a save may write (a subset of them). */
export type CycleColumns = Partial<{
  award_name: string | null;
  award_amount_cents: number | null;
  opens_at: string | null;
  closes_at: string | null;
  interview_start: string | null;
  interview_end: string | null;
  decision_date: string | null;
  next_cycle_month: string | null;
  requirements: string[];
  photo_due: string | null;
  payment_note: string | null;
  event_enabled: boolean;
  event_at: string | null;
}>;

export type FieldsPlan = { ok: true; columns: CycleColumns } | { ok: false; message: string; stale?: boolean; errors?: FieldErrors };

/**
 * The server's decision on one save, given the row as it is now: refuse an archived cycle, answer success with nothing to
 * write when the row already holds the patch (a repeated save), refuse when any field the page last saw (`before`, same
 * keys as the patch) has changed since, refuse the patch's own problems, else the columns to write. `before` and `patch` must carry the same keys.
 */
export function planFieldSave(cur: CycleRow, patch: CyclePatch, before: CyclePatch): FieldsPlan {
  if (cur.status === 'archived') return { ok: false, message: ARCHIVED };
  const pk = Object.keys(patch).sort();
  const bk = Object.keys(before).sort();
  if (pk.length !== bk.length || pk.some((k, i) => k !== bk[i])) return { ok: false, message: NOT_ALLOWED };
  if (cur.status !== 'draft' && cur.status !== 'published') return { ok: false, message: NOT_ALLOWED };
  const form = rowToForm(cur);
  // Already saved (a repeated save, or one whose first answer came too late): success, nothing written again.
  if (unchanged(form, patch)) return { ok: true, columns: {} };
  if (!(Object.keys(before) as PatchKey[]).every((k) => same(k, form[k], before[k]))) return { ok: false, message: STALE, stale: true };
  const problem = patchProblem(form, patch, cur.status);
  if (problem) return { ok: false, ...problem };
  // Belt and braces: the month is one of twelve names (validateForm checks it too).
  if (patch.nextCycleMonth && !(MONTHS as readonly string[]).includes(patch.nextCycleMonth)) return { ok: false, message: 'Pick a month.' };
  return { ok: true, columns: patchColumns({ ...form, ...patch }, patch) };
}
