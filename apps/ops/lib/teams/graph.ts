// SERVER ONLY. Makes (or finds) the Teams meeting for one interview through Microsoft Graph, as BTX's Teams account.
//
// createOrGet with externalId = the interview slot's id: asking twice for the same slot returns the same meeting, so a
// retry never makes a duplicate. Everyone joins from a personal email and the organizer account never attends, so the
// meeting lets everyone skip the lobby and everyone may present.
import 'server-only';
import { isTeamsUrl } from '../pairing-slots';

export const GRAPH_MEETINGS = 'https://graph.microsoft.com/v1.0/me/onlineMeetings';

export type MeetingInput = { externalId: string; startsAt: string; endsAt: string; subject: string };
export type MeetingResult = { ok: true; joinUrl: string } | { ok: false };

// The meeting settings every BTX interview needs (no lobby, anyone may present).
const OPEN_SETTINGS = { lobbyBypassSettings: { scope: 'everyone', isDialInBypassEnabled: true }, allowedPresenters: 'everyone' } as const;

type GraphMeeting = { id?: unknown; joinWebUrl?: unknown; allowedPresenters?: unknown; lobbyBypassSettings?: { scope?: unknown; isDialInBypassEnabled?: unknown } | null };

// Sends one JSON request to Graph. Returns the parsed body, or null on any network or HTTP problem.
async function graph(f: typeof fetch, accessToken: string, url: string, method: 'POST' | 'PATCH', body: unknown): Promise<GraphMeeting | null> {
  try {
    const res = await f(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as GraphMeeting;
  } catch {
    return null;
  }
}

/** Makes or finds the slot's Teams meeting and returns its join link. The link must be a Teams link the database takes. */
export async function createOrGetMeeting(accessToken: string, input: MeetingInput, f: typeof fetch = fetch): Promise<MeetingResult> {
  const m = await graph(f, accessToken, `${GRAPH_MEETINGS}/createOrGet`, 'POST', {
    externalId: input.externalId,
    startDateTime: input.startsAt,
    endDateTime: input.endsAt,
    subject: input.subject,
    ...OPEN_SETTINGS,
  });
  if (!m || typeof m.joinWebUrl !== 'string' || !isTeamsUrl(m.joinWebUrl)) return { ok: false };
  // createOrGet may not apply the lobby and presenter settings (or an older meeting for this slot may lack them), so
  // when the answer does not show them, they are set with a second call. Without them, guests would wait in a lobby
  // nobody is there to open.
  const open = m.allowedPresenters === 'everyone' && m.lobbyBypassSettings?.scope === 'everyone' && m.lobbyBypassSettings?.isDialInBypassEnabled === true;
  if (!open) {
    if (typeof m.id !== 'string' || m.id === '') return { ok: false };
    const p = await graph(f, accessToken, `${GRAPH_MEETINGS}/${encodeURIComponent(m.id)}`, 'PATCH', OPEN_SETTINGS);
    if (!p) return { ok: false };
  }
  return { ok: true, joinUrl: m.joinWebUrl };
}

/** The meeting title. Only the applicant's short code, never a name or email (the title shows in calendars and Teams). */
export function meetingSubject(code: string | null | undefined): string {
  const c = (code ?? '').trim();
  return c && c !== '—' ? `BTX scholarship interview ${c}` : 'BTX scholarship interview';
}
