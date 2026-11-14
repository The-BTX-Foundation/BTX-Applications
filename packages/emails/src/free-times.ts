// "None of these times work": a student with no interview time sends the times she is free (interview_free_times, one row
// per application: `ranges` as Eastern day + "HH:MM" start and end, `said` what she typed, and on older rows `days`,
// `windows` and `note`). Shared by the Portal (the alert email to info@) and the Ops Hub (the "Asked for other times"
// list). Pure functions: no database, no clock of their own, safe in the browser (the Ops Hub imports this file directly
// as '@btx/emails/free-times' so the rest of the package never reaches a browser bundle).

/** One range as the Portal saves it: "2026-11-15", "15:00", "22:00" (Eastern wall-clock time; "24:00" is midnight at the end). */
export type FreeRange = { day: string; start: string; end: string };

const TIME_ZONE = 'America/New_York';

/** "15:30" -> 930, "24:00" -> 1440, or null when it is not a time of day. */
export function rangeMinutes(hhmm: string): number | null {
  const m = /^(\d{1,2}):([0-5]\d)$/.exec(String(hhmm ?? '').trim());
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v <= 1440 ? v : null;
}

// True for a real calendar day written "YYYY-MM-DD".
const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;

/** The ranges in a stored `ranges` value that are usable (a real day, two times, the end after the start), sorted by day and start. */
export function cleanFreeRanges(value: unknown): FreeRange[] {
  if (!Array.isArray(value)) return [];
  const out: FreeRange[] = [];
  for (const v of value) {
    if (!v || typeof v !== 'object') continue;
    const r = v as Record<string, unknown>;
    if (typeof r.day !== 'string' || typeof r.start !== 'string' || typeof r.end !== 'string') continue;
    const s = rangeMinutes(r.start);
    const e = rangeMinutes(r.end);
    if (!isDay(r.day) || s === null || e === null || e <= s) continue;
    out.push({ day: r.day, start: r.start, end: r.end });
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || (rangeMinutes(a.start) ?? 0) - (rangeMinutes(b.start) ?? 0));
}

// 930 -> { text: "3:30", half: "PM" }; 1440 is midnight (handled by the caller).
function clockParts(min: number): { text: string; half: 'AM' | 'PM' } {
  const h = Math.floor(min / 60) % 24;
  return { text: `${h % 12 || 12}:${String(min % 60).padStart(2, '0')}`, half: h < 12 ? 'AM' : 'PM' };
}

/** "Sun Nov 15" for "2026-11-15" (a calendar day, no zone shift). */
export function freeDayLabel(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(Date.UTC(y, m - 1, d))).replace(',', '');
}

/**
 * One range as a readable line in Eastern time: "Sun Nov 15, 3:00 to 10:00 PM" (one AM/PM when both ends share it),
 * "Sat Nov 14, 11:00 AM to 2:00 PM", "Fri Nov 13, 6:00 PM to midnight". Null for a range that is not usable.
 */
export function freeRangeLine(r: FreeRange): string | null {
  const [clean] = cleanFreeRanges([r]);
  if (!clean) return null;
  const s = rangeMinutes(clean.start)!;
  const e = rangeMinutes(clean.end)!;
  const a = clockParts(s);
  if (e === 1440) return `${freeDayLabel(clean.day)}, ${a.text} ${a.half} to midnight`;
  const b = clockParts(e);
  return a.half === b.half ? `${freeDayLabel(clean.day)}, ${a.text} to ${b.text} ${b.half}` : `${freeDayLabel(clean.day)}, ${a.text} ${a.half} to ${b.text} ${b.half}`;
}

/** Every usable range as a line, in day and time order. */
export function freeRangeLines(value: unknown): string[] {
  return cleanFreeRanges(value).map((r) => freeRangeLine(r)).filter((l): l is string => l !== null);
}

/** An older answer (days of the week and parts of the day): "Mon, Wed · evening". Empty when there is nothing to show. */
export function oldAnswerLine(days: string[] | null | undefined, windows: string[] | null | undefined): string {
  const d = (days ?? []).filter((x) => typeof x === 'string' && x.trim());
  const w = (windows ?? []).filter((x) => typeof x === 'string' && x.trim());
  return [d.join(', '), w.join(', ')].filter(Boolean).join(' · ');
}

// An instant's Eastern day and minutes after midnight.
function easternDayMinute(iso: string): { day: string; min: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(iso));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return { day: `${get('year')}-${get('month')}-${get('day')}`, min: Number(get('hour')) * 60 + Number(get('minute')) };
}

/**
 * True when an interview time lies fully inside one of her ranges, in Eastern time: same day, starting at or after the
 * range's start and ending at or before its end. A time that crosses midnight never fits (ranges are within one day).
 */
export function slotFitsRanges(startsAt: string, endsAt: string, ranges: FreeRange[]): boolean {
  const start = Date.parse(startsAt);
  const end = Date.parse(endsAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return false;
  const { day, min } = easternDayMinute(startsAt);
  const until = min + Math.round((end - start) / 60_000);
  return cleanFreeRanges(ranges).some((r) => r.day === day && rangeMinutes(r.start)! <= min && rangeMinutes(r.end)! >= until);
}

/** "Tue Nov 10, 9:14 PM" in Eastern time. */
export function sentLabel(iso: string): string {
  const p: Record<string, string> = {};
  for (const x of new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(new Date(iso))) p[x.type] = x.value;
  return `${p.weekday} ${p.month} ${p.day}, ${p.hour}:${p.minute} ${String(p.dayPeriod ?? '').toUpperCase()}`.trim();
}
