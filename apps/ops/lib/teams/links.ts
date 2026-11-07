// SERVER ONLY. "Make Teams links": a Teams meeting for every paired interview ahead in the current cycle that has no
// link yet or a link that is not a Teams link (an old Meet or Zoom link). Admin only.
//
// The signed-in admin's own Supabase client does the reads and the saves, so row-level security still decides who may
// write interview_pairings.video_url (admins only). The Teams sign-in itself is the service-role token store
// (./token.ts); it is only asked for when there is something to make.
import 'server-only';
import { currentCycle, readInterviews, sessionRole, type Db } from '../pairing-db';
import { isTeamsUrl } from '../pairing-slots';
import { createOrGetMeeting, meetingSubject } from './graph';
import { TOKEN_MESSAGES, type TokenResult } from './token';

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
      /** The links saved by this run, so the dialog can show them. */
      links: { slotId: string; url: string }[];
    }
  | { ok: false; message: string };

export type TeamsLinksDeps = {
  /** Gets the Teams access token (serverAccessToken in the app; a fake in tests). */
  token: () => Promise<TokenResult>;
  fetch?: typeof fetch;
  now?: Date;
};

// Makes the missing Teams links. Interviews already past are left as they are. A slot's meeting is found again by its
// id (createOrGet externalId), so pressing the button twice never makes a second meeting for the same interview.
export async function makeTeamsLinks(client: Db, deps: TeamsLinksDeps): Promise<TeamsLinksResult> {
  const me = await sessionRole(client);
  // Role check for a clear message; the database's row-level security is the real gate on the saves below.
  if (me.role !== 'admin') return { ok: false, message: 'Only board members with admin rights can make Teams links.' };
  const cycle = await currentCycle(client);
  if (!cycle) return { ok: false, message: 'There is no open cycle.' };
  const { booked, pairs } = await readInterviews(client, cycle.id);
  const now = (deps.now ?? new Date()).getTime();
  const paired = booked.filter((b) => pairs.has(b.slotId) && Date.parse(b.startsAt) > now);
  const todo = paired.filter((b) => !isTeamsUrl(pairs.get(b.slotId)?.videoUrl ?? ''));
  const had = paired.length - todo.length;
  if (todo.length === 0) return { ok: true, cycleId: cycle.id, made: 0, had, failed: 0, links: [] };

  const t = await deps.token();
  if (!t.ok) return { ok: false, message: TOKEN_MESSAGES[t.reason] };

  const links: { slotId: string; url: string }[] = [];
  let failed = 0;
  for (const b of todo) {
    const m = await createOrGetMeeting(t.accessToken, { externalId: b.slotId, startsAt: b.startsAt, endsAt: b.endsAt, subject: meetingSubject(b.code) }, deps.fetch);
    if (!m.ok) {
      failed += 1;
      continue;
    }
    // Saved as the admin: RLS lets only admins update interview_pairings. No row back means the pair was removed meanwhile.
    const u = await client.from('interview_pairings').update({ video_url: m.joinUrl }).eq('slot_id', b.slotId).select('slot_id');
    if (u.error || (u.data ?? []).length === 0) {
      failed += 1;
      continue;
    }
    links.push({ slotId: b.slotId, url: m.joinUrl });
  }
  return { ok: true, cycleId: cycle.id, made: links.length, had, failed, links };
}

/** One plain sentence about a run, for the dialog. The email line is added by the caller. */
export function teamsLinksLine(r: { made: number; had: number; failed: number }): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const parts: string[] = [];
  if (r.made > 0) parts.push(`Made ${n(r.made, 'Teams link', 'Teams links')}.`);
  if (r.had > 0) parts.push(`${n(r.had, 'interview already had one', 'interviews already had one')}.`);
  if (r.failed > 0) parts.push(`${n(r.failed, "link didn't work", "links didn't work")}. Press Make Teams links again to try ${r.failed === 1 ? 'it' : 'them'}.`);
  if (parts.length === 0) return 'No paired interviews are waiting for a link.';
  if (r.made === 0 && r.failed === 0) return 'Every paired interview already has a Teams link.';
  return parts.join(' ');
}
