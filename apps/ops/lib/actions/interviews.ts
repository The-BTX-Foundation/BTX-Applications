'use server';

// Write actions for Scholarships > Interviews. Each one runs as the signed-in person, so the database's row-level
// security applies; the admin-only ones also say so in a clear message (see lib/pairing-db.ts).
//
// Live behaviour is tested against the local database (tests/pairing-db.live.test.ts, run with LIVE_DB=1).
// In mock mode (no Supabase env) the actions succeed and change nothing, like the Figma preview.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from '../supabase-server';
import { planPairing, runPairing, saveMyAvailability, setVideoLinks, swapInterviewer, type Db } from '../pairing-db';
import { addTime, openProposedTimes, rebalanceInterviews, rebuildProposedTimes, removeTime } from '../interview-flow-db';
import { sendBookingInvites } from '../email/send';
import { previewRebalance } from '../interviews';
import { affected, joinNames, whenLine, type MoveView } from '../interview-times';

type Msg = { ok: boolean; message: string };

const db = async () => (await sessionClient()) as unknown as Db;

export type PairingPreview = { ok: boolean; message: string; unpaired: number; wouldPair: number; uncovered: number };

// What "Re-run pairing" would do, without doing it (the preview dialog).
export async function previewPairing(): Promise<PairingPreview> {
  if (!hasSupabaseEnv()) return { ok: true, message: '', unpaired: 0, wouldPair: 0, uncovered: 0 };
  try {
    const r = await planPairing(await db());
    if (!r.ok) return { ok: false, message: r.message, unpaired: 0, wouldPair: 0, uncovered: 0 };
    return { ok: true, message: '', unpaired: r.plan.unpairedCount, wouldPair: r.plan.assignments.length, uncovered: r.plan.uncovered.length };
  } catch {
    return { ok: false, message: "Couldn't check pairing. Try again.", unpaired: 0, wouldPair: 0, uncovered: 0 };
  }
}

// Admin only. Pairs the booked interviews ahead that have no pair; pairs already set do not move.
export async function rerunPairing(): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Pairing ran again. Nothing moved.' };
  try {
    const r = await runPairing(await db());
    if (!r.ok) return r;
    if (r.paired === 0 && r.uncovered === 0) return { ok: true, message: 'Pairing ran again. Nothing moved.' };
    const tail = r.uncovered > 0 ? ` ${r.uncovered} could not be paired: fewer than two board members are free.` : '';
    return { ok: true, message: `Paired ${r.paired} ${r.paired === 1 ? 'interview' : 'interviews'}.${tail}` };
  } catch {
    return { ok: false, message: "That didn't save. Try again." };
  }
}

// Admin only. Replaces one interviewer on a paired interview by hand.
export async function swapInterviewerAction(slotId: string, fromUserId: string, toUserId: string): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Changed.' };
  try {
    const r = await swapInterviewer(await db(), slotId, fromUserId, toUserId);
    return r.ok ? { ok: true, message: 'Changed.' } : r;
  } catch {
    return { ok: false, message: "That didn't save. Try again." };
  }
}

// A board member saves their own Morning / Afternoon / Evening picks for the interview dates (D4).
export async function saveAvailability(picks: { day: string; block: string }[]): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Saved.' };
  try {
    const r = await saveMyAvailability(await db(), picks);
    return r.ok ? { ok: true, message: 'Saved.' } : r;
  } catch {
    return { ok: false, message: "That didn't save. Try again." };
  }
}

// Admin only. One video link per paired interview (D7); the applicant sees it in the Portal through my_interview().
export async function saveVideoLinks(links: { slotId: string; url: string }[]): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Saved.' };
  try {
    const r = await setVideoLinks(await db(), links);
    return r.ok ? { ok: true, message: r.saved === 1 ? 'Saved 1 link.' : `Saved ${r.saved} links.` } : r;
  } catch {
    return { ok: false, message: "That didn't save. Try again." };
  }
}

// ---- interview times (admin) -------------------------------------------------------------------------------------

// Makes the proposed times again from everyone's availability. Times nobody booked and nobody was offered are replaced.
export async function rebuildTimes(cycleId: string): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Nothing changed. The times already match everyone’s availability.' };
  try {
    const r = await rebuildProposedTimes(await db(), cycleId);
    if (!r.ok) return r;
    if (r.removed === 0 && r.added === 0) return { ok: true, message: 'Nothing changed. The times already match everyone’s availability.' };
    return { ok: true, message: `Rebuilt from availability. ${r.removed} removed, ${r.added} added.` };
  } catch {
    return { ok: false, message: "That didn't save. Try again." };
  }
}

// Adds one 30-minute time ("2026-11-10", "18:30" Eastern). After the times were sent, a new one opens to students at once.
export async function addProposedTime(cycleId: string, date: string, time: string, openNow: boolean): Promise<Msg & { slotId?: string }> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Added.' };
  try {
    const client = await db();
    const r = await addTime(client, cycleId, date, time);
    if (!r.ok) return r;
    if (openNow) {
      const o = await openProposedTimes(client, cycleId);
      if (!o.ok) return o;
    }
    return { ok: true, message: 'Added.', slotId: r.slotId };
  } catch {
    return { ok: false, message: "That didn't save. Try again." };
  }
}

// Removes a time nobody holds.
export async function removeProposedTime(slotId: string): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Removed.' };
  try {
    const r = await removeTime(await db(), slotId);
    return r.ok ? { ok: true, message: 'Removed.' } : r;
  } catch {
    return { ok: false, message: "That didn't save. Try again." };
  }
}

export type SendTimesResult = Msg & { emailed: number; notConfigured: boolean };

// "Email applicants to book": opens every proposed time to students, then sends the "Interview times are open" email
// (lib/email/send.ts sendBookingInvites: once per applicant, only to those with no booking). When email is not set up
// the times are still open, and the message says so.
export async function sendTimes(cycleId: string): Promise<SendTimesResult> {
  const fail = (message: string): SendTimesResult => ({ ok: false, message, emailed: 0, notConfigured: false });
  if (!hasSupabaseEnv()) return { ok: true, message: 'The times are open in the Portal.', emailed: 0, notConfigured: false };
  try {
    const opened = await openProposedTimes(await db(), cycleId);
    if (!opened.ok) return fail(opened.message);
    const r = await sendBookingInvites(cycleId);
    const open = 'The times are open in the Portal.';
    if (!r.ok) {
      if (r.reason === 'no-service-key') return { ok: true, message: `Email isn't set up here, so no emails went out. ${open}`, emailed: 0, notConfigured: true };
      if (r.reason === 'no-interview-end') return { ok: true, message: `${open} No emails went out: set the interview dates on the cycle first.`, emailed: 0, notConfigured: false };
      return { ok: true, message: `${open} No emails went out.`, emailed: 0, notConfigured: false };
    }
    if (r.notConfigured) return { ok: true, message: `Email isn't set up here, so no emails went out. ${open}`, emailed: 0, notConfigured: true };
    const tail = r.failed > 0 ? ` ${r.failed} didn't go. Press the button again to try those once more.` : '';
    return { ok: true, message: `Emailed ${r.sent} ${r.sent === 1 ? 'applicant' : 'applicants'}. ${open}${tail}`, emailed: r.sent, notConfigured: false };
  } catch {
    return fail("That didn't send. Try again.");
  }
}

// "Remind the others": no reminder email exists yet, so this says so instead of pretending.
export async function remindBoard(): Promise<Msg> {
  return { ok: false, message: "Reminder emails aren't set up yet. Ask them in Board chat." };
}

// ---- fairness (admin) --------------------------------------------------------------------------------------------

export type RebalancePreview = { ok: boolean; message: string; moves: MoveView[] };

// What "Rebalance future interviews" would move, for the confirm step. Moves nothing.
export async function previewRebalanceAction(cycleId: string): Promise<RebalancePreview> {
  // Mock mode: the page builds the preview from its own sample data.
  if (!hasSupabaseEnv()) return { ok: true, message: '', moves: [] };
  try {
    const r = await previewRebalance(await db(), cycleId);
    return r.ok ? { ok: true, message: '', moves: r.moves } : { ok: false, message: r.message, moves: [] };
  } catch {
    return { ok: false, message: "Couldn't check the rebalance. Try again.", moves: [] };
  }
}

export type RebalanceResult = Msg & { moves: MoveView[]; at: string };

// Moves future interviews (never within 48 hours; every interview keeps two people). Returns the moves so the caller
// can email the people affected: the coordinator wires sendRebalanceEmails(cycleId, moves) here after merge.
export async function rebalanceAction(cycleId: string): Promise<RebalanceResult> {
  const at = new Date().toISOString();
  if (!hasSupabaseEnv()) return { ok: true, message: '', moves: [], at };
  try {
    const r = await rebalanceInterviews(await db(), cycleId);
    if (!r.ok) return { ok: false, message: r.message, moves: [], at };
    const moves: MoveView[] = r.moves.map((m) => ({ slotId: m.slotId, startsAt: m.startsAt, applicant: m.applicant, from: m.from, to: m.to, fromName: m.fromName, toName: m.toName }));
    // WIRE: await sendRebalanceEmails(cycleId, moves); then say who got an email.
    const n = moves.length;
    const message = n === 0 ? 'Nothing needed to move.' : `Moved ${n} ${n === 1 ? 'interview' : 'interviews'}, ${whenLine(at)}. Emails to the people affected aren't set up yet, so tell ${joinNames(affected(moves))}.`;
    return { ok: true, message, moves, at };
  } catch {
    return { ok: false, message: "That didn't save. Try again.", moves: [], at };
  }
}
