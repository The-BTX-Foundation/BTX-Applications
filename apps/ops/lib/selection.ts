// Scholarships > Selection: the ranking by combined score, the award settings and the meeting agenda.
// The ranking is information for the board: the board discusses and decides (owner, 2026-10-12), so nothing here says
// the top score wins, and an award can be recorded for any submitted applicant.
// LIVE: the ranking is every application of the published cycle with both scores published (`application_score_summary`,
// read as the signed-in person, so it only counts scores both interviewers published), with the code and name from
// `applications` (D2: board members see names), each interviewer's score and picks from `scores`, the notes from
// `interview_summaries`, the meeting from `calendar_events` (kind selection_meeting), the main award's name and amount
// from `cycles`, and the awards recorded so far from `scholarship_awards`
// (any number of extra awards, each with its own name and amount).
// MOCK (mock/selection.ts): everything, in mock mode.
import { hasSupabaseEnv } from '@btx/data';
import { dayLabel, timeLabel } from './format';
import { combinedLabels, shortAwardName, sortRanking } from './sch-logic';
import { applicationRows, db, interviewsFor, publishedCycle, rubricFor, selectionMeeting, staffNames, summariesFor, visibleScores, whoAmI } from './sch-live';
import { isTestApplication } from './test-application';
import { sheetFixture, RUBRIC } from '@/mock/scores';
import { CALL_STEP, dollars, MAIN_AWARD, MEETING, RANKING, selectionStore, type RankedRow } from '@/mock/selection';

export type RankRow = {
  rank: number;
  /** The application's id (recording an award needs it); "mock-<code>" in mock mode. */
  applicationId: string;
  code: string;
  /** The applicant's full name. */
  name: string;
  combined: string;
  /** "Dania 4.9, Chariah 4.7". */
  parts: string;
  /** A board member's Portal test application (shown as a "Board test" label). */
  test?: boolean;
  open?: boolean;
  detail: Detail;
};

export type Detail = {
  summary: string;
  names: [string, string];
  scores: { criterion: string; a: number; b: number }[];
  quotes: string[];
};

export type Recorded = { id: string; code: string; name: string; kind: 'main' | 'extra'; awardName: string; amountCents: number; test?: boolean };

/** Someone the board may choose: any submitted applicant, ranked ones first. combined is '' when not scored yet. */
export type Candidate = { id: string; code: string; name: string; combined: string; test?: boolean };

/** A ranked applicant; live rows also carry their application id and their real details. */
type Ranked = RankedRow & { applicationId?: string; detail?: Detail; test?: boolean };

/** The live settings that replace the mock constants. */
type Settings = {
  term: string;
  mainName: string;
  mainCents: number;
  meetingDate: string;
  meetingTime: string;
  meetingVideo: string;
  submitted: number;
  /** Submitted applicants without both scores yet (they can still be chosen). */
  unscored: Candidate[];
  recorded: Recorded[];
  releasedAt: string | null;
};

export type SelectionData = {
  sub: string;
  phoneSub: string;
  total: number;
  rows: RankRow[];
  /** The rows behind "N more", shown when it is opened (mock stress lists none). */
  more: RankRow[];
  moreCount: number;
  moreNote: string;
  meetingDate: string;
  meetingVideo: string;
  /** The main award step. */
  legacy: { amount: number; amountLabel: string; name: string; /** The name saved on the award row (the cycle's award name, "Legacy Scholarship"). */ awardName: string };
  /** Every submitted applicant the board may choose for an award, in ranking order, then the ones not scored yet. */
  candidates: Candidate[];
  callStep: string;
  /** Every award recorded so far: the main one and any number of extras. */
  recorded: Recorded[];
  agendaSent: boolean;
  cycleId: string | null;
  /** When decisions were released to applicants (cycles.decisions_released_at), or null. Extra awards can be added until then. */
  releasedAt: string | null;
  failed: boolean;
  source: 'live' | 'mock';
};

const first = (n: string) => n.split(' ')[0];

// Each interviewer's six picks, derived from their weighted score (mock only: the real picks are in `scores.criteria`).
function detailFor(r: RankedRow): Detail {
  const fx = sheetFixture(r.code);
  const offs = [0, 1, 0, -1, 0, 0];
  const pick = (s: string, i: number) => Math.max(1, Math.min(5, Math.round(Number(s)) + offs[i]));
  return {
    summary: fx?.summary ?? 'The interview summary will show here once it is written.',
    names: [r.parts[0].name, r.parts[1].name],
    scores: RUBRIC.map((c, i) => ({ criterion: c.name, a: pick(r.parts[0].score, i), b: pick(r.parts[1].score, i) })),
    quotes: (fx?.quotes ?? []).map((q) => `${q.text} · ${q.criterion} ${q.at}`),
  };
}

const appId = (r: Ranked) => r.applicationId ?? `mock-${r.code}`;
const cand = (r: Ranked): Candidate => ({ id: appId(r), code: r.code, name: r.name, combined: r.combined, test: r.test });

function build(ranked: Ranked[], source: 'live' | 'mock', cycleId: string | null, live?: Settings): SelectionData {
  const total = ranked.length;
  // Equal combined scores share a rank number ("1, 1, 3").
  const rankOf = (i: number) => ranked.findIndex((x) => x.combined === ranked[i].combined) + 1;
  const shown = 4;
  const row = (r: Ranked, i: number): RankRow => ({
    rank: rankOf(i),
    applicationId: appId(r),
    code: r.code,
    name: r.name,
    combined: r.combined,
    test: r.test,
    parts: r.parts.map((p) => `${first(p.name)} ${p.score}`).join(', '),
    detail: r.detail ?? detailFor(r),
  });
  const rows: RankRow[] = ranked.slice(0, shown).map((r, i) => row(r, i));
  // Ties further down are named in the "more" line (they only matter for an extra award).
  const rest = ranked.slice(shown);
  const tieAt = rest.length > 1 && rest[0].combined === rest[1].combined ? rest[0].combined : null;
  const st = selectionStore();
  const mainName = live ? shortAwardName(live.mainName) : MAIN_AWARD.name;
  const mainCents = live ? live.mainCents : MAIN_AWARD.amountCents;
  const date = live ? live.meetingDate : MEETING.dateLabel;
  const time = live ? live.meetingTime : MEETING.timeLabel;
  const scored = live && live.submitted !== total ? `${total} of ${live.submitted} scored` : `all ${total} scored`;
  const meet = date ? `selection meeting ${date}, ${time} on video` : 'selection meeting not set';
  const meetPh = date ? `meeting ${date}, ${time}, video` : 'meeting not set';
  return {
    sub: `${live?.term ?? 'Fall 2026'} · ${mainName} Scholarship · ${scored}, ${meet}`,
    phoneSub: `Scholarships · ${scored} · ${meetPh}`,
    total,
    rows,
    more: rest.map((r, i) => row(r, shown + i)),
    moreCount: Math.max(0, total - shown),
    moreNote: tieAt ? `${rest[0].name} and ${rest[1].name} tie at ${tieAt}` : '',
    meetingDate: date || 'Not set',
    meetingVideo: live ? live.meetingVideo : MEETING.videoUrl,
    legacy: {
      amount: mainCents,
      amountLabel: dollars(mainCents),
      name: mainName,
      awardName: live ? live.mainName : MAIN_AWARD.name,
    },
    candidates: [...ranked.map(cand), ...(live?.unscored ?? [])],
    callStep: CALL_STEP,
    recorded: live ? live.recorded : st.awards.map(({ id, code, name, kind, awardName, amountCents }) => ({ id, code, name, kind, awardName, amountCents })),
    agendaSent: live ? false : st.agendaSent,
    cycleId,
    releasedAt: live ? live.releasedAt : st.releasedAt,
    failed: false,
    source,
  };
}

// The stress frame (Figma "Scholarships > Selection, stress"): 120 applicants, two sharing the best combined score (4.8),
// and long names.
function stress(): SelectionData {
  const d = (names: [string, string]): Detail => ({
    summary: 'The interview summary will show here once it is written.',
    names,
    scores: RUBRIC.map((c) => ({ criterion: c.name, a: 4, b: 4 })),
    quotes: [],
  });
  return {
    sub: 'Fall 2026 · Legacy Scholarship · all 120 scored, selection meeting Thu Dec 31, 9:30 PM on video',
    phoneSub: 'Scholarships · all 120 scored · meeting Thu Dec 31, 9:30 PM, video',
    total: 120,
    rows: [
      { rank: 1, applicationId: 'stress-1', code: 'APP-2026-00003', name: 'Jalen Thomas', combined: '4.8', parts: 'Dania 4.9, Chariah 4.7', detail: d(['Dania Morris', 'Chariah Ghee']) },
      { rank: 1, applicationId: 'stress-2', code: 'APP-2026-00120', name: 'Adaeze-Grace Okonkwo-Fitzgerald', combined: '4.8', parts: 'Kelsey 4.9, Tomi 4.7', open: true, detail: d(['Kelsey Davis', 'Tomi Falodun']) },
      { rank: 3, applicationId: 'stress-3', code: 'APP-2026-00002', name: 'Daniel Asante', combined: '4.5', parts: 'Cillisha Knights 4.6, Darien Strachan 4.4', detail: d(['Cillisha Knights', 'Darien Strachan']) },
      { rank: 4, applicationId: 'stress-4', code: 'APP-2026-00009', name: 'Maya King', combined: '4.4', parts: 'Tomi 4.5, Darien 4.3', detail: d(['Tomi Falodun', 'Darien Strachan']) },
    ],
    more: [],
    moreCount: 116,
    moreNote: 'Ada Okafor and Kofi Edwards tie at 4.3',
    meetingDate: 'Thu Dec 31',
    meetingVideo: MEETING.videoUrl,
    legacy: { amount: 200000, amountLabel: '$2,000', name: 'Legacy', awardName: 'Legacy' },
    // Everyone submitted; the page leaves out those who already have an award.
    candidates: [
      { id: 'stress-1', code: 'APP-2026-00003', name: 'Jalen Thomas', combined: '4.8' },
      { id: 'stress-2', code: 'APP-2026-00120', name: 'Adaeze-Grace Okonkwo-Fitzgerald', combined: '4.8' },
      { id: 'stress-3', code: 'APP-2026-00002', name: 'Daniel Asante', combined: '4.5' },
      { id: 'stress-4', code: 'APP-2026-00009', name: 'Maya King', combined: '4.4' },
    ],
    callStep: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour',
    // Three extra awards, one with a 60-character name, to check wrapping.
    recorded: [
      { id: 'stress-award-1', code: 'APP-2026-00120', name: 'Adaeze-Grace Okonkwo-Fitzgerald', kind: 'extra', awardName: 'Empowerment Award', amountCents: 50000 },
      { id: 'stress-award-2', code: 'APP-2026-00002', name: 'Daniel Asante', kind: 'extra', awardName: 'Community Leadership and Service Above Self Recognition Award', amountCents: 150000 },
      { id: 'stress-award-3', code: 'APP-2026-00009', name: 'Maya King', kind: 'extra', awardName: 'Persistence Award', amountCents: 25000 },
    ],
    agendaSent: false,
    cycleId: null,
    releasedAt: null,
    failed: false,
    source: 'mock',
  };
}

// Loads the selection page. A failed read returns failed: true instead of throwing.
export async function loadSelection(opts: { forceError?: boolean; stress?: boolean } = {}): Promise<SelectionData> {
  if (!hasSupabaseEnv()) {
    if (opts.forceError) return { ...build([], 'mock', null), failed: true };
    if (opts.stress) return stress();
    return build(RANKING, 'mock', null);
  }
  try {
    return await live();
  } catch {
    return { ...build([], 'live', null), failed: true };
  }
}

type AwardRow = { id: string; application_id: string; kind: 'main' | 'extra'; award_name: string; amount_cents: number | null };

// Live mode (see the header).
async function live(): Promise<SelectionData> {
  const client = await db();
  const me = await whoAmI(client);
  if (!me) throw new Error('not staff');
  const cycle = await publishedCycle(client);
  if (!cycle) return build([], 'live', null, { term: 'No open cycle', mainName: 'Scholarship', mainCents: 0, meetingDate: '', meetingTime: '', meetingVideo: '', submitted: 0, unscored: [], recorded: [], releasedAt: null });
  const apps = await applicationRows(client, cycle.id);
  const nameOf = (a: { full_name: string | null; applicant_code: string | null } | undefined) => a?.full_name?.trim() || a?.applicant_code || '—';
  const ids = apps.map((a) => a.id);
  const byId = new Map(apps.map((a) => [a.id, a]));
  const [sum, scores, staff, interviews, summaries, rubric, meeting, awards] = await Promise.all([
    ids.length ? client.from('application_score_summary').select('application_id, published_count, combined_score').in('application_id', ids) : Promise.resolve({ data: [], error: null }),
    visibleScores(client, ids),
    staffNames(client),
    interviewsFor(client, ids),
    summariesFor(client, ids),
    rubricFor(client, cycle.id),
    selectionMeeting(client, cycle.id),
    client.from('scholarship_awards').select('id, application_id, kind, award_name, amount_cents').eq('cycle_id', cycle.id).in('kind', ['main', 'extra']).order('decided_at'),
  ]);
  if (sum.error) throw sum.error;
  if (awards.error) throw awards.error;

  type Sum = { application_id: string; published_count: number; combined_score: number | string | null };
  const scoredRows = ((sum.data ?? []) as Sum[]).filter((r) => r.published_count >= 2 && r.combined_score !== null);
  const name = (id: string | null) => (id && staff.get(id)?.display_name) || 'Interviewer';
  const pre = sortRanking(
    scoredRows.map((r) => {
      const a = byId.get(r.application_id);
      return { r, code: a?.applicant_code ?? '—', initials: a?.initials ?? '—', name: nameOf(a), combined: Number(r.combined_score), test: isTestApplication(a?.terpmail) };
    }),
  );
  const labels = combinedLabels(pre.map((p) => p.combined));
  const ranked: Ranked[] = pre.map((p, i) => {
    const iv = interviews.get(p.r.application_id);
    const mine = scores.filter((s) => s.application_id === p.r.application_id && s.published);
    // The pair's order when it is known; otherwise the order the scores came in.
    const order = iv?.a && iv?.b ? [iv.a, iv.b] : mine.map((s) => s.scorer_id).slice(0, 2);
    const of = (id: string) => mine.find((s) => s.scorer_id === id);
    const parts = order.map((id) => ({ name: name(id), score: (of(id)?.weighted_score ?? 0).toFixed(1) }));
    const sm = summaries.get(p.r.application_id);
    const detail: Detail = {
      summary: sm?.summary || 'The interview summary will show here once it is written.',
      names: [parts[0]?.name ?? 'Interviewer', parts[1]?.name ?? 'Interviewer'],
      scores: rubric.map((c) => ({ criterion: c.name, a: of(order[0])?.criteria?.[c.key] ?? 0, b: of(order[1])?.criteria?.[c.key] ?? 0 })),
      quotes: (sm?.quotes ?? []).filter((q) => q.text).map((q) => `${q.text}${q.criterion ? ` · ${q.criterion}${q.at ? ` ${q.at}` : ''}` : ''}`),
    };
    return { applicationId: p.r.application_id, code: p.code, initials: p.initials, name: p.name, combined: labels[i], parts, detail, test: p.test };
  });
  const rankedIds = new Set(ranked.map((r) => r.applicationId));
  const unscored: Candidate[] = apps
    .filter((a) => !rankedIds.has(a.id))
    .map((a) => ({ id: a.id, code: a.applicant_code ?? '—', name: nameOf(a), combined: '', test: isTestApplication(a.terpmail) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const recorded: Recorded[] = ((awards.data ?? []) as AwardRow[]).map((a) => ({
    id: a.id,
    code: byId.get(a.application_id)?.applicant_code ?? '—',
    name: nameOf(byId.get(a.application_id)),
    test: isTestApplication(byId.get(a.application_id)?.terpmail),
    kind: a.kind,
    // An extra award keeps the name the board gave it; the main award is shortened ("Legacy Scholarship" -> "Legacy").
    awardName: a.kind === 'main' ? shortAwardName(a.award_name) : a.award_name,
    amountCents: a.amount_cents ?? 0,
  }));
  return build(ranked, 'live', cycle.id, {
    term: cycle.term,
    mainName: cycle.award_name ?? 'Scholarship',
    mainCents: cycle.award_amount_cents ?? 0,
    meetingDate: meeting ? dayLabel(meeting.starts_at) : '',
    meetingTime: meeting ? timeLabel(meeting.starts_at) : '',
    meetingVideo: meeting?.video_url ?? '',
    submitted: apps.length,
    unscored,
    recorded,
    releasedAt: cycle.decisions_released_at,
  });
}
