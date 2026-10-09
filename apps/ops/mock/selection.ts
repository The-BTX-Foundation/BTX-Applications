// MOCK: the selection meeting's ranking, the award settings and the awards recorded so far.
// Shapes follow the draft Ops Hub tables: combined scores are what the view `application_score_summary` returns (the
// average of the published `scores.weighted_score`); a recorded award is a `scholarship_awards` row (award_name,
// amount_cents, kind 'main' | 'extra', decision_note). None of these tables exist yet (draft on branch db/ops-schema).
// The sample is the Figma "Scholarships > Selection, on Mon Oct 12" frame: all 18 applicants scored.
// The award name and amount ($2,000 Legacy, $500 Empowerment) are cycle settings the draft schema does not have a column
// for (`cycles.award_name` and `award_amount_cents` cover the main award only), so the extra award lives here.
import { pairingFor } from './interviews';
import { staffById } from './staff';

export type RankedRow = {
  code: string;
  initials: string;
  /** Combined score, one decimal ("4.8"). */
  combined: string;
  /** Each interviewer's own weighted score, in the pair's order. */
  parts: { name: string; score: string }[];
};

const R = (code: string, initials: string, combined: string, a: string, b: string): RankedRow => {
  const pr = pairingFor(code);
  const na = (pr && staffById(pr.interviewer_a)?.display_name) || 'Interviewer A';
  const nb = (pr && staffById(pr.interviewer_b)?.display_name) || 'Interviewer B';
  return { code, initials, combined, parts: [{ name: na, score: a }, { name: nb, score: b }] };
};

/** All 18 applicants, best combined score first. Equal combined scores are ties. */
export const RANKING: RankedRow[] = [
  R('APP-2026-00003', 'J.T.', '4.8', '4.9', '4.7'),
  R('APP-2026-00014', 'R.S.', '4.6', '4.7', '4.5'),
  R('APP-2026-00002', 'D.A.', '4.5', '4.6', '4.4'),
  R('APP-2026-00009', 'M.K.', '4.4', '4.5', '4.3'),
  R('APP-2026-00011', 'A.O.', '4.3', '4.4', '4.2'),
  R('APP-2026-00007', 'K.E.', '4.3', '4.4', '4.2'),
  R('APP-2026-00012', 'T.W.', '4.1', '4.0', '4.2'),
  R('APP-2026-00018', 'B.R.', '4.0', '3.9', '4.1'),
  R('APP-2026-00004', 'N.B.', '3.9', '3.7', '4.1'),
  R('APP-2026-00001', 'G.H.', '3.8', '3.7', '3.9'),
  R('APP-2026-00005', 'P.Z.', '3.7', '3.6', '3.8'),
  R('APP-2026-00006', 'O.D.', '3.6', '3.5', '3.7'),
  R('APP-2026-00008', 'V.S.', '3.5', '3.4', '3.6'),
  R('APP-2026-00010', 'Y.B.', '3.4', '3.3', '3.5'),
  R('APP-2026-00013', 'L.M.', '3.3', '3.2', '3.4'),
  R('APP-2026-00015', 'S.P.', '3.2', '3.1', '3.3'),
  R('APP-2026-00016', 'E.C.', '3.1', '3.0', '3.2'),
  R('APP-2026-00017', 'F.N.', '3.0', '2.9', '3.1'),
];

export const MAIN_AWARD = { name: 'Legacy', amountCents: 200000, count: 1 };
export const EXTRA_AWARD = { name: 'Empowerment', amountCents: 50000, candidates: 2 };

/** The selection meeting: when, and the video link (the draft table `calendar_events` has `video_url`). */
export const MEETING = { dateLabel: 'Fri Oct 16', timeLabel: '7:00 PM', videoUrl: 'https://meet.example.org/btx/selection' };

/** The third agenda item, from the cycle's meeting checklist (a `checklists` + `tasks` row in the draft schema). */
export const CALL_STEP = 'Who calls the winners';

export type RecordedAward = { id: string; code: string; initials: string; kind: 'main' | 'extra'; awardName: string; amountCents: number; note: string };

type Store = { awards: RecordedAward[]; noExtra: boolean; agendaSent: boolean };
const g = globalThis as unknown as { __btxSelection?: Store };

/** The in-memory record of what was decided in this server process (mock mode only). */
export function selectionStore(): Store {
  g.__btxSelection ??= { awards: [], noExtra: false, agendaSent: false };
  return g.__btxSelection;
}

/** "$2,000". */
export function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
}
