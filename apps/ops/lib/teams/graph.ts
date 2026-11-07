// SERVER ONLY. Makes (or finds) the Teams meeting for one interview through Microsoft Graph, as BTX's Teams meetings
// account (meetings@btxfoundation.onmicrosoft.com, which organizes but never attends).
//
// Two calls per meeting:
//   1. createOrGet with only its documented fields (externalId, start, end, subject). externalId is the booking
//      ("slotId:applicationId"), so asking twice for the same booking returns the same meeting and a retry never makes a
//      duplicate, while a slot re-booked by another student gets a new meeting.
//   2. PATCH the meeting with the lobby rule (owner, 2026-11-06): people in BTX's own Microsoft 365 organization (the
//      board, signed in with BTX accounts) go straight in and may present; everyone else (the student) waits in the
//      lobby until a board member lets them in. The PATCH answer must show that rule, or the meeting is not used.
import 'server-only';
import { isTeamsUrl } from '../pairing-slots';

export const GRAPH_MEETINGS = 'https://graph.microsoft.com/v1.0/me/onlineMeetings';

export type MeetingInput = { externalId: string; startsAt: string; endsAt: string; subject: string };
export type MeetingResult = { ok: true; joinUrl: string } | { ok: false };

/** The lobby rule every BTX interview gets: BTX accounts skip the lobby and present; nobody else does. Never 'everyone'. */
export const ORG_ONLY_SETTINGS = { lobbyBypassSettings: { scope: 'organization', isDialInBypassEnabled: false }, allowedPresenters: 'organization' } as const;

type GraphMeeting = { id?: unknown; joinWebUrl?: unknown; allowedPresenters?: unknown; lobbyBypassSettings?: { scope?: unknown; isDialInBypassEnabled?: unknown } | null };

/** Every call to Microsoft gives up after this long, so a hung request cannot hold the page. */
export const MICROSOFT_TIMEOUT_MS = 15_000;

// Sends one JSON request to Graph. Returns the parsed body, or null on any network or HTTP problem or a timeout.
async function graph(f: typeof fetch, accessToken: string, url: string, method: 'POST' | 'PATCH', body: unknown): Promise<GraphMeeting | null> {
  try {
    const res = await f(url, {
      method,
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(MICROSOFT_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as GraphMeeting;
  } catch {
    return null;
  }
}

/** The externalId for a booking: the slot and the application, so a re-booked slot gets its own meeting. */
export function bookingExternalId(slotId: string, applicationId: string): string {
  return `${slotId}:${applicationId}`;
}

/** Makes or finds the booking's Teams meeting, applies the lobby rule, and returns its join link. */
export async function createOrGetMeeting(accessToken: string, input: MeetingInput, f: typeof fetch = fetch): Promise<MeetingResult> {
  const m = await graph(f, accessToken, `${GRAPH_MEETINGS}/createOrGet`, 'POST', {
    externalId: input.externalId,
    startDateTime: input.startsAt,
    endDateTime: input.endsAt,
    subject: input.subject,
  });
  if (!m || typeof m.joinWebUrl !== 'string' || !isTeamsUrl(m.joinWebUrl)) return { ok: false };
  if (typeof m.id !== 'string' || m.id === '') return { ok: false };
  // Always set the lobby rule (a meeting found again may have been changed by hand), then check the answer shows it.
  const p = await graph(f, accessToken, `${GRAPH_MEETINGS}/${encodeURIComponent(m.id)}`, 'PATCH', ORG_ONLY_SETTINGS);
  if (!p || p.allowedPresenters !== 'organization' || p.lobbyBypassSettings?.scope !== 'organization' || p.lobbyBypassSettings?.isDialInBypassEnabled !== false) return { ok: false };
  return { ok: true, joinUrl: m.joinWebUrl };
}

/** The meeting title. Only the applicant's short code, never a name or email (the title shows in calendars and Teams). */
export function meetingSubject(code: string | null | undefined): string {
  const c = (code ?? '').trim();
  return c && c !== '—' ? `BTX scholarship interview ${c}` : 'BTX scholarship interview';
}
