# Ops Hub (staff app)

Next.js app for BTX board members. One staff role, board member. A board member with admin rights has app_metadata.role 'admin' (owner, 2026-10-12). Design source: Figma file `byg3AToqjCajJKPI88DkOz`, page "Ops Hub (staff)".

Run it from the repo root: `npm run dev:ops` (port 3001), `npm run build:ops`, `npm run lint:ops`, `npm run typecheck:ops`.

## Modes

- **Mock mode** (no `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`): nothing is guarded, every page shows the Figma sample data, sign-in accepts any email and the code `123456` (an email starting `outsider` shows the no-access screen). `?demo=error` on Applicants and Cycle draws the "didn't load" card.
- **Live mode** (both env vars set; Vercel builds get the BTX project's public defaults from `next.config.ts`): every route needs a session whose `app_metadata.role` is `admin` or `board` (the field `public.app_role()` reads). Any other account is signed out and sees "This account doesn't have Ops Hub access. Ask a BTX admin."

## Real data and mock data

Real (live mode): Applicants list and the full application (`applications`, `application_files`, `bookings`, `interview_slots`), the two PDFs (signed 60-second links to the private `applicant-documents` bucket), and the cycle's dates (`cycles`).

Scholarships > Interviews, Scoring, Selection and Awardees (branch `ops/scholarships`): booked interviews are real (`bookings`, `interview_slots`, `applications`); pairs, scores, notes, awards and awardee steps are mock (`mock/interviews.ts`, `scores.ts`, `selection.ts`, `awardees.ts`, `staff.ts`) shaped like the draft Ops Hub tables, so going live is a loader swap in `lib/`. Their write actions (`lib/actions/`) run in memory in mock mode; the live paths call the draft tables and are not tested. `?demo=stress` and `?demo=error` draw the Figma stress and load-error states on all four pages.

Mock, all behind `mock/`: Today, the sidebar counts, scores, interviewers, stages, the interview summary, the three schedule dates `cycles` has no column for, the cycle checklist and the Scholarships chat. Swap each `mock/` module for a loader with the same shape when the Ops Hub tables exist.

## Finance and Board members

Pages: Finance > Budget (`/finance/budget`), the phone approval screen (`/finance/budget/approval`), Finance > Fundraising (`/finance/fundraising`), Finance > Grants (`/finance/grants`) and Board members (`/people`). Everything about them is in `components/money/`, `components/people/`, `lib/{budget,fundraising,grants,people,money-*,mock-store,people-actions}.ts` and `mock/money.ts`.

- **Mock mode** (no Supabase env): the fixtures in `mock/money.ts` are the Figma frames' values. A role change changes an in-memory store (`lib/mock-store.ts`) that lasts until the tab reloads. `?demo=stress` draws the stress frames' data, `?demo=error` the "didn't load" card, `?as=board` shows a page as a board member (mock mode only).
- **Live mode**: the loaders read the draft Ops Hub tables and the writes call them (`lib/money-writes.ts`). All of it is NOT TESTED: the tables are a draft and not applied. Role changes go through the server action in `lib/people-actions.ts`, which needs `SUPABASE_SERVICE_ROLE_KEY` in the server's environment (NOT TESTED). The same key is required by the interview-email cron (`lib/email/interviews.ts` stops with `no-service-key` without it) and by the Google Calendar sync feed.
- **Finance actions are "Coming soon"** (owner, 2026-10-12): on Budget (and the phone approval screen), Fundraising and Grants every action that writes (log or edit spending, update funds on hand, log a gift, add a grant, approve, decline or undo a quarter plan) is a disabled control with a small "Coming soon" label. The pages still load and show whatever data exists. The write code in `lib/money-writes.ts` stays for later. Programs > Sponsorships ("Log a sponsorship") is unchanged.
- **Roles**: one staff role, board member. A board member with admin rights has app_metadata.role 'admin'. Everyone sees every page; only a board member with admin rights sees "Give admin rights" / "Remove admin rights", and nobody sees it on their own row. There is no invite screen (owner, 2026-10-12): accounts are set up server side through `inviteStaff` in `lib/people-actions.ts`, which has no button.

## Programs and Outreach

Pages: Programs (Certifications, Sponsorships, Mentorship) and Outreach (Plan, Instagram, Newsletter), admin and board (the only staff roles). Each page has one loader (`lib/programs.ts`, `lib/outreach.ts`) fed in mock mode from `mock/programs.ts` and `mock/outreach.ts` (the Figma frames' data, `?demo=stress` for the stress frames, `?demo=error` for the shared load-error card). Writes live in `lib/actions/programs.ts` and `lib/actions/outreach.ts`: in mock mode they only change the page's own state; in live mode they call the draft Ops Hub tables and `log_sponsorship()` (NOT TESTED: the tables are not applied). Mentor pairings, "Share the application" and "Past issues" have nothing in the draft schema, so they answer "Not connected yet". Post images, newsletter subscriber numbers and newsletter sending are not stored yet and stay on the mock fixtures.

## Google Calendar sync

Everything on the Calendar page is copied one way into the board's shared Google Calendar (info@thebtxfoundation.org) every 10 minutes. A Google Apps Script owned by info@ calls `GET /api/calendar-sync` (`app/api/calendar-sync/route.ts`), which answers only that script (a Google-signed identity token, checked in `lib/calendar-sync/verify-caller.ts`; no shared secret). The feed is built in `lib/calendar-sync/` and never includes applicant names.

The script writes through the Advanced Calendar service (switched on in its `appsscript.json`). Every synced event is privately marked when it is created, and only marked events are ever changed or deleted. Hand-made events are never touched. Edits made in Google to a synced event are put back within about 10 minutes. Each run is capped at 100 changes (40 deletions), and it refuses to empty the calendar or delete a large share of it at once; `syncNowAllowDeletes` lifts the second limit and keeps going until nothing is left to delete. A failed write marks the run as Failed, so Google emails info@. Setup, the limits, pausing (`removeTrigger`) and undoing (`deleteSyncedEvents`): [google/calendar-sync/README.md](google/calendar-sync/README.md).

## Teams interview links

BTX interviews are Microsoft Teams meetings only. Google Meet, Zoom and every other host are refused, by hand or otherwise (`isVideoUrl` in `lib/pairing-slots.ts`: https, host `teams.microsoft.com` or `teams.live.com`, up to 500 characters). In "Add the video links", **Make Teams links** makes a Teams meeting from BTX's Teams account (admin@btxfoundation.onmicrosoft.com) for every paired interview ahead that has no link or a non-Teams link, saves it, and emails it to the student and both interviewers the same way "Save and send" does. The fields stay so one link can be fixed by hand. Admins only.

- **How it signs in** (`lib/teams/`, server only): Microsoft Graph as a public client (Microsoft Graph Command Line Tools, no secret), tenant `78915995-e897-47de-b801-0d0dea583962`, scope `OnlineMeetings.ReadWrite User.Read offline_access`. Meetings are made with `createOrGet` keyed by the interview slot's id, so pressing the button again never makes a duplicate. Everyone skips the lobby and may present (the organizer account never attends). The meeting title is "BTX scholarship interview" plus the applicant's code, never a name or email.
- **Where the sign-in lives**: Microsoft hands back a new refresh token every time one is used. The newest is kept in `public.teams_auth` (one row, key `btx`; migration `20261106120000_teams_auth.sql`), which only the service role can read or write: row level security is on with no policies. So the feature also needs `SUPABASE_SERVICE_ROLE_KEY`.
- **Env var `BTX_TEAMS_REFRESH_TOKEN`** (server only, never `NEXT_PUBLIC_`): the seed. It is used when the table is empty, and again whenever the saved token is refused, so putting a fresh token in it re-connects Teams. With neither the row nor the env var (or no service key), the dialog says "Teams isn't connected yet." and the rest of the Ops Hub works as before.
- **Re-seeding**: `python3 -I ~/R&D/platform/teams-meeting.py --org btx login-browser` signs BTX's Teams account in on the Mac. That sign-in is the Mac's own; the server needs its own refresh token from the same kind of sign-in, put into `BTX_TEAMS_REFRESH_TOKEN` on Vercel (an env change, so it is gated like any other), then a redeploy. Tokens are never logged, shown or committed.
