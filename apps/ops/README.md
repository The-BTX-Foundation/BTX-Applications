# Ops Hub (staff app)

Next.js app for BTX board members, reviewers and admins. Design source: Figma file `byg3AToqjCajJKPI88DkOz`, page "Ops Hub (staff)".

Run it from the repo root: `npm run dev:ops` (port 3001), `npm run build:ops`, `npm run lint:ops`, `npm run typecheck:ops`.

## Modes

- **Mock mode** (no `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`): nothing is guarded, every page shows the Figma sample data, sign-in accepts any email and the code `123456` (an email starting `outsider` shows the no-access screen). `?demo=error` on Applicants and Cycle draws the "didn't load" card.
- **Live mode** (both env vars set; Vercel builds get the BTX project's public defaults from `next.config.ts`): every route needs a session whose `app_metadata.role` is `admin`, `board` or `reviewer` (the field `public.app_role()` reads). Any other account is signed out and sees "This account doesn't have Ops Hub access. Ask a BTX admin."

## Real data and mock data

Real (live mode): Applicants list and the full application (`applications`, `application_files`, `bookings`, `interview_slots`), the two PDFs (signed 60-second links to the private `applicant-documents` bucket), and the cycle's dates (`cycles`).

Mock, all behind `mock/`: Today, the sidebar counts, scores, interviewers, stages, the interview summary, the three schedule dates `cycles` has no column for, the cycle checklist and the Scholarships chat. Swap each `mock/` module for a loader with the same shape when the Ops Hub tables exist.

## Programs and Outreach

Pages: Programs (Certifications, Sponsorships, Mentorship) and Outreach (Plan, Instagram, Newsletter), admin and board only (a reviewer gets "not found"). Each page has one loader (`lib/programs.ts`, `lib/outreach.ts`) fed in mock mode from `mock/programs.ts` and `mock/outreach.ts` (the Figma frames' data, `?demo=stress` for the stress frames, `?demo=error` for the shared load-error card). Writes live in `lib/actions/programs.ts` and `lib/actions/outreach.ts`: in mock mode they only change the page's own state; in live mode they call the draft Ops Hub tables and `log_sponsorship()` (NOT TESTED: the tables are not applied). Mentor pairings, "Share the application" and "Past issues" have nothing in the draft schema, so they answer "Not connected yet". Post images, newsletter subscriber numbers and newsletter sending are not stored yet and stay on the mock fixtures.
