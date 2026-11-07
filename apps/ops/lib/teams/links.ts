// SERVER ONLY. "Make Teams links": a Teams meeting for every paired interview ahead in the current cycle that has no
// link yet or a link that is not a Teams link (an old Meet or Zoom link). Admin only.
//
// planTeamsLinks says what a run would do (the confirm step); makeTeamsLinks does it. An interview starting within 24
// hours that has another link is never replaced automatically: changing a link that close to the interview needs a
// person to check (it is reported as "needs a hand check"). An interview with no link at all still gets one.
//
// The signed-in admin's own Supabase client does the reads and the saves, so row-level security still decides who may
// write interview_pairings.video_url (admins only). The Teams sign-in itself is the service-role token store
// (./token.ts); it is only asked for when there is something to make.
import 'server-only';
import { currentCycle, readInterviews, sessionRole, type BookedInterview, type Db } from '../pairing-db';
import { isTeamsUrl } from '../pairing-slots';
import { bookingExternalId, createOrGetMeeting, meetingSubject } from './graph';
import { TOKEN_MESSAGES, type TokenResult } from './token';

/** Another link is not replaced automatically when the interview starts within this many hours. */
export const HAND_CHECK_HOURS = 24;

type Todo = BookedInterview & { replacing: boolean };

export type TeamsPlan = {
  cycleId: string;
  /** Interviews that will get a new Teams link. */
  toMake: Todo[];
  /** How many of toMake replace another (non-Teams) link. */
  replacing: number;
  /** Paired interviews ahead that already have a Teams link. */
  had: number;
  /** Interviews within HAND_CHECK_HOURS that have another link: left alone, for a person to check. */
  handCheck: number;
  /** Every paired interview ahead that has (or after the run will have) a Teams link: the ones emailed afterwards. */
  teamsSlotIds: string[];
};

export type PlanResult = ({ ok: true } & TeamsPlan) | { ok: false; message: string };

// Works out what "Make Teams links" would do now. Admin only.
export async function planTeamsLinks(client: Db, now = new Date()): Promise<PlanResult> {
  const me = await sessionRole(client);
  // Role check for a clear message; the database's row-level security is the real gate on the saves.
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can make Teams links.' };
  const cycle = await currentCycle(client);
  if (!cycle) return { ok: false, message: 'There is no open cycle.' };
  const { booked, pairs } = await readInterviews(client, cycle.id);
  const t = now.getTime();
  const soon = t + HAND_CHECK_HOURS * 3_600_000;
  const toMake: Todo[] = [];
  const teamsSlotIds: string[] = [];
  let had = 0;
  let handCheck = 0;
  for (const b of booked) {
    const p = pairs.get(b.slotId);
    const starts = Date.parse(b.startsAt);
    if (!p || starts <= t) continue; // unpaired or already past
    const url = (p.videoUrl ?? '').trim();
    if (isTeamsUrl(url)) {
      had += 1;
      teamsSlotIds.push(b.slotId);
    } else if (url === '') {
      toMake.push({ ...b, replacing: false });
      teamsSlotIds.push(b.slotId);
    } else if (starts <= soon) {
      handCheck += 1;
    } else {
      toMake.push({ ...b, replacing: true });
      teamsSlotIds.push(b.slotId);
    }
  }
  return { ok: true, cycleId: cycle.id, toMake, replacing: toMake.filter((x) => x.replacing).length, had, handCheck, teamsSlotIds };
}

export type TeamsLinksResult =
  | {
      ok: true;
      cycleId: string;
      /** New Teams links saved by this run. */
      made: number;
      /** Paired interviews that already had a Teams link (left alone). */
      had: number;
      /** Interviews Teams or the database could not do this time. Running again retries only those. */
      failed: number;
      /** Interviews within 24 hours with another link, left for a person to check. */
      handCheck: number;
      /** The links saved by this run, so the dialog can show them. */
      links: { slotId: string; url: string }[];
      /** Slots whose new link replaced another link (their email says so). */
      replaced: string[];
      /** Every paired interview ahead that now has a Teams link: all of them get the video-link email (once per link). */
      emailSlotIds: string[];
    }
  | { ok: false; message: string };

export type TeamsLinksDeps = {
  /** Gets the Teams access token (serverAccessToken in the app; a fake in tests). */
  token: () => Promise<TokenResult>;
  fetch?: typeof fetch;
  now?: Date;
};

// Makes the missing Teams links. A booking's meeting is found again by "slotId:applicationId" (createOrGet externalId),
// so pressing the button twice never makes a second meeting for the same booking.
export async function makeTeamsLinks(client: Db, deps: TeamsLinksDeps): Promise<TeamsLinksResult> {
  const plan = await planTeamsLinks(client, deps.now ?? new Date());
  if (!plan.ok) return plan;
  const base = { ok: true as const, cycleId: plan.cycleId, had: plan.had, handCheck: plan.handCheck };
  if (plan.toMake.length === 0) return { ...base, made: 0, failed: 0, links: [], replaced: [], emailSlotIds: plan.teamsSlotIds };

  const t = await deps.token();
  if (!t.ok) return { ok: false, message: TOKEN_MESSAGES[t.reason] };

  const links: { slotId: string; url: string }[] = [];
  const replaced: string[] = [];
  const failedIds = new Set<string>();
  for (const b of plan.toMake) {
    const m = await createOrGetMeeting(t.accessToken, { externalId: bookingExternalId(b.slotId, b.applicationId), startsAt: b.startsAt, endsAt: b.endsAt, subject: meetingSubject(b.code) }, deps.fetch);
    if (!m.ok) {
      failedIds.add(b.slotId);
      continue;
    }
    // Saved as the admin: RLS lets only admins update interview_pairings. No row back means the pair was removed meanwhile.
    const u = await client.from('interview_pairings').update({ video_url: m.joinUrl }).eq('slot_id', b.slotId).select('slot_id');
    if (u.error || (u.data ?? []).length === 0) {
      failedIds.add(b.slotId);
      continue;
    }
    links.push({ slotId: b.slotId, url: m.joinUrl });
    if (b.replacing) replaced.push(b.slotId);
  }
  return { ...base, made: links.length, failed: failedIds.size, links, replaced, emailSlotIds: plan.teamsSlotIds.filter((id) => !failedIds.has(id)) };
}

const count = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;

/** The confirm step's sentences, from a plan. */
export function teamsConfirmLine(p: { toMake: number; replacing: number; handCheck: number }): string {
  const parts: string[] = [];
  if (p.toMake > 0) parts.push(`Makes ${count(p.toMake, 'Teams link', 'Teams links')} and emails ${count(p.toMake, 'student', 'students')} and their interviewers.`);
  else parts.push('Every paired interview ahead already has a Teams link. Anyone who has not had theirs by email gets it now.');
  if (p.replacing > 0) parts.push(`${count(p.replacing, 'interview already has', 'interviews already have')} another link; it will be replaced.`);
  if (p.handCheck > 0) parts.push(`${count(p.handCheck, 'interview starts', 'interviews start')} within 24 hours with another link. ${p.handCheck === 1 ? 'It needs' : 'They need'} a hand check and won't change.`);
  return parts.join(' ');
}

/** One plain sentence about a run, for the dialog. The email line is added by the caller. */
export function teamsLinksLine(r: { made: number; had: number; failed: number; handCheck: number }): string {
  const parts: string[] = [];
  if (r.made > 0) parts.push(`Made ${count(r.made, 'Teams link', 'Teams links')}.`);
  else if (r.failed === 0 && r.had > 0) parts.push('No new Teams links were needed.');
  if (r.failed > 0) parts.push(`${count(r.failed, "link didn't work", "links didn't work")}. Press Make Teams links again to try ${r.failed === 1 ? 'it' : 'them'}.`);
  if (r.handCheck > 0) parts.push(`${count(r.handCheck, 'interview needs', 'interviews need')} a hand check: ${r.handCheck === 1 ? 'it starts' : 'they start'} within 24 hours with another link.`);
  if (parts.length === 0) return 'No paired interviews are waiting for a link.';
  return parts.join(' ');
}
