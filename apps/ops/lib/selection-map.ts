// The Selection page's pure logic (no database, no React): paging helpers for the live reads, the mapping from table rows
// to the page's shape (lib/selection-view.ts), and every rule the board draws from (which phase the page is in, the news
// card, the timeline, the release counts, who may undo what, the extra-award form check, local overrides after a write).
// Unit tested in tests/selection-map.test.ts.
import { checkExtraAward, dollarsToCents } from './award-input';
import { clock, daysFrom, easternDay, shortDate } from './refresh-time';
import { releaseCounts } from './release-copy';
import { shortAwardName, sortRanking } from './sch-logic';
import { isTestApplication } from './test-application';
import type { SelectionView, SlAward, SlCrit, SlCycle, SlMeeting, SlPerson, SlQuote, SlRow, SlUnscored } from './selection-view';

/** A table row as the database API returns it. */
export type Row = Record<string, unknown>;

// ---------- Paged reads (the house pattern from lib/awardees-map.ts, kept here so this page owns its copy) ----------

/** Rows per page and the most pages one read may take (20,000 rows) before it counts as a load error. */
export const SL_PAGE = 1000;
export const SL_MAX_PAGES = 20;
/** Ids per `in (...)` read. */
export const SL_ID_CHUNK = 100;

/**
 * Reads every row through `fetchPage(from, to)` (inclusive positions, as `.range()` takes them). Each page starts after
 * the rows read so far (the server may return fewer than asked); only an empty page ends the read; a read still going at
 * the ceiling throws (the page shows its load error, never partial data).
 */
export async function pageRows<T>(fetchPage: (from: number, to: number) => Promise<T[]>, size = SL_PAGE, max = SL_MAX_PAGES): Promise<T[]> {
  const out: T[] = [];
  for (let p = 0; p < max; p++) {
    const rows = await fetchPage(out.length, out.length + size - 1);
    if (rows.length === 0) return out;
    out.push(...rows);
  }
  throw new Error(`Read reached ${max} pages; refusing partial data.`);
}

/** Splits ids into chunks of SL_ID_CHUNK (a long id list would overflow the request URL). */
export function chunked<T>(ids: T[], size = SL_ID_CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** How a raced call ended: its answer, a thrown error (network, server), or still running at the time limit. */
export type Settled<T> = { kind: 'answer'; value: T } | { kind: 'error' } | { kind: 'timeout' };

/** Races a call against `ms`; a call still running then counts as timed out (its late answer is ignored). */
export function withTimeout<T>(p: Promise<T>, ms: number): Promise<Settled<T>> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve({ kind: 'timeout' }), ms);
    p.then(
      (value) => {
        clearTimeout(t);
        resolve({ kind: 'answer', value });
      },
      () => {
        clearTimeout(t);
        resolve({ kind: 'error' });
      },
    );
  });
}

// ---------- Words ----------

/** "$2,500". */
export function money(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US')}`;
}

/** "1 extra award" / "2 extra awards". */
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** A rubric question's short label: the words before " and " ("Community engagement and values" -> "Community engagement"). */
export function critShort(name: string): string {
  const i = name.indexOf(' and ');
  return (i > 0 ? name.slice(0, i) : name).trim() || name;
}

/** "Dana Mercer" -> "Dana". */
export function firstOf(name: string): string {
  return name.trim().split(/\s+/)[0] || name;
}

/** "Tue Nov 24, 7:00 PM" (Eastern) for an instant. */
export function dayTime(instant: string): string {
  return `${shortDate(easternDay(instant))}, ${clock(instant)}`;
}

/** The real undo rule (lib/actions/selection.ts undoAward): until the award letter goes out or decisions are released. */
export const UNDO_RULE = 'You can undo until the award letter goes out or decisions are released.';

/** The confirm body for the main award (nothing reaches students before the release). */
export function mainConfirmBody(i: { name: string; code: string; mainName: string; cents: number }): string {
  return `${i.name} (${i.code}) gets the ${i.mainName} Scholarship, ${money(i.cents)}. This sets up the award email for ${firstOf(i.name)} and the decline emails for everyone else. Nothing goes to students until decisions are released. ${UNDO_RULE}`;
}

/** The confirm body for an extra award. */
export function extraConfirmBody(i: { name: string; code: string; awardName: string; cents: number }): string {
  return `${i.name} (${i.code}) gets ${i.awardName}, ${money(i.cents)}. ${UNDO_RULE}`;
}

/** The words after a write that may have committed but never answered. */
export const NO_ANSWER = 'No answer in time. Reload to check.';
/** The words after a write that failed. */
export const SAVE_ERR = "Couldn't save. Try again.";
/** The extra-award form's "who" error (the demo's words; the name and amount errors come from lib/award-input.ts). */
export const WHO_MESSAGE = 'Choose who gets it.';
/** The "who calls the winners" agenda item (a constant: nothing records it yet). */
export const CALL_STEP = 'Who calls the winners';
export const CALL_NOTE = 'Agree on it before the meeting ends';

// ---------- Mapping (live rows -> the page's shape) ----------

const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};
/** A YYYY-MM-DD day column kept as the string it is (never parsed as UTC). */
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

/** An applicant's name: the full name, or the code when it is missing. */
function nameOf(a: Row | undefined): string {
  return str(a?.full_name).trim() || str(a?.applicant_code) || 'Applicant';
}

/** The cycle row and the count of submitted applicants. */
export function mapCycle(c: Row, total: number): SlCycle {
  const awardName = str(c.award_name) || 'Scholarship';
  return {
    id: strOrNull(c.id),
    term: str(c.term) || 'This cycle',
    mainName: shortAwardName(awardName),
    mainAwardName: awardName,
    mainCents: num(c.award_amount_cents) ?? 0,
    total,
    interviewStart: day(c.interview_start),
    interviewEnd: day(c.interview_end),
    // The cycles table has no scores-due column yet.
    scoresDue: null,
    decisionDate: day(c.decision_date),
    releasedAt: strOrNull(c.decisions_released_at),
  };
}

/** The meeting row, or null. */
export function mapMeeting(m: Row | undefined): SlMeeting | null {
  const startsAt = strOrNull(m?.starts_at);
  return startsAt ? { startsAt, videoUrl: strOrNull(m?.video_url) } : null;
}

/** The rubric rows, in their order. */
export function mapCrit(rows: Row[]): SlCrit[] {
  return rows.map((r) => ({ key: str(r.key), short: critShort(str(r.name)), weight: num(r.weight) ?? 0 }));
}

/** What the ranking is built from (all already read as the signed-in person). */
export type RankingInput = {
  /** Submitted applications of the cycle (id, applicant_code, full_name, terpmail). */
  apps: Row[];
  /** application_score_summary rows (application_id, published_count, combined_score). */
  summary: Row[];
  /** scores rows (application_id, scorer_id, criteria, weighted_score, published): only published ones are ever used. */
  scores: Row[];
  /** staff_profiles rows (user_id, display_name). */
  staff: Row[];
  /** interview_summaries rows (application_id, summary, quotes). */
  notes: Row[];
  crit: SlCrit[];
};

/**
 * The ranking and the applicants not scored yet. Ranked = both scores published (published_count >= 2 and a combined
 * score), sorted by combined score (high first), then code. Only published score rows are read here, so no unpublished
 * pick, score or scorer reaches the page; everyone else is "Not scored yet" (never why).
 */
export function mapRanking(i: RankingInput): { rows: SlRow[]; unscored: SlUnscored[] } {
  const apps = new Map(i.apps.map((a) => [str(a.id), a]));
  const staff = new Map(i.staff.map((s) => [str(s.user_id), str(s.display_name).trim()]));
  const notes = new Map(i.notes.map((n) => [str(n.application_id), n]));
  const published = i.scores.filter((s) => s.published === true);
  const ranked = sortRanking(
    i.summary
      .filter((s) => (num(s.published_count) ?? 0) >= 2 && num(s.combined_score) != null && apps.has(str(s.application_id)))
      .map((s) => {
        const a = apps.get(str(s.application_id));
        return { id: str(s.application_id), code: str(a?.applicant_code) || '—', combined: num(s.combined_score) as number, a };
      }),
  );
  const rows: SlRow[] = [];
  for (const r of ranked) {
    // The two published scores, ordered by the interviewer's name (a stable order; the pair is the same on every load).
    const mine = published
      .filter((s) => str(s.application_id) === r.id && num(s.weighted_score) != null)
      .map((s) => ({ s, name: staff.get(str(s.scorer_id)) || 'Interviewer' }))
      .sort((x, y) => x.name.localeCompare(y.name) || str(x.s.scorer_id).localeCompare(str(y.s.scorer_id)))
      .slice(0, 2);
    // The view said two were published but this person can't read both rows: not drawn as ranked (no half data).
    if (mine.length < 2) continue;
    const person = (n: string): SlPerson => ({ name: n, first: firstOf(n) });
    const picksOf = (s: Row) => {
      const c = (s.criteria && typeof s.criteria === 'object' ? s.criteria : {}) as Record<string, unknown>;
      return i.crit.map((q) => {
        const v = num(c[q.key]);
        return v != null && v >= 1 && v <= 5 ? Math.round(v) : null;
      });
    };
    const note = notes.get(r.id);
    const quotes: SlQuote[] = Array.isArray(note?.quotes)
      ? (note.quotes as Row[]).filter((q) => str(q?.text)).map((q) => ({ criterion: str(q.criterion), at: str(q.at), text: str(q.text) }))
      : [];
    rows.push({
      applicationId: r.id,
      code: r.code,
      name: nameOf(r.a),
      test: isTestApplication(strOrNull(r.a?.terpmail)),
      combined: r.combined,
      pair: [person(mine[0].name), person(mine[1].name)],
      parts: [num(mine[0].s.weighted_score) as number, num(mine[1].s.weighted_score) as number],
      picks: [picksOf(mine[0].s), picksOf(mine[1].s)],
      summary: str(note?.summary).trim() || null,
      quotes,
    });
  }
  const rankedIds = new Set(rows.map((r) => r.applicationId));
  const unscored: SlUnscored[] = i.apps
    .filter((a) => !rankedIds.has(str(a.id)))
    .map((a) => ({ applicationId: str(a.id), code: str(a.applicant_code) || '—', name: nameOf(a), test: isTestApplication(strOrNull(a.terpmail)), why: 'Not scored yet' }))
    .sort((a, b) => a.code.localeCompare(b.code));
  return { rows, unscored };
}

/** The cycle's awards with their applicant (main first, then extras in the order they were recorded). */
export function mapAwards(awards: Row[], apps: Row[]): SlAward[] {
  const byId = new Map(apps.map((a) => [str(a.id), a]));
  const out = awards
    .filter((a) => a.kind === 'main' || a.kind === 'extra')
    .map((a): SlAward => {
      const app = byId.get(str(a.application_id));
      const steps = Array.isArray(a.award_steps) ? (a.award_steps as Row[]) : [];
      const kind = a.kind === 'main' ? 'main' : 'extra';
      return {
        id: str(a.id),
        applicationId: str(a.application_id),
        code: str(app?.applicant_code) || '—',
        name: nameOf(app),
        kind,
        awardName: kind === 'main' ? shortAwardName(str(a.award_name) || 'Scholarship') : str(a.award_name),
        amountCents: num(a.amount_cents) ?? 0,
        decidedAt: strOrNull(a.decided_at),
        letterDone: steps.some((s) => num(s.step) === 1 && strOrNull(s.done_at) != null),
      };
    });
  return [...out.filter((a) => a.kind === 'main'), ...out.filter((a) => a.kind === 'extra')];
}

// ---------- What the page draws ----------

/** Before the meeting (scores coming in) or the meeting itself (ranking and decisions). */
export type Phase = 'empty' | 'pre' | 'meeting';

/**
 * The page's phase. Empty: no cycle or nobody applied. Meeting: an award is recorded, decisions are out, it is the
 * meeting day or later, or every applicant is ranked (or some are and no meeting is set). Otherwise: before the meeting.
 */
export function phaseOf(v: Pick<SelectionView, 'cycle' | 'meeting' | 'rows' | 'awards' | 'today'>, releasedAt: string | null = v.cycle?.releasedAt ?? null): Phase {
  if (!v.cycle || v.cycle.total === 0) return 'empty';
  if (v.awards.length > 0 || releasedAt) return 'meeting';
  if (v.meeting && daysFrom(v.today, easternDay(v.meeting.startsAt)) <= 0) return 'meeting';
  if (v.rows.length > 0 && (v.rows.length >= v.cycle.total || !v.meeting)) return 'meeting';
  return 'pre';
}

/** The words beside the title: the meeting's day and time on the meeting phase (when set), otherwise the term. */
export function pdateOf(phase: Phase, cycle: SlCycle | null, meeting: SlMeeting | null): string {
  if (phase === 'meeting' && meeting) return dayTime(meeting.startsAt);
  return cycle?.term ?? '';
}

/** The most bar segments drawn; more applicants than this share segments (the bar never gets too thin to read). */
export const BAR_MAX = 40;

/** One bar segment per applicant (or per group past BAR_MAX): which are filled. */
export function barSegments(done: number, total: number): boolean[] {
  if (total <= 0) return [];
  const n = Math.min(total, BAR_MAX);
  return Array.from({ length: n }, (_, i) => (i + 1) * (total / n) <= done + 1e-9);
}

/** One step on "On the way to the decision". */
export type TlItem = { title: string; when: string[]; rel: string | null; now: boolean; key: boolean };

/** The four dates on the way to the decision (any missing date says "Not set"). */
export function timeline(today: string, c: SlCycle, meeting: SlMeeting | null): TlItem[] {
  const ivNow = c.interviewStart != null && c.interviewEnd != null && daysFrom(today, c.interviewStart) <= 0 && daysFrom(today, c.interviewEnd) >= 0;
  const meetDay = meeting ? easternDay(meeting.startsAt) : null;
  const meetIn = meetDay ? daysFrom(today, meetDay) : null;
  return [
    {
      title: 'Interviews',
      when: c.interviewStart && c.interviewEnd ? [shortDate(c.interviewStart), ' to ', shortDate(c.interviewEnd)] : ['Not set'],
      rel: ivNow ? 'Now' : null,
      now: ivNow,
      key: false,
    },
    { title: 'Scores due', when: [c.scoresDue ? shortDate(easternDay(c.scoresDue)) : 'Not set'], rel: null, now: false, key: false },
    {
      title: 'Selection meeting',
      when: meeting && meetDay ? [`${shortDate(meetDay)},`, ' ', clock(meeting.startsAt)] : ['Not set'],
      rel: meetIn == null ? null : meetIn > 1 ? `in ${meetIn} days` : meetIn === 1 ? 'Tomorrow' : meetIn === 0 ? 'Today' : null,
      now: false,
      key: true,
    },
    { title: 'Award announced', when: [c.decisionDate ? shortDate(c.decisionDate) : 'Not set'], rel: null, now: false, key: false },
  ];
}

/** "Due Sun Nov 22, in 12 days" under the scores bar, or null when no due date is set. */
export function dueWords(today: string, scoresDue: string | null): string | null {
  if (!scoresDue) return null;
  const d = easternDay(scoresDue);
  const n = daysFrom(today, d);
  return `Due ${shortDate(d)}, ${n > 1 ? `in ${n} days` : n === 1 ? 'tomorrow' : n === 0 ? 'today' : `${-n} ${-n === 1 ? 'day' : 'days'} ago`}`;
}

/** The news card under the title, or null (nothing before the meeting: the Scores card links to Scoring). */
export type SlNews = { kicker: string; title: string; icon: 'award' | 'send'; gold: boolean; go: 'open' | 'release' | 'choose' | null; cta: string };

/**
 * The news. Released: follow up on Awardees. Main recorded: release (admins; a board member sees it is waiting). Nothing
 * recorded: the board's choice (with a Choose control only for those who may record). `emailsKicker` is what the release
 * said about the emails, when this page saw it.
 */
export function newsFor(i: { phase: Phase; cycle: SlCycle | null; releasedAt: string | null; main: SlAward | undefined; canRecord: boolean; canRelease: boolean; emailsKicker: string | null }): SlNews | null {
  if (i.phase !== 'meeting' || !i.cycle) return null;
  if (i.releasedAt) return { kicker: i.emailsKicker ? `Released · ${i.emailsKicker}` : `Released ${dayTime(i.releasedAt)}`, title: 'Follow up on Awardees', icon: 'award', gold: false, go: 'open', cta: 'Open' };
  if (i.main) {
    return i.canRelease
      ? { kicker: `Recorded · ${i.main.name}`, title: 'Release decisions', icon: 'send', gold: true, go: 'release', cta: 'Release' }
      : { kicker: `Recorded · ${i.main.name}`, title: 'An admin releases decisions', icon: 'send', gold: false, go: null, cta: '' };
  }
  return { kicker: 'Needs the board’s choice', title: `${i.cycle.mainName} award · ${money(i.cycle.mainCents)}`, icon: 'award', gold: true, go: i.canRecord ? 'choose' : null, cta: 'Choose' };
}

/** The emails line as a news kicker ("21 emails sent"), from lib/release-copy.ts emailLine without its full stop. */
export function emailsKicker(line: string | null): string | null {
  return line ? line.replace(/\.$/, '') : null;
}

/**
 * What the release covers, as the confirm draws it: bold numbers with their words. Joined, it reads exactly as
 * lib/release-copy.ts releaseCounts({..., won: true}) ("1 won the Legacy Scholarship, 2 extra awards, 15 not picked").
 */
export function releaseParts(i: { total: number; mainName: string; extras: number; recorded: number }): { n: number; words: string }[] {
  const parts = [{ n: 1, words: ` won the ${i.mainName} Scholarship` }];
  if (i.extras > 0) parts.push({ n: i.extras, words: i.extras === 1 ? ' extra award' : ' extra awards' });
  parts.push({ n: Math.max(0, i.total - i.recorded), words: ' not picked' });
  return parts;
}

/** The same counts as one line (kept equal to releaseCounts by a unit test). */
export function releasePartsText(i: { total: number; mainName: string; extras: number; recorded: number }): string {
  return releaseParts(i)
    .map((p) => `${p.n}${p.words}`)
    .join(', ');
}

/** True when releaseParts and lib/release-copy.ts agree (used by the unit test). */
export function releasePartsMatch(i: { total: number; mainName: string; extras: number; recorded: number }): boolean {
  return releasePartsText(i) === releaseCounts({ ...i, won: true });
}

/** Whether an award may be undone here: the person may undo, decisions are not out, and its letter has not gone out. */
export function canUndo(a: SlAward, releasedAt: string | null, may: boolean): boolean {
  return may && !releasedAt && !a.letterDone;
}

/** Someone the board may choose: ranked applicants first, then the ones not scored yet; those with an award left out. */
export type SlCandidate = { applicationId: string; code: string; name: string; test: boolean; combined: number | null };

/** The applicants still open for an award. */
export function openCandidates(rows: SlRow[], unscored: SlUnscored[], awards: SlAward[]): SlCandidate[] {
  const taken = new Set(awards.map((a) => a.applicationId));
  return [
    ...rows.map((r) => ({ applicationId: r.applicationId, code: r.code, name: r.name, test: r.test, combined: r.combined })),
    ...unscored.map((u) => ({ applicationId: u.applicationId, code: u.code, name: u.name, test: u.test, combined: null })),
  ].filter((c) => !taken.has(c.applicationId));
}

/** The extra-award form, checked in the demo's order: name, amount, who. Returns the error, or the award to confirm. */
export function checkExtraForm(f: { name: string; amt: string; who: string }): { ok: false; message: string } | { ok: true; awardName: string; cents: number } {
  const cents = dollarsToCents(f.amt.replace(/\$/g, ''));
  const check = checkExtraAward({ awardName: f.name, amountCents: cents });
  if (!check.ok) return { ok: false, message: check.message };
  if (!f.who) return { ok: false, message: WHO_MESSAGE };
  return { ok: true, awardName: check.awardName, cents };
}

/** Local changes over the server's awards: awards recorded on this page, and awards undone on it. */
export type AwardOver = { added: SlAward[]; removed: string[] };
export const NO_OVER: AwardOver = { added: [], removed: [] };

/** The awards to draw: the server's, without the ones undone here, plus the ones recorded here (main first). */
export function withOver(server: SlAward[], over: AwardOver): SlAward[] {
  const gone = new Set(over.removed);
  const ids = new Set(server.map((a) => a.id));
  const all = [...server.filter((a) => !gone.has(a.id)), ...over.added.filter((a) => !ids.has(a.id) && !gone.has(a.id))];
  return [...all.filter((a) => a.kind === 'main'), ...all.filter((a) => a.kind === 'extra')];
}

/** Drops one award from the local changes (a write that failed: the server's value wins). */
export function dropOver(over: AwardOver, id: string): AwardOver {
  return { added: over.added.filter((a) => a.id !== id), removed: over.removed.filter((x) => x !== id) };
}

/** A short fingerprint of what the server says (new server data replaces the local changes). */
export function viewSig(v: Pick<SelectionView, 'awards' | 'rows' | 'cycle' | 'loadFailed'>): string {
  return JSON.stringify([v.loadFailed, v.cycle?.releasedAt ?? null, v.awards.map((a) => [a.id, a.letterDone]), v.rows.length]);
}

/** Mock clock: the demo's moment plus three minutes per action. */
export function mockStamp(now: string, n: number): string {
  return new Date(new Date(now).getTime() + n * 3 * 60_000).toISOString();
}

/** 1 to 5 as a share of the score track ("0%" to "100%"), clamped. */
export function trackPos(score: number): string {
  const s = Math.min(5, Math.max(1, score));
  return `${((s - 1) / 4) * 100}%`;
}
