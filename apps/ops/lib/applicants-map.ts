// Pure logic of the refreshed Applicants pages (no server imports, so the client pages and the tests use it too): where an
// application is (stage), the words the list, preview and detail draw, filtering, grouping and sorting, the export CSV,
// the nudge drafts of mock mode, turning database rows into the view, and the paging helpers the live reads use.
// Rules ported from the demo (apps/design/ops-refresh/directions/p-applicants/index.html: stageOf, relDay, whenText,
// matches, inGroup, scoreMark, stepsList, nudgeTo). Every word is counted from the view's `now` in Eastern time.
import { clock, daysFrom, easternDay, fullDate, rel, shortDate, WD } from './refresh-time';
import { isTestApplication } from './test-application';
import type { ApApplicant, ApCaps, ApCycle, ApPerson, ApStageKind } from './applicants-view';

export type Row = Record<string, unknown>;

/** Where an application is, as every surface draws it. `now` is the current step (0 Applied .. 4 Award). */
export type ApStage = { kind: ApStageKind; now: number; label: string; you: boolean; open: ApPerson[] };

/** The list's tabs. */
export type ApTab = 'all' | 'needs' | 'interview' | 'scored';
/** The list's sort orders. */
export type ApSort = 'attention' | 'applied' | 'code';
/** The list's groups (sort "Needs you first"), in order. */
export type ApGroup = 'needs' | 'waiting' | 'interview' | 'scored';

export const TABS: { id: ApTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'needs', label: 'Needs a score' },
  { id: 'interview', label: 'Interview left' },
  { id: 'scored', label: 'Scored' },
];

export const SORTS: { id: ApSort; label: string }[] = [
  { id: 'attention', label: 'Needs you first' },
  { id: 'applied', label: 'Newest first' },
  { id: 'code', label: 'Code' },
];

export const GROUPS: { id: ApGroup; label: string; icon: 'approve' | 'wait' | 'cal' | 'check' }[] = [
  { id: 'needs', label: 'Needs your score', icon: 'approve' },
  { id: 'waiting', label: 'Waiting on others', icon: 'wait' },
  { id: 'interview', label: 'Interview left', icon: 'cal' },
  { id: 'scored', label: 'Scored', icon: 'check' },
];

/** The five steps, as labelled on the preview and the detail. */
export const STEP_LABELS = ['Applied', 'Interviewed', 'Scored', 'Selection meeting', 'Award'];
// The step names the slim marks announce ("Step 3 of 5: Scoring").
const STEP_SR = ['Applied', 'Interview', 'Scoring', 'Selection meeting', 'Award'];

/** The most words a short answer may have (the Portal's limit). */
export const WORD_LIMIT = 400;

/** The live controls: no nudge or reminder path exists, so those stay off; export is for admins only (O1). */
export function liveCaps(isAdmin: boolean): ApCaps {
  return { nudge: false, export: isAdmin };
}

/** Mock mode: every control works on the page's own state, like the demo. */
export const MOCK_CAPS: ApCaps = { nudge: true, export: true };

/** Two letters from a name ("Adaeze-Grace Nwachukwu-Bello" -> "AN"), as the demo's initials circles. */
export function initialsOf(name: string): string {
  const w = name.split(/[\s-]+/).filter(Boolean);
  if (w.length === 0) return '?';
  return (w[0][0] + (w.length > 1 ? w[w.length - 1][0] : '')).toUpperCase();
}

/** The first word of a name. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

/** "Step 3 of 5: Scoring" for the slim marks. */
export function stepAria(now: number): string {
  return `Step ${now + 1} of 5: ${STEP_SR[now]}`;
}

/** A day in plain words from `now`: "Today", "Tomorrow", "Yesterday", a weekday up to 5 days out, else "Thu Nov 12". */
export function relDay(now: string, instant: string): string {
  const day = easternDay(instant);
  const n = daysFrom(easternDay(now), day);
  if (n === 0) return 'Today';
  if (n === 1) return 'Tomorrow';
  if (n === -1) return 'Yesterday';
  if (n > 1 && n <= 5) return WD[new Date(`${day}T12:00:00Z`).getUTCDay()];
  return shortDate(day);
}

/** The interview's when-words: "Today, 5:00 PM", "Thu Nov 12" (past, older than yesterday), or "Not booked". */
export function whenText(now: string, at: string | null): string {
  if (!at) return 'Not booked';
  const future = at > now;
  const dn = daysFrom(easternDay(now), easternDay(at));
  return `${relDay(now, at)}${future || dn >= -1 ? `, ${clock(at)}` : ''}`;
}

/** "Thursday, November 12, 5:30 PM" (hover title of a row's when-line). */
export function fullWhen(at: string): string {
  return `${fullDate(easternDay(at))}, ${clock(at)}`;
}

// Is this instant after `now`? (ISO strings from toISOString() compare in time order.)
const later = (at: string, now: string) => new Date(at).getTime() > new Date(now).getTime();

/** Where an application is (derived, never stored), for the viewer `me`. */
export function stageOf(a: ApApplicant, now: string, me: string | null): ApStage {
  if (!a.interviewAt) return { kind: 'unbooked', now: 1, label: 'Interview not booked', you: false, open: [] };
  const mine = me !== null && a.pair.some((p) => p.id === me);
  if (later(a.interviewAt, now)) {
    const d = relDay(now, a.interviewAt);
    const day = d === 'Today' || d === 'Tomorrow' ? d.toLowerCase() : d;
    return { kind: 'interview', now: 1, you: mine, label: `${mine ? 'Your interview' : 'Interview'} ${day}`, open: [] };
  }
  if (a.pair.length === 2 && a.pair.every((p) => a.published.includes(p.id))) return { kind: 'scored', now: 3, label: 'Scored', you: false, open: [] };
  if (mine && !a.published.includes(me as string)) return { kind: 'needs', now: 2, you: true, label: 'Needs your score', open: [] };
  const open = a.pair.filter((p) => !a.published.includes(p.id));
  // Real data can have a held interview nobody was paired to; it waits on the pairing, not on a score.
  if (a.pair.length < 2 && open.length === 0) return { kind: 'waiting', now: 2, you: false, label: 'Interviewers not paired', open: [] };
  return { kind: 'waiting', now: 2, you: false, open, label: open.length >= 2 ? 'Waiting on both scores' : `Waiting on ${open[0]?.name ?? 'the pair'}` };
}

/** The applications the viewer still has to score: most-drafted first, then the earliest interview. */
export function mineToScore(list: ApApplicant[], now: string, me: string | null): ApApplicant[] {
  return list.filter((a) => stageOf(a, now, me).kind === 'needs').sort(byDraftThenTime);
}

// Sort helpers (instants as ms; no interview sorts last).
const ms = (at: string | null) => (at ? new Date(at).getTime() : Number.MAX_SAFE_INTEGER);
function byDraftThenTime(x: ApApplicant, y: ApApplicant): number {
  return y.draft - x.draft || ms(x.interviewAt) - ms(y.interviewAt);
}

/** The pair as words, the viewer first as "You": "You + Keith Dawson". */
export function pairWords(pair: ApPerson[]): string {
  return orderPair(pair)
    .map((p) => (p.me ? 'You' : p.name))
    .join(' + ');
}

/** The pair with the viewer first. */
export function orderPair(pair: ApPerson[]): ApPerson[] {
  return [...pair].sort((x, y) => (x.me ? -1 : y.me ? 1 : 0));
}

/** The list filters. */
export type ApFilter = { tab: ApTab; who: string; q: string };

/** Lower case without accents, so "jose" finds "José". */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Does an application show under these filters (tab, interviewer, search by name or code)? */
export function matches(a: ApApplicant, kind: ApStageKind, f: ApFilter): boolean {
  if (f.tab === 'needs' && !(kind === 'needs' || kind === 'waiting')) return false;
  if (f.tab === 'interview' && !(kind === 'interview' || kind === 'unbooked')) return false;
  if (f.tab === 'scored' && kind !== 'scored') return false;
  if (f.who && !a.pair.some((p) => p.id === f.who)) return false;
  const q = fold(f.q.trim());
  if (q && !fold(a.name).includes(q) && !a.code.toLowerCase().includes(q)) return false;
  return true;
}

/** Which group a stage sits in ("Interview left" holds the not-booked ones too). */
export function groupOf(kind: ApStageKind): ApGroup {
  return kind === 'unbooked' ? 'interview' : kind;
}

/** The rows of one group in the group's own order. */
export function inGroup(list: { a: ApApplicant; st: ApStage }[], g: ApGroup): { a: ApApplicant; st: ApStage }[] {
  const its = list.filter((r) => groupOf(r.st.kind) === g);
  if (g === 'needs') return its.sort((x, y) => byDraftThenTime(x.a, y.a));
  if (g === 'waiting' || g === 'interview') return its.sort((x, y) => ms(x.a.interviewAt) - ms(y.a.interviewAt));
  return its.sort((x, y) => (y.a.avg ?? 0) - (x.a.avg ?? 0));
}

/** The flat orders: newest application first, or by code. "Needs you first" keeps the list as it is (it is grouped). */
export function sortList<T extends { a: ApApplicant }>(list: T[], sort: ApSort): T[] {
  if (sort === 'code') return [...list].sort((x, y) => x.a.code.localeCompare(y.a.code));
  if (sort === 'applied') return [...list].sort((x, y) => new Date(y.a.appliedAt).getTime() - new Date(x.a.appliedAt).getTime());
  return list;
}

/** The scoring strip's bar: at most 50 segments (one per application up to 50), and how many are gold. */
export function barParts(total: number, scored: number): { segs: number; on: number } {
  if (total <= 50) return { segs: total, on: scored };
  return { segs: 50, on: Math.round((scored / total) * 50) };
}

/** The 1-decimal average ("4.6"). */
export function avgText(v: number): string {
  return v.toFixed(1);
}

/** The step notes under each of the five steps (preview and detail). */
export function stepNotes(a: ApApplicant, st: ApStage, cycle: ApCycle, now: string): string[] {
  const iv = a.interviewAt ? (later(a.interviewAt, now) ? whenText(now, a.interviewAt) : shortDate(easternDay(a.interviewAt))) : 'Not booked';
  const score = st.kind === 'scored' && a.avg !== null ? `${avgText(a.avg)} average` : st.now === 2 && a.pair.length ? `${a.published.length} of 2 published` : '';
  return [
    shortDate(easternDay(a.appliedAt)),
    iv,
    score,
    cycle.selectionAt ? `${shortDate(easternDay(cycle.selectionAt))}, ${clock(cycle.selectionAt)}` : '',
    cycle.awardOn ? shortDate(cycle.awardOn) : '',
  ];
}

/** The scoring strip's due line ("Due Sun", title "Scores due Sunday, November 22"), or null without a due day. */
export function dueLine(cycle: ApCycle, now: string): { text: string; title: string } | null {
  if (!cycle.scoresDue) return null;
  return { text: `Due ${rel(easternDay(now), cycle.scoresDue)}`, title: `Scores due ${fullDate(cycle.scoresDue)}` };
}

/** The empty list's line: "No applicants yet." plus when applications open(ed), when that is known. */
export function emptyLine(cycle: ApCycle, now: string): string {
  if (!cycle.opensAt) return 'No applicants yet.';
  const day = shortDate(easternDay(cycle.opensAt));
  return `No applicants yet. Applications ${later(cycle.opensAt, now) ? 'open' : 'opened'} ${day}.`;
}

/** The words of a short answer. */
export function words(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

// "Sunday" / "Friday, November 20" in running text.
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const dayName = (day: string) => WDL[new Date(`${day}T12:00:00Z`).getUTCDay()];

/** The nudge or reminder a waiting or unbooked application offers (mock mode only), or null. */
export type ApNudge = { label: string; toNames: string[]; toWhere: string; text: string; done: string; said: string; waitOn: string; kicker: string; news: string; go: string };

/** The draft a nudge (to the interviewers who have not published) or a reminder (to the student) opens. */
export function nudgeFor(a: ApApplicant, st: ApStage, cycle: ApCycle): ApNudge | null {
  if (st.kind === 'waiting' && st.open.length) {
    const firsts = st.open.map((p) => p.first).join(' and ');
    const due = cycle.scoresDue ? ` Scores are due ${dayName(cycle.scoresDue)}.` : '';
    return {
      label: `Nudge ${firsts}`,
      toNames: st.open.map((p) => p.name),
      toWhere: 'in Board chat',
      text: `Hi ${firsts}, could you publish your score${st.open.length > 1 ? 's' : ''} for ${a.name}?${due}`,
      done: 'Nudged just now',
      said: `Nudge sent to ${st.open.map((p) => p.name).join(' and ')}`,
      waitOn: `Waiting on ${firsts}`,
      kicker: `Waiting on ${firsts}`,
      news: cycle.scoresDue ? `Scores due ${shortDate(cycle.scoresDue)}` : 'Scores not published',
      go: 'Nudge',
    };
  }
  if (st.kind === 'unbooked') {
    const f = firstName(a.name);
    const until = cycle.interviewEnd ? ` run through ${fullDate(cycle.interviewEnd)}` : ' are open';
    return {
      label: `Remind ${f}`,
      toNames: [a.name],
      toWhere: 'by email',
      text: `Hi ${f}, interviews for the ${cycle.awardName || 'scholarship'}${until}. Pick a time with the link in your invitation email.`,
      done: 'Reminder sent just now',
      said: `Reminder sent to ${a.name}`,
      waitOn: `Waiting on ${f} to book`,
      kicker: "Hasn't booked",
      news: cycle.interviewEnd ? `Interviews end ${shortDate(cycle.interviewEnd)}` : 'Interview not booked',
      go: 'Remind',
    };
  }
  return null;
}

/** The CSV of the rows on screen (admins): one line per application, every value quoted. */
export function csvFor(list: { a: ApApplicant; st: ApStage }[]): string {
  // Every value quoted; one starting (after any spaces) with = + - @, a tab or a carriage return gets a leading ' so a
  // spreadsheet reads it as text, never a formula (names and phones are typed by applicants). "+1 301…" shows as text too.
  const q = (v: string) => `"${(/^\s*[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const lines = [['Code', 'Name', 'Applied', 'Interview', 'Stage', 'Terpmail', 'Phone', 'Board test'].join(',')];
  for (const { a, st } of list) {
    const iv = a.interviewAt ? `${shortDate(easternDay(a.interviewAt))} ${clock(a.interviewAt)}` : '';
    lines.push([a.code, a.name, shortDate(easternDay(a.appliedAt)), iv, st.label, a.email ?? '', a.phone ?? '', a.test ? 'yes' : ''].map(q).join(','));
  }
  return lines.join('\n');
}

// ---------- Live rows -> view ----------

/** Pages through a read `size` rows at a time until an empty page (a server may cap a page below `size`); throws past `maxRows`. */
export async function pageAll<T>(fetchPage: (from: number, to: number) => Promise<T[]>, size = 1000, maxRows = 20_000): Promise<T[]> {
  const all: T[] = [];
  for (;;) {
    const page = await fetchPage(all.length, all.length + size - 1);
    if (page.length === 0) return all;
    if (all.length + page.length > maxRows) throw new Error('read too large');
    all.push(...page);
  }
}

/** Splits ids into lists of at most `n` (for `in()` filters). */
export function chunk<T>(list: T[], n = 100): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += n) out.push(list.slice(i, i + n));
  return out;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

/** Staff profiles -> people by id ("Interviewer" when a profile has no name). */
export function mapPeople(rows: Row[], me: string | null): Map<string, ApPerson> {
  const out = new Map<string, ApPerson>();
  for (const r of rows) {
    const id = String(r.user_id);
    const name = str(r.display_name)?.trim() ?? 'Interviewer';
    out.set(id, { id, name, first: firstName(name), initials: str(r.initials)?.trim() || initialsOf(name), me: id === me });
  }
  return out;
}

// A person by id, even without a profile row.
function personOf(people: Map<string, ApPerson>, id: string, me: string | null): ApPerson {
  return people.get(id) ?? { id, name: 'Interviewer', first: 'Interviewer', initials: '?', me: id === me };
}

/** Every read the list needs, as rows. */
export type ApLiveRows = {
  apps: Row[];
  bookings: Row[];
  pairings: Row[];
  summaries: Row[];
  scores: Row[];
  progress: Row[];
};

/**
 * Builds the applicants from the live rows. Scores: the viewer's own unpublished draft count; the average only when two
 * published scores are visible (row-level security shows other people's scores only once both interviewers published).
 * Contact details only when `withContact` (the admin-only export), so they never reach a board member's browser.
 */
export function mapApplicants(rows: ApLiveRows, people: Map<string, ApPerson>, me: string | null, withContact: boolean): ApApplicant[] {
  const booking = new Map<string, { slot: string; at: string; end: string | null }>();
  for (const b of rows.bookings) {
    const s = Array.isArray(b.interview_slots) ? (b.interview_slots[0] as Row | undefined) : (b.interview_slots as Row | null);
    const at = str(s?.starts_at);
    if (!at) continue;
    booking.set(String(b.application_id), { slot: String(b.slot_id), at, end: str(s?.ends_at) });
  }
  const pairing = new Map<string, string[]>();
  for (const p of rows.pairings) pairing.set(String(p.slot_id), [p.interviewer_a, p.interviewer_b].filter((x): x is string => typeof x === 'string'));
  const summary = new Map<string, string>();
  for (const s of rows.summaries) {
    const t = str(s.summary);
    if (t) summary.set(String(s.application_id), t.trim());
  }
  const pubBy = new Map<string, Set<string>>();
  for (const p of rows.progress) {
    if (p.published !== true) continue;
    const k = String(p.application_id);
    if (!pubBy.has(k)) pubBy.set(k, new Set());
    pubBy.get(k)!.add(String(p.scorer_id));
  }
  const scoresBy = new Map<string, Row[]>();
  for (const s of rows.scores) {
    const k = String(s.application_id);
    if (!scoresBy.has(k)) scoresBy.set(k, []);
    scoresBy.get(k)!.push(s);
  }

  return rows.apps.map((r) => {
    const id = String(r.id);
    const code = str(r.applicant_code) ?? '—';
    const name = str(r.full_name)?.trim() ?? code;
    const bk = booking.get(id) ?? null;
    const pair = bk ? (pairing.get(bk.slot) ?? []).map((pid) => personOf(people, pid, me)) : [];
    const own = (scoresBy.get(id) ?? []).find((s) => s.scorer_id === me) ?? null;
    const pubs = (scoresBy.get(id) ?? []).filter((s) => s.published === true && s.weighted_score !== null && s.weighted_score !== undefined);
    const avg = pubs.length >= 2 ? Math.round((pubs.reduce((n, s) => n + Number(s.weighted_score), 0) / pubs.length) * 10) / 10 : null;
    const minutes = bk?.end ? Math.round((new Date(bk.end).getTime() - new Date(bk.at).getTime()) / 60_000) : null;
    const email = str(r.terpmail);
    return {
      id,
      code,
      name,
      test: isTestApplication(email),
      appliedAt: String(r.submitted_at),
      interviewAt: bk?.at ?? null,
      interviewMinutes: minutes && minutes > 0 ? minutes : null,
      slotId: bk?.slot ?? null,
      pair,
      published: [...(pubBy.get(id) ?? [])],
      draft: own && own.published !== true ? Number(own.criteria_count) || 0 : 0,
      avg,
      summary: summary.get(id) ?? null,
      email: withContact ? email : null,
      phone: withContact ? str(r.phone) : null,
    };
  });
}

/** Everyone who interviews this cycle (from the pairs), the viewer first, then by name. */
export function interviewers(list: ApApplicant[]): ApPerson[] {
  const seen = new Map<string, ApPerson>();
  for (const a of list) for (const p of a.pair) seen.set(p.id, p);
  return [...seen.values()].sort((x, y) => (x.me ? -1 : y.me ? 1 : x.name.localeCompare(y.name)));
}
