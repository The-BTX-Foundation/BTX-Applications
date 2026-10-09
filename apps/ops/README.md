# Ops Hub (staff app)

Next.js app for BTX board members, reviewers and admins. Design source: Figma file `byg3AToqjCajJKPI88DkOz`, page "Ops Hub (staff)".

Run it from the repo root: `npm run dev:ops` (port 3001), `npm run build:ops`, `npm run lint:ops`, `npm run typecheck:ops`.

## Modes

- **Mock mode** (no `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`): nothing is guarded, every page shows the Figma sample data, sign-in accepts any email and the code `123456` (an email starting `outsider` shows the no-access screen). `?demo=error` on Applicants and Cycle draws the "didn't load" card.
- **Live mode** (both env vars set; Vercel builds get the BTX project's public defaults from `next.config.ts`): every route needs a session whose `app_metadata.role` is `admin`, `board` or `reviewer` (the field `public.app_role()` reads). Any other account is signed out and sees "This account doesn't have Ops Hub access. Ask a BTX admin."

## Real data and mock data

Real (live mode): Applicants list and the full application (`applications`, `application_files`, `bookings`, `interview_slots`), the two PDFs (signed 60-second links to the private `applicant-documents` bucket), and the cycle's dates (`cycles`).

Scholarships > Interviews, Scoring, Selection and Awardees (branch `ops/scholarships`): booked interviews are real (`bookings`, `interview_slots`, `applications`); pairs, scores, notes, awards and awardee steps are mock (`mock/interviews.ts`, `scores.ts`, `selection.ts`, `awardees.ts`, `staff.ts`) shaped like the draft Ops Hub tables, so going live is a loader swap in `lib/`. Their write actions (`lib/actions/`) run in memory in mock mode; the live paths call the draft tables and are not tested. `?demo=stress` and `?demo=error` draw the Figma stress and load-error states on all four pages.

Mock, all behind `mock/`: Today, the sidebar counts, scores, interviewers, stages, the interview summary, the three schedule dates `cycles` has no column for, the cycle checklist and the Scholarships chat. Swap each `mock/` module for a loader with the same shape when the Ops Hub tables exist.
