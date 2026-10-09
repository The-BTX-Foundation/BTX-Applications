// Scholarships > Selection: the ranking by combined score, the award settings and the meeting agenda.
// REAL in live mode: nothing yet that the draft schema does not own; the applications themselves (code, initials) come
// from `applications`, but the scores, awards and meeting live in the draft tables (`scores`, `scholarship_awards`,
// `calendar_events`). So in live mode the ranking is read from the draft view `application_score_summary` when it exists
// and falls back to an empty ranking, never made-up scores.
// MOCK (mock/selection.ts): everything, in mock mode. Going live = replace rankingRows() and recorded() with reads of
// `application_score_summary`, `scores` and `scholarship_awards`; the page does not change.
import { hasSupabaseEnv } from '@btx/data';
import { currentStaffId } from './me';
import { sessionClient } from './supabase-server';
import { sheetFixture, RUBRIC } from '@/mock/scores';
import { CALL_STEP, dollars, EXTRA_AWARD, MAIN_AWARD, MEETING, RANKING, selectionStore, type RankedRow } from '@/mock/selection';

export type RankRow = {
  rank: number;
  code: string;
  initials: string;
  combined: string;
  /** "Dania 4.9, Chariah 4.7". */
  parts: string;
  /** The status pill, or null. */
  chip: { text: string; kind: 'lead' | 'out' } | null;
  /** "Tie, only matters for an extra award" style note shown where there is no pill. */
  top: boolean;
  open?: boolean;
  detail: Detail;
};

export type Detail = {
  summary: string;
  names: [string, string];
  scores: { criterion: string; a: number; b: number }[];
  quotes: string[];
};

export type Recorded = { id: string; code: string; initials: string; kind: 'main' | 'extra'; awardName: string; amountCents: number };

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
  /** The Legacy award step. */
  legacy: { amount: number; amountLabel: string; name: string; candidates: { code: string; initials: string }[]; tie: boolean; tieScore: string };
  extra: { name: string; amountLabel: string; candidates: { code: string; initials: string }[] };
  callStep: string;
  recorded: Recorded[];
  noExtra: boolean;
  agendaSent: boolean;
  cycleId: string | null;
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

// The pill beside a row: the winner, the extra-award candidates, or a tie at the top.
function chips(ranked: RankedRow[], extraN: number): (RankRow['chip'])[] {
  const topTie = ranked.length > 1 && ranked[0].combined === ranked[1].combined;
  return ranked.map((r, i) => {
    if (topTie && r.combined === ranked[0].combined) return { text: 'Tie, goes to a vote', kind: 'lead' as const };
    if (i === 0) return { text: 'Legacy, top score', kind: 'lead' as const };
    const start = topTie ? 2 : 1;
    if (i >= start && i < start + extraN) return { text: 'Discuss: extra award?', kind: 'out' as const };
    return null;
  });
}

function build(ranked: RankedRow[], source: 'live' | 'mock', cycleId: string | null): SelectionData {
  const total = ranked.length;
  const topTie = total > 1 && ranked[0].combined === ranked[1].combined;
  const pills = chips(ranked, EXTRA_AWARD.candidates);
  const shown = 4;
  const rows: RankRow[] = ranked.slice(0, shown).map((r, i) => ({
    rank: topTie && i === 1 ? 1 : i + 1,
    code: r.code,
    initials: r.initials,
    combined: r.combined,
    parts: r.parts.map((p) => `${first(p.name)} ${p.score}`).join(', '),
    chip: pills[i],
    top: i === 0 || (topTie && i === 1),
    detail: detailFor(r),
  }));
  // Ties further down are named in the "more" line (they only matter for an extra award).
  const rest = ranked.slice(shown);
  const tieAt = rest.length > 1 && rest[0].combined === rest[1].combined ? rest[0].combined : null;
  const st = selectionStore();
  const extraCand = ranked.slice(topTie ? 2 : 1, (topTie ? 2 : 1) + EXTRA_AWARD.candidates);
  return {
    sub: `Fall 2026 · Legacy Scholarship · all ${total} scored, selection meeting ${MEETING.dateLabel}, ${MEETING.timeLabel} on video`,
    phoneSub: `Scholarships · all ${total} scored · meeting ${MEETING.dateLabel}, ${MEETING.timeLabel}, video`,
    total,
    rows,
    more: rest.map((r, i) => ({
      rank: shown + i + 1,
      code: r.code,
      initials: r.initials,
      combined: r.combined,
      parts: r.parts.map((p) => `${first(p.name)} ${p.score}`).join(', '),
      chip: null,
      top: false,
      detail: detailFor(r),
    })),
    moreCount: Math.max(0, total - shown),
    moreNote: tieAt ? `${rest[0].initials} and ${rest[1].initials} tie at ${tieAt}` : '',
    meetingDate: MEETING.dateLabel,
    meetingVideo: MEETING.videoUrl,
    legacy: {
      amount: MAIN_AWARD.amountCents,
      amountLabel: dollars(MAIN_AWARD.amountCents),
      name: MAIN_AWARD.name,
      candidates: ranked.filter((r) => r.combined === ranked[0]?.combined).map((r) => ({ code: r.code, initials: r.initials })),
      tie: topTie,
      tieScore: ranked[0]?.combined ?? '',
    },
    extra: { name: EXTRA_AWARD.name, amountLabel: dollars(EXTRA_AWARD.amountCents), candidates: extraCand.map((r) => ({ code: r.code, initials: r.initials })) },
    callStep: CALL_STEP,
    recorded: st.awards.map(({ id, code, initials, kind, awardName, amountCents }) => ({ id, code, initials, kind, awardName, amountCents })),
    noExtra: st.noExtra,
    agendaSent: st.agendaSent,
    cycleId,
    failed: false,
    source,
  };
}

// The stress frame (Figma "Scholarships > Selection, stress"): 120 applicants, a tie for first (J.T. and A-G.O. at 4.8).
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
      { rank: 1, code: 'APP-2026-00003', initials: 'J.T.', combined: '4.8', parts: 'Dania 4.9, Chariah 4.7', chip: { text: 'Tie, goes to a vote', kind: 'lead' }, top: true, detail: d(['Dania Morris', 'Chariah Ghee']) },
      { rank: 1, code: 'APP-2026-00120', initials: 'A-G.O.', combined: '4.8', parts: 'Kelsey 4.9, Tomi 4.7', chip: { text: 'Tie, goes to a vote', kind: 'lead' }, top: true, open: true, detail: d(['Kelsey Davis', 'Tomi Falodun']) },
      { rank: 3, code: 'APP-2026-00002', initials: 'D.A.', combined: '4.5', parts: 'Cillisha Knights 4.6, Darien Strachan 4.4', chip: { text: 'Discuss: extra award?', kind: 'out' }, top: false, detail: d(['Cillisha Knights', 'Darien Strachan']) },
      { rank: 4, code: 'APP-2026-00009', initials: 'M.K.', combined: '4.4', parts: 'Tomi 4.5, Darien 4.3', chip: null, top: false, detail: d(['Tomi Falodun', 'Darien Strachan']) },
    ],
    more: [],
    moreCount: 116,
    moreNote: 'A.O. and K.E. tie at 4.3',
    meetingDate: 'Thu Dec 31',
    meetingVideo: MEETING.videoUrl,
    legacy: { amount: 200000, amountLabel: '$2,000', name: 'Legacy', candidates: [{ code: 'APP-2026-00003', initials: 'J.T.' }, { code: 'APP-2026-00120', initials: 'A-G.O.' }], tie: true, tieScore: '4.8' },
    extra: { name: 'Empowerment', amountLabel: '$500', candidates: [{ code: 'APP-2026-00014', initials: 'R.S.' }, { code: 'APP-2026-00002', initials: 'D.A.' }] },
    callStep: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour',
    recorded: [],
    noExtra: false,
    agendaSent: false,
    cycleId: null,
    failed: false,
    source: 'mock',
  };
}

// Loads the selection page. A failed read returns failed: true instead of throwing.
export async function loadSelection(opts: { forceError?: boolean; stress?: boolean } = {}): Promise<SelectionData> {
  void (await currentStaffId());
  if (!hasSupabaseEnv()) {
    if (opts.forceError) return { ...build([], 'mock', null), failed: true };
    if (opts.stress) return stress();
    return build(RANKING, 'mock', null);
  }
  // Live mode: the draft view does not exist until the Ops Hub tables are applied. Read it; if that fails, the page says
  // "didn't load" instead of showing invented scores.
  try {
    const client = await sessionClient();
    const cycle = await client.from('cycles').select('id').eq('status', 'published').order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (cycle.error) throw cycle.error;
    const loose = client as unknown as { from: (t: string) => { select: (c: string) => PromiseLike<{ data: { application_id: string; combined_score: number | null; published_count: number }[] | null; error: unknown }> } };
    const sum = await loose.from('application_score_summary').select('application_id, combined_score, published_count');
    if (sum.error) throw sum.error;
    void sum;
    return build([], 'live', cycle.data?.id ?? null);
  } catch {
    return { ...build([], 'live', null), failed: true };
  }
}
