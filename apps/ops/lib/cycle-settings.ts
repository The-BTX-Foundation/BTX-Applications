// The rules behind the Cycle settings page: turning database rows into form values and back (all times Eastern),
// checking the dates are in a sensible order, working out what a draft still needs before it can be published, and the
// publish / unpublish rules. Pure functions, so the page, the server actions and the tests all use the same code.
// Not stored per cycle: the three short-answer questions (they live in code) and the sign-in code lifetime (one value
// for the whole app), so neither is a setting here.

export const NY = 'America/New_York';

export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

export const LIMITS = { awardName: 120, paymentNote: 2000, requirement: 200, requirements: 12, maxDollars: 1_000_000 } as const;

/** What the form holds. Dates are "YYYY-MM-DD", times are "HH:MM" (24 hour), all Eastern; empty string = not set. */
export type CycleForm = {
  awardName: string;
  /** Dollars as typed, e.g. "2,500" or "$2,500.00". */
  amount: string;
  opensDate: string;
  opensTime: string;
  closesDate: string;
  closesTime: string;
  interviewStart: string;
  interviewEnd: string;
  decisionDate: string;
  nextCycleMonth: string;
  requirements: string[];
  photoDue: string;
  paymentNote: string;
  eventEnabled: boolean;
  eventDate: string;
  eventTime: string;
};

/** The columns the page reads and writes on `cycles`. */
export type CycleRow = {
  id: string;
  term: string;
  status: string;
  award_name: string | null;
  award_amount_cents: number | null;
  opens_at: string | null;
  closes_at: string | null;
  interview_start: string | null;
  interview_end: string | null;
  decision_date: string | null;
  next_cycle_month: string | null;
  requirements: unknown;
  photo_due: string | null;
  payment_note: string | null;
  event_enabled: boolean;
  event_at: string | null;
};

export type FieldKey =
  | 'awardName'
  | 'amount'
  | 'opens'
  | 'closes'
  | 'interviewStart'
  | 'interviewEnd'
  | 'decisionDate'
  | 'nextCycleMonth'
  | 'requirements'
  | 'photoDue'
  | 'paymentNote'
  | 'event';

export type FieldErrors = Partial<Record<FieldKey, string>>;

// ---------- Eastern time <-> timestamps ----------

// The Eastern clock reading ("2026-09-14", "17:00") of a moment.
export function easternParts(ts: string | null | undefined): { date: string; time: string } {
  if (!ts) return { date: '', time: '' };
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return { date: '', time: '' };
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: NY, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

// How far Eastern time is behind UTC at a moment, in minutes (240 in summer, 300 in winter).
function offsetMinutes(at: Date): number {
  const p = easternParts(at.toISOString());
  const [y, m, d] = p.date.split('-').map(Number);
  const [hh, mm] = p.time.split(':').map(Number);
  const asUtc = Date.UTC(y, m - 1, d, hh, mm);
  return Math.round((Math.floor(at.getTime() / 60000) * 60000 - asUtc) / 60000);
}

// The moment that is the given Eastern date and time, as an ISO string. Null when either is empty or not a real date.
export function easternToIso(date: string, time: string): string | null {
  if (!isDate(date) || !isTime(time)) return null;
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time.split(':').map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // two passes so a date near a clock change still lands on the right hour
  let off = offsetMinutes(new Date(guess + 4 * 3_600_000));
  let ts = guess + off * 60_000;
  off = offsetMinutes(new Date(ts));
  ts = guess + off * 60_000;
  return new Date(ts).toISOString();
}

export function isDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function isTime(v: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
}

// ---------- money ----------

// "$2,500.00" / "2500" -> 250000 cents. Null when empty or not a sensible amount.
export function parseAmountCents(v: string): number | null {
  const s = v.replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const cents = Math.round(Number(s) * 100);
  return cents > 0 && cents <= LIMITS.maxDollars * 100 ? cents : null;
}

// 250000 -> "2,500.00" (the field's text; the "$" is drawn beside it).
export function centsToField(cents: number | null | undefined): string {
  if (cents == null) return '';
  return (cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- row <-> form ----------

export function requirementsOf(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

export function rowToForm(r: CycleRow): CycleForm {
  const opens = easternParts(r.opens_at);
  const closes = easternParts(r.closes_at);
  const event = easternParts(r.event_at);
  return {
    awardName: r.award_name ?? '',
    amount: centsToField(r.award_amount_cents),
    opensDate: opens.date,
    opensTime: opens.time,
    closesDate: closes.date,
    closesTime: closes.time,
    interviewStart: r.interview_start ?? '',
    interviewEnd: r.interview_end ?? '',
    decisionDate: r.decision_date ?? '',
    nextCycleMonth: r.next_cycle_month ?? '',
    requirements: requirementsOf(r.requirements),
    photoDue: r.photo_due ?? '',
    paymentNote: r.payment_note ?? '',
    eventEnabled: r.event_enabled,
    eventDate: event.date,
    eventTime: event.time,
  };
}

/** The columns to write for a form (only call after validateForm found no errors). */
export function formToColumns(f: CycleForm) {
  const blank = (s: string) => (s.trim() === '' ? null : s.trim());
  return {
    award_name: blank(f.awardName),
    award_amount_cents: parseAmountCents(f.amount),
    opens_at: easternToIso(f.opensDate, f.opensTime),
    closes_at: easternToIso(f.closesDate, f.closesTime),
    interview_start: blank(f.interviewStart),
    interview_end: blank(f.interviewEnd),
    decision_date: blank(f.decisionDate),
    next_cycle_month: blank(f.nextCycleMonth),
    requirements: f.requirements.map((s) => s.trim()).filter(Boolean),
    photo_due: blank(f.photoDue),
    payment_note: blank(f.paymentNote),
    event_enabled: f.eventEnabled,
    event_at: f.eventEnabled ? easternToIso(f.eventDate, f.eventTime || '00:00') : null,
  };
}

// ---------- checks ----------

// Whole-minute stamp for comparing two date + time pairs; null when either part is missing.
function stamp(date: string, time: string): number | null {
  const iso = easternToIso(date, time);
  return iso ? Date.parse(iso) : null;
}

// Checks every field and the order of the dates. Short lines, one per field; an empty result means it can be saved.
// (A missing required setting is not an error here: a draft may be saved half empty. See missingForPublish.)
export function validateForm(f: CycleForm): FieldErrors {
  const e: FieldErrors = {};
  if (f.awardName.trim().length > LIMITS.awardName) e.awardName = `Keep the name under ${LIMITS.awardName} characters.`;
  if (f.amount.trim() !== '' && parseAmountCents(f.amount) === null) e.amount = `Enter an amount in dollars, like 2,500.`;

  if (f.opensDate && !isDate(f.opensDate)) e.opens = 'Pick a real date.';
  else if (f.opensDate && f.opensTime && !isTime(f.opensTime)) e.opens = 'Pick a real time.';
  if (f.closesDate && !isDate(f.closesDate)) e.closes = 'Pick a real date.';
  else if (f.closesDate && f.closesTime && !isTime(f.closesTime)) e.closes = 'Pick a real time.';
  for (const [key, v] of [['interviewStart', f.interviewStart], ['interviewEnd', f.interviewEnd], ['decisionDate', f.decisionDate], ['photoDue', f.photoDue]] as const) {
    if (v && !isDate(v)) e[key] = 'Pick a real date.';
  }

  // Order: opens, then the deadline, then interviews, then the decision.
  const opens = stamp(f.opensDate, f.opensTime || '00:00');
  const closes = stamp(f.closesDate, f.closesTime || '00:00');
  if (!e.opens && !e.closes && opens !== null && closes !== null && closes <= opens) e.closes = 'The deadline has to be after applications open.';
  if (!e.closes && f.closesDate && isDate(f.interviewStart) && f.interviewStart < f.closesDate) e.interviewStart = 'Interviews start on or after the deadline.';
  if (!e.interviewStart && isDate(f.interviewStart) && isDate(f.interviewEnd) && f.interviewEnd < f.interviewStart) e.interviewEnd = 'Interviews end on or after they start.';
  if (!e.interviewEnd && isDate(f.decisionDate)) {
    const after = isDate(f.interviewEnd) ? f.interviewEnd : isDate(f.interviewStart) ? f.interviewStart : '';
    if (after && f.decisionDate < after) e.decisionDate = 'The decision comes on or after the last interview.';
    else if (!after && f.closesDate && f.decisionDate < f.closesDate) e.decisionDate = 'The decision comes after the deadline.';
  }

  if (f.nextCycleMonth && !(MONTHS as readonly string[]).includes(f.nextCycleMonth)) e.nextCycleMonth = 'Pick a month.';
  const reqs = f.requirements.map((s) => s.trim()).filter(Boolean);
  if (reqs.length > LIMITS.requirements) e.requirements = `Keep it to ${LIMITS.requirements} requirements.`;
  else if (reqs.some((s) => s.length > LIMITS.requirement)) e.requirements = `Keep each requirement under ${LIMITS.requirement} characters.`;
  if (f.paymentNote.length > LIMITS.paymentNote) e.paymentNote = `Keep it under ${LIMITS.paymentNote.toLocaleString('en-US')} characters.`;
  if (f.eventEnabled) {
    if (f.eventDate && !isDate(f.eventDate)) e.event = 'Pick a real date.';
    else if (f.eventTime && !isTime(f.eventTime)) e.event = 'Pick a real time.';
  }
  return e;
}

export type Missing = { key: FieldKey; label: string; target: string };

// The required settings still empty, in page order. Same four the database insists on before a cycle is published.
// `target` is the id of the field to jump to (the deadline is missing its hour when only the date is set).
export function missingForPublish(f: CycleForm): Missing[] {
  const out: Missing[] = [];
  if (!f.awardName.trim()) out.push({ key: 'awardName', label: 'Award name', target: 'cs-award-name' });
  if (parseAmountCents(f.amount) === null) out.push({ key: 'amount', label: 'Award amount', target: 'cs-amount' });
  if (!f.opensDate) out.push({ key: 'opens', label: 'Applications open date', target: 'cs-opens-date' });
  else if (!f.opensTime) out.push({ key: 'opens', label: 'Applications open hour', target: 'cs-opens-time' });
  if (!f.closesDate) out.push({ key: 'closes', label: 'Deadline date', target: 'cs-closes-date' });
  else if (!f.closesTime) out.push({ key: 'closes', label: 'Deadline hour', target: 'cs-closes-time' });
  return out;
}

// The line under the page title.
export function statusLine(status: string, f: CycleForm, now: Date = new Date()): string {
  if (status === 'archived') return 'Archived · students can no longer see it';
  if (status === 'published') {
    const opens = f.opensDate && f.opensTime ? easternToIso(f.opensDate, f.opensTime) : null;
    if (opens && Date.parse(opens) > now.getTime()) return `Published · students see it from ${dayName(f.opensDate)}`;
    return 'Published · students see it now';
  }
  return missingForPublish(f).length === 0 ? 'Draft · ready to publish' : "Draft · students can't see it yet";
}

// "2026-08-17" -> "Mon Aug 17".
export function dayName(iso: string): string {
  if (!isDate(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');
}

// "17:00" -> "5:00 PM".
export function clockName(t: string): string {
  if (!isTime(t)) return '';
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// ---------- publish and unpublish rules ----------

export type RuleResult = { ok: true } | { ok: false; message: string };

// Publishing needs a draft with every required setting, and no other cycle published (the database allows only one).
export function canPublish(input: { status: string; missing: Missing[]; otherPublishedTerm: string | null }): RuleResult {
  if (input.status === 'published') return { ok: false, message: 'This cycle is already published.' };
  if (input.status === 'archived') return { ok: false, message: 'An archived cycle can not be published.' };
  if (input.missing.length > 0) return { ok: false, message: `Publish needs ${input.missing.length} setting${input.missing.length === 1 ? '' : 's'} first.` };
  if (input.otherPublishedTerm) return { ok: false, message: `${input.otherPublishedTerm} is already published, and only one cycle can be published at a time.` };
  return { ok: true };
}

// Unpublishing is only for a published cycle nobody has applied to yet. After the first application starts, an admin
// moves the deadline to stop early instead.
export function canUnpublish(input: { status: string; applications: number }): RuleResult {
  if (input.status !== 'published') return { ok: false, message: 'This cycle is not published.' };
  if (input.applications > 0) return { ok: false, message: 'Applications have started. To stop early, move the deadline.' };
  return { ok: true };
}
