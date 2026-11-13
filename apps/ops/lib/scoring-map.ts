// Pure mapping for the Scoring page (lib/scoring-view.ts): database rows -> the view, the words the page draws for time
// ("yesterday", "Mon", "9:14 AM"), and the page's caps. No database calls here, so tests/scoring-map.test.ts checks every
// rule with sample rows.
//
// Blind scoring: mapSheets keeps only the signed-in person's own score rows (any other row is dropped, whatever the reader
// returned), and the other interviewer is only ever "published" or "not published" (from score_progress(), no values).
// cycleAverages averages only scores the person may see (their own published ones and released ones, where both
// interviewers published) and returns only the averages.
import { weightedScore } from './sch-logic';
import { isTestApplication } from './test-application';
import { clock, daysFrom, easternDay, shortDate, weekday } from './refresh-time';
import type { ScCaps, ScCriterion, ScQuote, ScSheet } from './scoring-view';

/** A database row as the reader returns it. */
export type Row = Record<string, unknown>;

/** Live mode: no un-publish exists (D8) and the page sends no messages, so neither demo extra is drawn. */
export const LIVE_CAPS: ScCaps = { undoPublish: false, nudge: false };
/** Mock mode: the demo's full flow. */
export const MOCK_CAPS: ScCaps = { undoPublish: true, nudge: true };

/** The five labels of a pick, 1 to 5. */
export const PICK_LABELS = ['Not evident', 'Emerging', 'Solid', 'Strong', 'Exceptional'] as const;

/** "4" -> "Strong". */
export const pickLabel = (v: number): string => PICK_LABELS[v - 1] ?? '';

// The demo's short names for the standard rubric keys.
const SHORT: Record<string, string> = {
  community: 'Community',
  resilience: 'Resilience',
  leadership: 'Leadership',
  financial: 'Financial need',
  communication: 'Communication',
  passion: 'Passion',
};

/** A criterion's short name: the demo's word for a standard key, else the name up to " and " ("Teamwork and X" -> "Teamwork"). */
export function shortName(key: string, name: string): string {
  return SHORT[key] ?? name.split(' and ')[0];
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

// ---------- Time words (counted from the view's Eastern `today`) ----------

/** The demo's "Interviewed ..." word for a calendar day: "today", "yesterday", a weekday within 5 days, else "Thu Nov 12". */
export function agoWord(today: string, day: string): string {
  const n = daysFrom(today, day);
  if (n === 0) return 'today';
  if (n === -1) return 'yesterday';
  if (n < 0 && n >= -5) return weekday(day);
  return shortDate(day);
}

/** When something happened, as the footer and the "Published" line say it: the clock today ("9:14 AM"), else the day word. */
export function whenWords(today: string, instant: string): string {
  const day = easternDay(instant);
  return day === today ? clock(instant) : agoWord(today, day);
}

/** "Thu, Nov 19" beside the title. */
export function titleDate(today: string): string {
  const [wd, mo, d] = shortDate(today).split(' ');
  return `${wd}, ${mo} ${d}`;
}

// ---------- Sheets ----------

/** The rows live mode reads for the queue (each already filtered by the reader). */
export type ScLiveRows = {
  /** The signed-in person's pairings: slot_id, interviewer_a, interviewer_b. */
  pairings: Row[];
  /** Active bookings of those slots: application_id, slot_id, interview_slots { starts_at }. */
  bookings: Row[];
  /** The submitted applications of the published cycle among them: id, applicant_code, full_name, terpmail. */
  apps: Row[];
  /** The signed-in person's own score rows (anything else is dropped here). */
  scores: Row[];
  /** score_progress(): application_id, scorer_id, published (no values). */
  progress: Row[];
  /** Their own private notes: application_id, note. */
  notes: Row[];
  /** interview_summaries: application_id, summary, quotes, duration_minutes. */
  summaries: Row[];
  /** staff_profiles: user_id, display_name. */
  staff: Row[];
};

// The start of a booking's slot (the embedded interview_slots row may come back as an object or a one-item list).
function slotStart(b: Row): string | null {
  const s = b.interview_slots as Row | Row[] | null | undefined;
  const one = Array.isArray(s) ? s[0] : s;
  return one ? str(one.starts_at) : null;
}

// Only whole picks 1 to 5 under a string key (anything else in the jsonb is ignored).
function cleanPicks(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {};
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).filter((e): e is [string, number] => Number.isInteger(e[1]) && (e[1] as number) >= 1 && (e[1] as number) <= 5));
}

/** The interview quotes of a summary, captioned with the criterion's short name when the quote names one. */
export function mapQuotes(raw: unknown, criteria: Pick<ScCriterion, 'key' | 'name' | 'short'>[]): ScQuote[] {
  if (!Array.isArray(raw)) return [];
  const out: ScQuote[] = [];
  for (const q of raw as Row[]) {
    const text = str(q?.text);
    if (!text) continue;
    const c = str(q.criterion);
    const hit = c ? criteria.find((k) => k.key === c || k.short.toLowerCase() === c.toLowerCase() || k.name.toLowerCase() === c.toLowerCase()) : undefined;
    out.push({ key: hit?.key ?? null, label: hit?.short ?? c ?? '', at: str(q.at) ?? '', text });
  }
  return out;
}

/**
 * The signed-in person's queue: every submitted application where they are one of the pair on its active booking and the
 * interview has started, oldest interview first. Only `me`'s own score rows are used; the other interviewer is a name and a
 * published yes/no.
 */
export function mapSheets(rows: ScLiveRows, criteria: ScCriterion[], me: string, now: string): ScSheet[] {
  const pairBySlot = new Map<string, { a: string; b: string }>();
  for (const p of rows.pairings) {
    const a = String(p.interviewer_a ?? '');
    const b = String(p.interviewer_b ?? '');
    if (a === me || b === me) pairBySlot.set(String(p.slot_id), { a, b });
  }
  const appById = new Map(rows.apps.map((a) => [String(a.id), a]));
  const names = new Map(rows.staff.map((s) => [String(s.user_id), str(s.display_name)]));
  // Defence in depth: whatever the reader returned, only my own rows count.
  const own = new Map(rows.scores.filter((s) => String(s.scorer_id) === me).map((s) => [String(s.application_id), s]));
  const notes = new Map(rows.notes.map((n) => [String(n.application_id), typeof n.note === 'string' ? n.note : '']));
  const sums = new Map(rows.summaries.map((s) => [String(s.application_id), s]));
  const nowMs = Date.parse(now);

  const out: (ScSheet & { at: string })[] = [];
  const seen = new Set<string>();
  for (const b of rows.bookings) {
    const appId = String(b.application_id);
    const pair = pairBySlot.get(String(b.slot_id));
    const app = appById.get(appId);
    const at = slotStart(b);
    // Mine, submitted in this cycle, and the interview has started.
    if (!pair || !app || !at || Date.parse(at) > nowMs || seen.has(appId)) continue;
    seen.add(appId);
    const otherId = pair.a === me ? pair.b : pair.a;
    const s = own.get(appId);
    const sm = sums.get(appId);
    const published = s?.published === true;
    const mins = Number(sm?.duration_minutes);
    const code = str(app.applicant_code) ?? '—';
    out.push({
      at,
      applicationId: appId,
      code,
      name: str(app.full_name)?.trim() ?? code,
      test: isTestApplication(typeof app.terpmail === 'string' ? app.terpmail : null),
      interviewDay: easternDay(at),
      minutes: Number.isFinite(mins) && mins > 0 ? mins : null,
      otherName: names.get(otherId) ?? 'the other interviewer',
      otherPublished: rows.progress.some((p) => String(p.application_id) === appId && String(p.scorer_id) === otherId && p.published === true),
      picks: cleanPicks(s?.criteria),
      published,
      publishedAt: published ? str(s?.published_at) : null,
      savedAt: s && !published ? str(s.updated_at) : null,
      summary: str(sm?.summary),
      quotes: mapQuotes(sm?.quotes, criteria),
      note: notes.get(appId) ?? '',
    });
  }
  out.sort((x, y) => x.at.localeCompare(y.at) || x.code.localeCompare(y.code));
  return out.map((s) => {
    const sheet: ScSheet & { at?: string } = { ...s };
    delete sheet.at;
    return sheet;
  });
}

// ---------- Criteria and the cycle average ----------

/**
 * The cycle average per criterion over the scores the person may see: their own published scores, and published scores of
 * applications where both interviewers published (two published rows in score_progress()). Any other row is ignored, so an
 * unpublished or unreleased score can never move an average, whatever the reader returned. Null where nothing counts.
 */
export function cycleAverages(keys: string[], scores: Row[], progress: Row[], me: string): Record<string, string | null> {
  const pubCount = new Map<string, number>();
  for (const p of progress) if (p.published === true) pubCount.set(String(p.application_id), (pubCount.get(String(p.application_id)) ?? 0) + 1);
  const counted = scores.filter((s) => s.published === true && (String(s.scorer_id) === me || (pubCount.get(String(s.application_id)) ?? 0) >= 2));
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    const vals = counted.map((s) => cleanPicks(s.criteria)[k]).filter((v): v is number => typeof v === 'number');
    out[k] = vals.length ? (vals.reduce((n, v) => n + v, 0) / vals.length).toFixed(1) : null;
  }
  return out;
}

/** The rubric in order, with each criterion's questions and average. */
export function mapCriteria(rubric: Row[], questions: Row[], avg: Record<string, string | null>): ScCriterion[] {
  const qs = new Map<string, string[]>();
  for (const q of questions) {
    const k = str(q.criterion_key);
    const t = str(q.text);
    if (k && t) qs.set(k, [...(qs.get(k) ?? []), t]);
  }
  return [...rubric]
    .sort((a, b) => Number(a.position) - Number(b.position))
    .map((r) => {
      const key = String(r.key);
      const name = str(r.name) ?? key;
      return { key, name, short: shortName(key, name), weight: Number(r.weight) || 0, avg: avg[key] ?? null, questions: qs.get(key) ?? [] };
    });
}

// ---------- What a sheet says ----------

/** How many criteria are picked. */
export const pickedCount = (s: Pick<ScSheet, 'picks'>, criteria: Pick<ScCriterion, 'key'>[]): number => criteria.filter((c) => s.picks[c.key]).length;

/** The person's own score so far ("3.7"), with the same rule as the database (lib/sch-logic.ts weightedScore), or null. */
export function ownScore(s: Pick<ScSheet, 'picks'>, criteria: Pick<ScCriterion, 'key' | 'weight'>[]): string | null {
  const w = weightedScore(criteria, s.picks);
  return w === null ? null : w.toFixed(1);
}

/** The next criterion without a pick, looking forward from `after` and wrapping round; null when all are picked. */
export function nextUnscored(s: Pick<ScSheet, 'picks'>, criteria: Pick<ScCriterion, 'key'>[], after?: string | null): string | null {
  const i0 = after ? criteria.findIndex((c) => c.key === after) + 1 : 0;
  for (let k = 0; k < criteria.length; k++) {
    const c = criteria[(i0 + k) % criteria.length];
    if (!s.picks[c.key]) return c.key;
  }
  return null;
}

/** The queue row's status line: "Published", "Both published", "Draft, 4 of 6", "Not started · Charlie published". */
export function queueStatus(s: Pick<ScSheet, 'picks' | 'published' | 'otherPublished' | 'otherName'>, criteria: Pick<ScCriterion, 'key'>[]): string {
  const n = pickedCount(s, criteria);
  if (s.published) return s.otherPublished ? 'Both published' : 'Published';
  if (n) return `Draft, ${n} of ${criteria.length}`;
  return `Not started${s.otherPublished ? ` · ${firstName(s.otherName)} published` : ''}`;
}

/** "Charlie Gaines" -> "Charlie". */
export const firstName = (name: string): string => name.split(' ')[0];

/** "Ada Okafor" -> "AO". */
export const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** The news card under the title: the sheet to open next (the one started, else the first unpublished), or null. */
export function nextUp(sheets: ScSheet[], criteria: Pick<ScCriterion, 'key'>[], due: string | null): { sheet: ScSheet; kicker: string; go: string } | null {
  const todo = sheets.filter((s) => !s.published);
  if (!todo.length) return null;
  const t = todo.find((s) => pickedCount(s, criteria) > 0) ?? todo[0];
  const by = due ? ` · due ${shortDate(due)}` : '';
  return { sheet: t, kicker: todo.length > 1 ? `${todo.length} to score${by}` : `Needs your score${by}`, go: pickedCount(t, criteria) ? 'Continue' : 'Score' };
}
