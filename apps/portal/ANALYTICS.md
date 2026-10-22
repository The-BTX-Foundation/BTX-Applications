# Portal analytics

How the Scholarship Portal (apply.thebtxfoundation.org) measures the apply funnel, in plain English. It uses the same Google Analytics 4 property as the website, so the board can follow a visit from the website's Apply button to a submitted application.

Property details:

- Account "The BTX Foundation", property 559499446.
- Web stream "BTX website", measurement ID `G-36BN7DJ7DN`.
- Owned by info@thebtxfoundation.org.

The Portal is a subdomain of thebtxfoundation.org. Google's visitor cookie sits on `.thebtxfoundation.org` for both sites, so one visit carries from the website into the Portal with no link decoration.

The code:

- `lib/analytics.ts` holds the rules: which events, which parameters, what a page address looks like once cleaned, and the filter on every hit to Google.
- `lib/analytics-client.ts` decides whether the Google tag loads, loads it, and sends the events.
- `app/Analytics.tsx` puts it on every page.
- The website's side is in the Btx-Website repo, `docs/ANALYTICS.md`.

**The hard rule.** Applicant data is T1: students, some of them minors (security-playbook IN-51). No name, email, phone number, answer, file name, application ID or user ID ever reaches Google, and neither does any page address that carries one. The Portal sends counts and fixed codes only.

## 1. Switching it on

The ID is `GA_ID` at the top of `lib/analytics.ts`: the website's `G-36BN7DJ7DN`.

- **To switch the Portal's analytics off:** set `GA_ID` to `''` in a one-line pull request. It takes effect with the merge.
- **Override:** the Vercel variable `NEXT_PUBLIC_GA_ID` wins over `GA_ID`. The end-to-end tests use it with a made-up ID. Changing it on Vercel is an environment change, so it is separately gated.
- **A badly formed ID counts as no ID.** A typo never loads a broken tag.

The Google tag loads only when all of these hold:

| Check | Why |
| --- | --- |
| The address is exactly `apply.thebtxfoundation.org` | Vercel previews and local runs never send anything. |
| The browser does not send Global Privacy Control | GPC means "do not sell or share". The tag does not load at all. |
| Nobody signed in is staff or a tester | A signed-in account with a staff role (`admin`, `board`) sends nothing. Neither does any account that is not a Terpmail address, since only test addresses on the allow-list can sign in that way. Once that happens, this browser stays off for good. |
| This browser has not been switched off | Open `https://apply.thebtxfoundation.org/?analytics=off` once, in any browser you test with. `?analytics=on` turns it back on. |
| The browser holds no board review pass | Board members test the live Portal through their Rayken Review start link (project `btx-apply`, since 2026-10-22). A browser that holds that pass stays off for good, even before anyone signs in. |

When the tag is off, events still go into the page's own `dataLayer`, and nothing leaves the browser. That is how previews and the tests check them.

Consent Mode defaults: analytics storage granted; ad storage, ad user data and ad personalization denied; ads data redaction on. Google signals and ad personalization are off. The Portal sends its own page views, so Google's automatic one is off.

The Portal never sends `debug_mode`. The property's Developer traffic filter drops any hit that carries it, so production hits must not. Previews send nothing at all, so they need no flag.

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
   - The only exceptions are three campaign tags:
     - `utm_source` must be one of BTX's own values (instagram, newsletter, linkedin, facebook, tiktok, youtube, board, website, email, umd, flyer, qr).
     - `utm_medium` must be one of social, email, referral, print, qr, website or organic.
     - `utm_campaign` must be short lowercase words, numbers and hyphens, with nothing shaped like an ID.
   - `utm_content` and `utm_term` are always dropped, because email tools put per-recipient IDs there. A new source or medium must be added in `lib/analytics.ts`; until then it is dropped.
   - The page title sent is a fixed name from the same list, never the page's own title.
   - The referrer is cut to its origin when it is another site, and cleaned like a page address when it is the Portal.
2. **Our own events are allow-listed.** Only the six events above are accepted. Each takes only the parameters listed, and each value must be one of a fixed list or a whole number in range. A deny-list drops names such as `email`, `name`, `phone`, `answer`, `id`, `application_id`, `user_id`, `file_name`, `url` and `link_url` first, even if a future change passes them.
3. **A filter rebuilds every request to Google before it leaves.** It works no matter what Google's own tag adds. This matters, because the property's stream has every automatic event on (checked 2026-10-19: link clicks, downloads, forms, scroll, video, history page views).
   - **Every hit is rebuilt from a list of known-safe fields:** tag and visitor IDs, consent state, counters, screen size, language and browser brand. To those it adds the three page fields (address, referrer and title, always rewritten) and the event parameters each event's rules allow. Any other field is dropped. That includes hashed email or phone numbers, which Google's "user-provided data collection" would add if someone switched it on.
   - **Only these events may reach Google:** our six, the Portal's own page views, and Google's engagement pings (`user_engagement`, `scroll`, `session_start`, `first_visit`). Every automatic link click, file download, form, site-search and video event is removed. Those would carry link addresses (an interview's video link), file names and form addresses. A page view the Portal did not send itself is removed too, so a screen is never counted twice.
   - **One way out.**
     - Every rebuilt hit goes to google-analytics.com as one request with cookies left off, so a student's Google account cookies never ride along.
     - The tag is always told its hit went, so it never retries the original another way.
     - This covers `fetch`, `sendBeacon`, and the 1×1 image the tag retries with, whether the address is set as a property or an attribute.
     - XMLHttpRequest to Google is never sent.
   - **Nothing else from Google:**
     - The tag's own host serves the tag script (`/gtag/js`) and nothing else.
     - No Google frame or service worker loads.
     - Every google.com host (analytics.google.com included), `.google` and `.goog` hosts, and doubleclick.net get nothing.
   - **Recognized by path, not only by host.** A GA4 hit sent to a server-side or first-party tagging address (`/g/collect`, `/ga/g/c`) is rebuilt the same way. The tag's service-worker frame is blocked wherever it is served from.
   - **A request the filter can't read is dropped.**
4. **Staff and testers send nothing.** See section 1.

## 4. GA4 property settings checklist (Portal additions)

The property-wide settings (retention, filters, Google signals) are set by the website's checklist (Btx-Website `docs/ANALYTICS.md` section 4). Don't change them without Dominick. The Portal adds only these:

- [x] **Key events:** `sign_up`, `application_begin`, `application_submit` (done 2026-10-19). Admin → Events → Create event → **Create with code**. This works before any data exists. Don't use "Create without code". The form pre-selects "Set a default key event value: US Dollar 1"; switch it to **Don't set a default key event value**, since these are counts, not money (fixed afterwards on `sign_up` through its row menu → Set default key event value).
- [x] **Custom dimensions (event-scoped):** done 2026-10-19. "Application step" (`step_name`) and "Application step number" (`step_number`) were added. `code` and `method` already existed from the website, as "Error code" and "Gift method", and GA4 allows one dimension per parameter name, so the Portal's sign-in error codes and sign-up methods appear under those two. Filter by event name (`sign_in_error`, `sign_up`) to see only the Portal's.
- [ ] **Data redaction:** nothing to add. The Portal strips every query parameter except clean campaign tags before a hit is sent (section 3). The stream's existing redaction (email, `review`, `email`) stays as a backstop.
- [ ] **Configure your domains** (optional): the shared cookie already carries the visit across. Listing both domains under the stream's tag settings only marks the referral from the website as internal. It is a stream setting, so it is Dominick's call.
- [ ] **User-provided data collection: keep it off** (Admin → Data collection). The Portal's filter drops those hashed fields anyway; turning it on would only add them to the website's hits.
- [ ] **No server-side tagging, Google tag gateway, first-party mode or `transport_url` on this property without a re-review of the Portal filter.** In those modes Google's tag can send through a hidden frame of its own (see section 8(e)). Run `npm run e2e -w @btx/portal` after any change to the stream's tag settings; it loads the live container.
- Enhanced measurement can stay as the website needs it. The Portal's filter drops Google's automatic link-click, download, form and history page-view events either way.

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
  - It waits until the tag is running before the first click, so Google's own listeners watch the whole funnel.
  - It checks four things. The funnel events reach the collect endpoint. The automatic events and the page view Google sent itself never leave. Every address sent is clean. No marker appears in any request to Google, or anywhere in the `dataLayer` except Google's own page-change records.
  - **Google's page-change records (since 2026-10-22).** On every page change inside the Portal, the tag writes a `gtm.historyChange-v2` entry into the `dataLayer`. It holds copies of the browser's history state, where Next.js keeps the address's query string (`renderedSearch`), so a planted value in the landing address shows up there. The entry stays in the page. The tag only reads it to decide on a history page view, which the hit filter drops. With the tag fully loaded, none of the 16 requests to Google carried any planted value. That's why the test skips only those entries.
  - It also tries every other way out with a raw hit: a beacon, an image set by property and by attribute, a Request object, XMLHttpRequest, two Google frames, hashed email data, an unknown field and a repeated event name.
  - It watches the whole browser context, so requests from frames and service workers count.
  - Planted values are checked plain, URL-decoded, SHA-256-hashed and base64-encoded.
  - Other tests in the file cover GPC (no tag), `?analytics=off` and `?analytics=on`, a preview address (no tag), and the email-link sign-up being counted once.
- After the merge, check from a **real browser**. Google drops headless Playwright traffic as bots: those hits get a 204 but never show in reports.
  - **Realtime:** open GA4 → Reports → Realtime. In a private window, load the Portal's landing page, then the sign-in page, and try a Gmail address. A `page_view` and a `sign_in_error` (`email_not_terpmail`) should show within a minute.
  - **DebugView:** use Google Tag Assistant (tagassistant.google.com). It turns debug mode on for that one browser, and the Developer traffic filter keeps those hits out of reports.
  - **Signed-in steps:** these can be checked only with a real Terpmail account, because test accounts send nothing by design.

## 7. Privacy policy paragraph (draft, for the board to approve with the website's)

> The scholarship application site uses Google Analytics only to count how many people start, continue and submit an application, so we can make applying easier. It never sends your name, email address, answers, documents or any ID to Google, and it is not used for advertising. If your browser sends the Global Privacy Control signal, we do not measure your visit.

## 8. Follow-ups

- **(a) Counsel.** Google Analytics is a new vendor on a site used by students, some of them under 18. Security-playbook IN-60 says to talk to counsel before a new vendor touches applicant-facing pages. The Portal sends no applicant data to Google, which keeps the question narrow. The privacy text should still name Google Analytics before launch.
- **(b) Website side of the switch.** The website does not read the Portal's `btx-analytics-off` switch. Board members' own browsing of the website still counts there.
- **(c) A new page.** Add every new Portal page to `ROUTES` in `lib/analytics.ts`. Until then it is reported as `/other`, which is safe but less useful. A page with an ID in its path gets a fixed template path such as `/status/interview/:id`, never the real one.
- **(d) A full Content-Security-Policy.** The filter runs inside the page; a browser-enforced backstop limits where scripts, images, frames and connections may go, including channels the tag doesn't use today but the filter doesn't cover (the `srcset` property, `<link rel=preload>`, markup set through `innerHTML`, `setAttributeNS`). A Report-Only trial of that policy is running (`CSP.md`); enforcing it is the next step once the trial's reports are clean.
- **(e) Residual risk, accepted.** The filter covers every way gtag.js sends with this property's settings (adversarial review, 2026-10-19).
  - **The dormant path.** gtag.js already contains a service-worker transport. It builds a blank frame and creates the Google frame inside it, in that frame's own copy of the browser objects, where a page-level filter can't see it. It then sends the raw hit and the full page address from there.
  - **When it would switch on.** Only when server-side tagging, the tag gateway or a `transport_url` is configured. That is why section 4 puts those settings behind a re-review.
  - **Other bypasses.** A fresh browser realm, or a transport Google adds in a later tag version. The e2e test loads the live container on every run. **The stronger alternative is to load no Google script on the Portal at all.** The Portal would send its six events to its own server, which forwards them to the GA4 Measurement Protocol; the `_ga` visitor cookie can be read there because the Portal is a subdomain. That is a bigger change, worth it only if the board wants zero third-party script on pages that show applicant data.

## 9. Verification record

| Date | Ran by | Property | Result |
| --- | --- | --- | --- |
| 2026-10-19 | Claude (Portal analytics stream) | G-36BN7DJ7DN's real container, every hit answered locally (nothing reached the property) | Unit 19/19, e2e analytics 5/5 (dev server and production build), full Portal e2e suite. An adversarial review found two high issues (fallback transports, unknown fields), both fixed and tested. Mutation runs, with each wall switched off in turn, all failed the test as they should. |
