// MOCK: who interviews whom, shaped like the draft Ops Hub table `interview_pairings` (slot_id, interviewer_a,
// interviewer_b, video_url) but looked up by applicant code, because the Portal's real slots and bookings carry no pair.
// The pairs are chosen so the Interviews page's "Interviewer pairs" table adds up to the Figma frame (14 done, 4 left).
// The Applicants list still shows the older pairing from mock/scoring.ts for a few applicants; the Figma frames of the two
// pages disagree there, so neither was changed to match the other.
// When the Ops Hub tables exist, swap pairingFor() for a read of `interview_pairings` joined to each booking's slot.
import { MOCK_ME } from './staff';

export type MockPairing = { interviewer_a: string; interviewer_b: string; video_url: string | null };

const DM = 'mock-staff-dm';
const CG = 'mock-staff-cg';
const MD = 'mock-staff-md';
const KD = 'mock-staff-kd';
const TF = 'mock-staff-tf';
const CK = 'mock-staff-ck';
const DS = 'mock-staff-ds';

const link = (code: string) => `https://meet.example.org/btx/${code.toLowerCase()}`;
const p = (code: string, a: string, b: string): [string, MockPairing] => [code, { interviewer_a: a, interviewer_b: b, video_url: link(code) }];

const PAIRINGS = new Map<string, MockPairing>([
  // Dania Morris + Chariah Ghee: 4 done, 1 left (Wed Oct 7)
  p('APP-2026-00011', DM, CG),
  p('APP-2026-00012', DM, CG),
  p('APP-2026-00013', DM, CG),
  p('APP-2026-00003', DM, CG),
  p('APP-2026-00017', DM, CG),
  // Kelsey Davis + Tomi Falodun: 3 done, 1 left (Mon Oct 5)
  p('APP-2026-00014', KD, TF),
  p('APP-2026-00007', KD, TF),
  p('APP-2026-00010', KD, TF),
  p('APP-2026-00015', KD, TF),
  // Cillisha Knights + Darien Strachan: 2 done, 1 left (Tue Oct 6)
  p('APP-2026-00002', CK, DS),
  p('APP-2026-00006', CK, DS),
  p('APP-2026-00016', CK, DS),
  // Marcus Davis + Kelsey Davis: 2 done, 1 left (Thu Oct 8)
  p('APP-2026-00005', MD, KD),
  p('APP-2026-00008', MD, KD),
  p('APP-2026-00018', MD, KD),
  // Tomi Falodun + Darien Strachan: 2 done
  p('APP-2026-00009', TF, DS),
  p('APP-2026-00001', TF, DS),
  // Dania Morris + Marcus Davis: 1 done
  p('APP-2026-00004', DM, MD),
]);

/** The pairing for an applicant's booked slot, or null when none is recorded ("Unassigned"). */
export function pairingFor(code: string): MockPairing | null {
  return PAIRINGS.get(code) ?? null;
}

export { MOCK_ME };
