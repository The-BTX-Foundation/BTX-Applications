'use server';

// Write actions for Scholarships > Interviews. Each one runs as the signed-in person, so the database's row-level
// security applies; the admin-only ones also say so in a clear message (see lib/pairing-db.ts).
//
// Live behaviour is tested against the local database (tests/pairing-db.live.test.ts, run with LIVE_DB=1).
// In mock mode (no Supabase env) the actions succeed and change nothing, like the Figma preview.
import { hasSupabaseEnv } from '@btx/data';
import { sessionClient } from '../supabase-server';
import { addInterviewSlots, planPairing, removeInterviewSlot, runPairing, saveMyAvailability, setVideoLinks, swapInterviewer, type Db } from '../pairing-db';

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

// Admin only, no screen yet ("Open interview times" is design pending). Adds 30-minute interview times.
export async function addInterviewTimes(entries: { date: string; startTime: string }[]): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Added.' };
  try {
    const r = await addInterviewSlots(await db(), entries);
    return r.ok ? { ok: true, message: r.added === 1 ? 'Added 1 time.' : `Added ${r.added} times.` } : r;
  } catch {
    return { ok: false, message: "That didn't save. Try again." };
  }
}

// Admin only, no screen yet. Removes an interview time nobody booked.
export async function removeInterviewTime(slotId: string): Promise<Msg> {
  if (!hasSupabaseEnv()) return { ok: true, message: 'Removed.' };
  try {
    const r = await removeInterviewSlot(await db(), slotId);
    return r.ok ? { ok: true, message: 'Removed.' } : r;
  } catch {
    return { ok: false, message: "That didn't save. Try again." };
  }
}
