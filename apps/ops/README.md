# Ops Hub (staff app)

Next.js app for BTX board members and admins (the only two staff roles; owner, 2026-10-12). Design source: Figma file `byg3AToqjCajJKPI88DkOz`, page "Ops Hub (staff)".

Run it from the repo root: `npm run dev:ops` (port 3001), `npm run build:ops`, `npm run lint:ops`, `npm run typecheck:ops`.

## Modes

- **Mock mode** (no `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`): nothing is guarded, every page shows the Figma sample data, sign-in accepts any email and the code `123456` (an email starting `outsider` shows the no-access screen). `?demo=error` on Applicants and Cycle draws the "didn't load" card.
- **Live mode** (both env vars set; Vercel builds get the BTX project's public defaults from `next.config.ts`): every route needs a session whose `app_metadata.role` is `admin` or `board` (the field `public.app_role()` reads). Any other account is signed out and sees "This account doesn't have Ops Hub access. Ask a BTX admin."

## Real data and mock data

Real (live mode): Applicants list and the full application (`applications`, `application_files`, `bookings`, `interview_slots`), the two PDFs (signed 60-second links to the private `applicant-documents` bucket), and the cycle's dates (`cycles`).

Scholarships > Interviews, Scoring, Selection and Awardees (branch `ops/scholarships`): booked interviews are real (`bookings`, `interview_slots`, `applications`); pairs, scores, notes, awards and awardee steps are mock (`mock/interviews.ts`, `scores.ts`, `selection.ts`, `awardees.ts`, `staff.ts`) shaped like the draft Ops Hub tables, so going live is a loader swap in `lib/`. Their write actions (`lib/actions/`) run in memory in mock mode; the live paths call the draft tables and are not tested. `?demo=stress` and `?demo=error` draw the Figma stress and load-error states on all four pages.

Mock, all behind `mock/`: Today, the sidebar counts, scores, interviewers, stages, the interview summary, the three schedule dates `cycles` has no column for, the cycle checklist and the Scholarships chat. Swap each `mock/` module for a loader with the same shape when the Ops Hub tables exist.

## Money and People and roles

Pages: Money > Budget (`/money/budget`), the phone approval screen (`/money/budget/approval`), Money > Fundraising, Money > Grants and Admin > People and roles (`/people`). Everything about them is in `components/money/`, `components/people/`, `lib/{budget,fundraising,grants,people,money-*,mock-store,people-actions}.ts` and `mock/money.ts`.

- **Mock mode** (no Supabase env): the fixtures in `mock/money.ts` are the Figma frames' values. A role change changes an in-memory store (`lib/mock-store.ts`) that lasts until the tab reloads. `?demo=stress` draws the stress frames' data, `?demo=error` the "didn't load" card, `?as=board` shows a page as a board member (mock mode only).
- **Live mode**: the loaders read the draft Ops Hub tables and the writes call them (`lib/money-writes.ts`). All of it is NOT TESTED: the tables are a draft and not applied. Role changes go through the server action in `lib/people-actions.ts`, which needs `SUPABASE_SERVICE_ROLE_KEY` in the server's environment (not set anywhere; NOT TESTED).
- **Money actions are "Coming soon"** (owner, 2026-10-12): on Budget (and the phone approval screen), Fundraising and Grants every action that writes (log or edit spending, update funds on hand, log a gift, add a grant, approve, decline or undo a quarter plan) is a disabled control with a small "Coming soon" label. The pages still load and show whatever data exists. The write code in `lib/money-writes.ts` stays for later. Programs > Sponsorships ("Log a sponsorship") is unchanged.
- **Roles**: staff are admins and board members only. Both see every page; only an admin sees "Change role", and nobody sees "Change role" on their own row. There is no invite screen (owner, 2026-10-12): accounts are set up server side through `inviteStaff` in `lib/people-actions.ts`, which has no button.

## Programs and Outreach

Pages: Programs (Certifications, Sponsorships, Mentorship) and Outreach (Plan, Instagram, Newsletter), admin and board (the only staff roles). Each page has one loader (`lib/programs.ts`, `lib/outreach.ts`) fed in mock mode from `mock/programs.ts` and `mock/outreach.ts` (the Figma frames' data, `?demo=stress` for the stress frames, `?demo=error` for the shared load-error card). Writes live in `lib/actions/programs.ts` and `lib/actions/outreach.ts`: in mock mode they only change the page's own state; in live mode they call the draft Ops Hub tables and `log_sponsorship()` (NOT TESTED: the tables are not applied). Mentor pairings, "Share the application" and "Past issues" have nothing in the draft schema, so they answer "Not connected yet". Post images, newsletter subscriber numbers and newsletter sending are not stored yet and stay on the mock fixtures.
