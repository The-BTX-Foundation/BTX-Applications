# Portal analytics

How the Scholarship Portal (apply.thebtxfoundation.org) measures the apply funnel, in plain English. It uses the same Google Analytics 4 property as the website, so the board can follow a visit from the website's Apply button to a submitted application.

The code:

- `lib/analytics.ts` holds the rules: which events, which parameters, what a page address looks like once cleaned, and the filter on every hit to Google.
- `lib/analytics-client.ts` decides whether the Google tag loads, loads it, and sends the events.
- `app/Analytics.tsx` puts it on every page.
- The website's side is in the Btx-Website repo, `docs/ANALYTICS.md`.

**The hard rule.** Applicant data is T1: students, some of them minors (security-playbook IN-51). No name, email, phone number, answer, file name, application ID or user ID ever reaches Google, and neither does any page address that carries one. The Portal sends counts and fixed codes only.

## 1. Switching it on

Nothing is sent until the website's GA4 measurement ID is set. The ID looks like `G-ABC123XYZ`.

- **Normal way:** put the ID in `GA_ID` at the top of `lib/analytics.ts`, in a one-line pull request. It ships with the next merge.
- **Override:** the Vercel variable `NEXT_PUBLIC_GA_ID` wins over `GA_ID`. The end-to-end tests use it. Changing it on Vercel is an environment change, so it is separately gated.
- **A badly formed ID counts as no ID.** A typo never loads a broken tag.

The Google tag loads only when all of these hold:

| Check | Why |
| --- | --- |
| The address is exactly `apply.thebtxfoundation.org` | Vercel previews and local runs never send anything. |
| The browser does not send Global Privacy Control | GPC means "do not sell or share". The tag does not load at all. |
| Nobody signed in is staff or a tester | A signed-in account with a staff role (`admin`, `board`) sends nothing. Neither does any account that is not a Terpmail address, since only test addresses on the allow-list can sign in that way. Once that happens, this browser stays off for good. |
| This browser has not been switched off | Open `https://apply.thebtxfoundation.org/?analytics=off` once, in any browser you test with. `?analytics=on` turns it back on. |

When the tag is off, events still go into the page's own `dataLayer`, and nothing leaves the browser. That is how previews and the tests check them.

Consent Mode defaults: analytics storage granted; ad storage, ad user data and ad personalization denied; ads data redaction on. Google signals and ad personalization are off. The Portal sends its own page views, so Google's automatic one is off.

## 2. Event dictionary

The funnel starts on the website and continues here. Same property, same visit.

| Where | Event | Fires when | Parameters | Key event |
| --- | --- | --- | --- | --- |
| Website | `apply_click` | Someone clicks a link to /apply/ | placement | no |
| Website | `application_start` | Someone clicks through to the Portal | placement | yes |
| Portal | `page_view` | Every screen, with a clean address (section 3) | none of our own | no |
| Portal | `sign_in_error` | A sign-in step fails | `code` (list below) | no |
| Portal | `sign_up` | The code or email link that just checked out created the account | `method`: `email_code` or `email_link` | yes |
| Portal | `application_begin` | A signed-in student's draft application is created | none | yes |
| Portal | `application_step` | A student reaches one of the five steps | `step_number` 1 to 5, `step_name`: `basic_info`, `scholarship`, `short_answers`, `documents`, `review` | no |
| Portal | `application_submit` | The application is submitted | none | yes |

`application_start` (website) and `application_begin` (Portal) are different on purpose. The first counts clicks toward the Portal. The second counts drafts actually opened.

Sign-in error codes: `email_missing`, `email_not_terpmail`, `send_rate_limited`, `send_failed`, `code_incomplete`, `code_wrong`, `code_expired`, `verify_failed`, `link_failed`, `terpmail_refused`. A code says which rule failed. It never carries the address or the code typed.

Pages opened as review fixtures (`?demo=`, `?preview=`, `?stress=`) show sample data and are not measured.

## 3. What never leaves the browser

Four walls, each tested.

1. **Page addresses are rebuilt, never copied.**
   - A page is reported only as one of the Portal's known paths, listed in `ROUTES` in `lib/analytics.ts`. Anything else, including a future page with an ID in its path, is reported as `/other`.
   - Every query parameter is dropped (`next`, `error`, `demo`, `_gl`, anything added later), and so is the `#` part.
   - The only exceptions are `utm_source`, `utm_medium` and `utm_campaign`, and only when the value is short lowercase words, numbers and hyphens with nothing shaped like an ID. `utm_content` and `utm_term` are always dropped, because email tools put per-recipient IDs there.
   - The page title sent is a fixed name from the same list, never the page's own title.
   - The referrer is cut to its origin when it is another site, and cleaned like a page address when it is the Portal.
2. **Our own events are allow-listed.** Only the six events above are accepted. Each takes only the parameters listed, and each value must be one of a fixed list or a whole number in range. A deny-list drops names such as `email`, `name`, `phone`, `answer`, `id`, `application_id`, `user_id`, `file_name`, `url` and `link_url` first, even if a future change passes them.
3. **A filter checks every request to Google before it leaves.** It works no matter what Google's own tag adds.
   - The filter sits on the two ways the tag sends: `fetch` and `sendBeacon`.
   - Only these events may reach Google: our six, the Portal's own page views, and Google's engagement pings (`user_engagement`, `scroll`, `session_start`, `first_visit`).
   - Every automatic link click, file download, form, site-search and video event is removed. Those would carry link addresses (an interview's video link), file names and form addresses.
   - A page view the Portal did not send itself is removed too, so a screen is never counted twice.
   - The page address, referrer and title on every hit are cleaned again.
   - User IDs and user properties are removed.
   - Requests to Google's advertising hosts (google.com, doubleclick.net) are not sent at all.
   - A request the filter can't read is dropped.
4. **Staff and testers send nothing.** See section 1.

## 4. GA4 property settings checklist (Portal additions)

Do these in the same property as the website, after the website's own checklist (Btx-Website `docs/ANALYTICS.md` section 4).

- [ ] Admin → Data streams → the web stream → Configure tag settings → **Configure your domains**: add `thebtxfoundation.org` and `apply.thebtxfoundation.org`. This keeps a visit going from the website to the Portal.
- [ ] Same place → **List unwanted referrals**: add `apply.thebtxfoundation.org` and `thebtxfoundation.org`.
- [ ] Enhanced measurement → Page views → advanced: **Page changes based on browser history events** can stay on or off. The Portal's filter drops those page views either way. Off is tidier.
- [ ] Mark these as key events: `sign_up`, `application_begin`, `application_submit`.
- [ ] Register these event-scoped custom dimensions: `method`, `code`, `step_name`, `step_number`.
- [ ] Data retention 14 months, Google signals off (same as the website).

## 5. The funnel report for the board

GA4 → Explore → Funnel exploration. Make it an open funnel and use these steps:

1. `apply_click` or `application_start` (the website)
2. `sign_up` (an account created), or a `page_view` on `/sign-in` to include returning students
3. `application_begin`
4. `application_step` where `step_number` = 1, then 2, 3, 4 and 5, as five separate funnel steps
5. `application_submit`

Break it down by `session source / medium` to compare Instagram, the newsletter and the website. `sign_in_error` broken down by `code` shows where sign-in loses people.

## 6. Verifying

- `npm test -w @btx/portal` runs `tests/analytics.test.ts`. It covers the rules: address cleaning, the allow- and deny-lists, the hit filter, and who counts as staff.
- `npm run e2e -w @btx/portal` runs `e2e/analytics.spec.ts`, which uses the **real** Google tag.
  - The browser maps `apply.thebtxfoundation.org` to the local dev server, so the production-host rule runs as it will live.
  - Every request to Google's analytics and ad hosts is answered locally and never leaves the machine. As a backstop, those hosts don't resolve at all.
  - It walks sign-in through submit, with marker values typed into every field and put into the addresses and the referrer.
  - It also fires Google-style automatic events (an outbound click on a meeting link, a history page view on an address with an ID, a file download).
  - It checks four things. The funnel events reach the collect endpoint. The automatic events and the page view Google sent itself never leave. Every address sent is clean. No marker appears in the `dataLayer` or in any request to Google.
  - Other tests in the file cover GPC (no tag), `?analytics=off` and `?analytics=on`, a preview address (no tag), and the email-link sign-up being counted once.
- Once the ID is set and merged, open GA4 → Reports → Realtime. In a private window, load the Portal's landing page, then the sign-in page, and try a Gmail address. A `page_view` and a `sign_in_error` (`email_not_terpmail`) should show within a minute. The signed-in steps can be checked only with a real Terpmail account, because test accounts send nothing by design.

## 7. Privacy policy paragraph (draft, for the board to approve with the website's)

> The scholarship application site uses Google Analytics only to count how many people start, continue and submit an application, so we can make applying easier. It never sends your name, email address, answers, documents or any ID to Google, and it is not used for advertising. If your browser sends the Global Privacy Control signal, we do not measure your visit.

## 8. Follow-ups

- **(a) Counsel.** Google Analytics is a new vendor on a site used by students, some of them under 18. Security-playbook IN-60 says to talk to counsel before a new vendor touches applicant-facing pages. The Portal sends no applicant data to Google, which keeps the question narrow. The privacy text should still name Google Analytics before launch.
- **(b) Website side of the switch.** The website does not read the Portal's `btx-analytics-off` switch. Board members' own browsing of the website still counts there.
- **(c) A new page.** Add every new Portal page to `ROUTES` in `lib/analytics.ts`. Until then it is reported as `/other`, which is safe but less useful. A page with an ID in its path gets a fixed template path such as `/status/interview/:id`, never the real one.

## 9. Verification record

| Date | Ran by | Property | Result |
| --- | --- | --- | --- |
| 2026-10-19 | Claude (Portal analytics stream) | none (no ID yet); real gtag.js with the made-up ID `G-TEST0PORTAL`, hits answered locally | See the pull request's Security notes |
