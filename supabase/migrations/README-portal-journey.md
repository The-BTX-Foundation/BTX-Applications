# Portal journey: what the database change adds

File: `20261010130000_portal_journey.sql`. Drafted 2026-10-10. **Not applied.** It is applied right after
`20261010120000_ops_hub.sql`, in the same approval, on project **awiaebtqalcmfafvktwh**. It is one transaction and is
safe to run twice.

## What each piece does

| # | Screen | Adds | Portal call |
|---|---|---|---|
| 1 | Schedule, change your time | `open_interview_slots(cycle)`: future slots nobody holds. Only a signed-in applicant with a submitted application in that cycle can call it (error `no_submitted_application`). Returns id, start and end only. Applicants **no longer read every slot**: they read only slots they hold or held. Staff still read all. | `rpc('open_interview_slots', { p_cycle_id })` → `[{ id, starts_at, ends_at }]` |
| 2 | None of these times work | Table `interview_free_times`: days (`Mon`..`Sun`), windows (`morning`, `afternoon`, `evening`), note (up to 1,000 characters). One row per application. She adds or changes hers while she's submitted and holds no time. Staff read all. | `from('interview_free_times').upsert({ application_id, days, windows, note })` |
| 3 | Change your time: "Anything we should know?" | `bookings.note`. `switch_booking(p_new_slot, p_note default null)` saves the note on the new booking (or on her current one if she keeps the same time). Calls without `p_note` behave exactly as before. New error: `note_too_long`. | `rpc('switch_booking', { p_new_slot, p_note })` |
| 4 | Decision | `cycles.decisions_released_at` (admins set it when letters go out). `my_decision(cycle)` returns `{kind:'won', awardId, awardName, amountCents, storySent}`, `{kind:'not-picked'}`, or null. It stays **null until the release time has passed**, so nobody sees "not picked" early. | `rpc('my_decision', { p_cycle_id })` |
| 5 | Her interview | `my_interview(cycle)` returns `{slotId, startsAt, endsAt, interviewers: [names], videoUrl}` for her own active booking, or null. The names and link come from the admin's pairing for that slot (`[]` and null until set). | `rpc('my_interview', { p_cycle_id })` |
| 6 | Photo and story | Table `award_stories` (one row per award): story (100 words max), photo path, consent ("BTX can show my photo and story"), `sent_at` (= "story sent"). Sending needs a photo, a story and consent. Private bucket `award-photos` (JPG or PNG, 10 MB) at `{user id}/{award id}/{file}`. She reads and writes only her own, only while she holds a released award. Staff read all. | upload to `award-photos`, then `from('award_stories').upsert({ award_id, story, photo_path, consent, sent_at })` |
| 7 | "Pick a time by" | Nothing new: the Portal uses `cycles.interview_end`. | none |

## Checked before handing over

- The Postgres 17 parser reads it cleanly: 69 statements, 5 PL/pgSQL bodies.
- In a local dry run on Postgres 17 (PGlite) I applied the fresh start, then the Ops Hub, then this file twice. 49 of 49 checks passed.
- The checks cover every item:
  - Another student can't see a taken slot, who holds it, someone else's interview, link, free times, photo or story, or anyone's decision before release.
  - Signed-out users get nothing.
  - A board member can't use the applicant slot list.
- The Ops Hub (47/47) and Terpmail (14/14) dry runs still pass.

## Roll back

1. Drop `award_stories`, `interview_free_times` and the five `award_photos_*` storage rules.
2. Drop `open_interview_slots`, `my_decision`, `my_interview` and `holds_award`.
3. Put back the fresh-start `interview_slots_select_signed_in` rule and `switch_booking(uuid)`, then drop the two new slot rules and `switch_booking(uuid, text)`.
4. Optionally drop `bookings.note` and `cycles.decisions_released_at`.
