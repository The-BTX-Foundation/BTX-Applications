# Design DNA: Ops Hub (the staff app)

> The working tool of the BTX Foundation's board: what needs me today, what is coming, what the money and the cycle are doing.
> Eight volunteers on phones and laptops, between other jobs. It should feel as if a careful product team shipped it:
> flat, exact, quiet, fast. Hierarchy comes from type, spacing and hairlines, never from decoration around content.

**Audience:** Full accessibility level. This is an app for board members and admins only, held to Full on purpose. The Today pilot passed axe at the
full level with 0 findings, so every page does (labels, focus, contrast, keyboard). The design check reads the first word after "Audience:": it treats
"Internal" as the lighter level, so keep "Full" first. "Full" runs the strict axe set.

**Direction:** "Clean cut", signed off by Dominick on 2026-11-11 after the Today pilot ("approved"). Flat white cards with 1px hairlines on a
wash ground, one corner system, bare line icons, restrained gold. Reference: Apple's own apps (Reminders, Calendar, Settings).

## Where it lives

- **Design archive (not in this repo):** BTX Foundation workspace, `apps/design/ops-refresh/`: the clickable demo (`directions/p-*/index.html`, 24 pages
  with every state), `OPS-DNA.md` (the design-side rules and history), `SPEC-TODAY-BUILD.md` (the pilot's builder brief).
- **Figma (same look, 137 frames):** https://www.figma.com/design/VclK7S6BTkK3WYcz8wZXMi ("BTX Ops Hub refresh"). Demo and Figma disagree = the demo wins, then fix Figma.
- **Pilot page in code:** Today. `app/(shell)/(today)/`, `components/today/`, `lib/today-*.ts`, `mock/today-view.ts`. Copy its patterns.
- **Shell:** `components/shell.tsx` and the shell blocks of `app/ops.css` (sidebar, phone top bar, bottom tabs, phone menu, account card).

## Fixed

- **Palette (the only colors):** bg `#f4f5f2`, surface `#fff`, ink `#15171a`, muted `#545a60`, line `#c9cec8`, line-soft `#e1e4df`, wash `#eceeea`,
  gold `#c99b31`, gold-tint `#f6eeda`, gold-ink `#7a5b12`, gold border `#e0cf9f`. Tokens live in `packages/ui/src/tokens.css`. No other hues.
- **Fonts:** Google Sans Flex (text) and Google Sans Code (small capital labels, dates). Page titles weight 400, row titles 500, names and money that anchor a row 600.
- **Type scale (px):** phone body 16-17, rows 17, labels 15, headline 28; laptop body 15-16, rows 17, headline 34, H2 20. Small text never below 14.
- **Ground and cards:** the page ground is `--wash`; content sits in flat white cards with a 1px `--line` border. Section headings (20px, weight 500, no icon) sit on the
  ground above their card, with the section's link in gold-ink at the right.
- **Corners:** one system. Surfaces 4px, every control and tag 2px, phone bottom sheets 8px on top. No pills. Round only for checkboxes, people's initial circles,
  count badges and the dashed prototype chip.
- **Depth:** none. No shadows, no gradients, no glass, no colored panels.
- **Icons:** bare 22px line icons in a 24px column (text starts 36px in), `--muted`, or gold-ink when the row is the viewer's. Never a filled or rounded container behind an icon or step number.
- **Gold:** one solid gold primary per screen. Gold-tint fill (1px `#e0cf9f` border + 3px gold left edge) only for the one card or row per page that needs the viewer. A selected or open row is `--wash` with the gold edge.
- **Chips:** outlined (1px `--line-soft`, 2px, no fill), only for a status someone acts on. Waiting line = clock icon + gold-ink text + a small outlined 2px button, never a tinted strip.
- **Date and score blocks:** white with a hairline, ink numbers, gold-ink small labels. Today's date block may be ink.
- **Shell:** the current sidebar (laptop) and top bar + five bottom tabs (phone). Phone first: design 390x844, then 375x667, 1024, 1280, 1440, 1720. No sideways scroll; names and codes never break; 44px targets on phone, 40px controls on laptop.

## How pages behave

1. **Short title, then the news as one tappable card.** H1 is the page's name with the date, year picker or cycle beside it. At most one news card under it (kicker, the thing's name, a verb that opens it); gold-tint only when it needs the viewer. Filters are pickers (one select per dimension), never rows of chips.
2. **One gold primary per screen**, where the work is; secondaries are quiet gold-ink text actions in the same place on every row.
3. **Work in place.** Add, edit and expand in place; sheets only on phone for a focused task. Every action shows the moment after ("Saved 9:14 AM · Undo").
4. **Undo over confirm** for safe actions; a clear confirm only for money, sending to outsiders, or deleting.
5. **Plain-word time:** "1 day late", "Tomorrow", "Thu", "next Wed"; exact date on hover or long-press.
6. **Draw the data:** progress as slim bars or squares, scores as marks, dates on a line; a sentence only when nothing can be drawn. Each fact once on a screen.
7. **Nudges:** when something waits on a person, offer a one-tap nudge (drafted message, sent in place).
8. **Phone gestures** (swipe for done and snooze) always have a visible hint and a tap or keyboard alternative.
9. **States are designed:** empty (one line + the action that fills it), loading (a skeleton shaped like the page), load error (the app's error line + Try again), stress (longest real names, 99+ counts).
10. **Feels fast:** pressed state within 0.1 s, motion 150-250 ms on state changes only, `prefers-reduced-motion` honored, nothing jumps.

## Building a page in the real app (learned in the Today pilot, 2026-11-11)

The order, every page: (1) read the demo page and its states; (2) write the data contract; (3) mock fixtures in the same shape; (4) the UI against the mock; (5) the live loader and its pure mapping, with tests; (6) the checks below; (7) an independent review.

- **One contract per page.** A types-only file `lib/<page>-view.ts` (no logic) is the line between the page and its data. Mock mode (no Supabase env) returns fixtures from `mock/<page>-view.ts`; live mode returns the same shape from `lib/<page>-live.ts`, which does the reads and calls pure mapping functions in `lib/<page>-map.ts` (unit-tested with sample rows). A loader `lib/<page>-view-loader.ts` picks. Dates travel as ISO strings.
- **Capabilities, not dead controls.** The contract carries `caps` flags. A control is drawn only when a real write exists behind it; in live mode the flag is true only where that write exists, with the condition named in a comment. Mock mode may turn everything on.
- **Approvals are special.** A budget approval is approved only on `/finance/budget/approval`. No other screen may set an approval task to done, snooze it, or tick it. Live caps keep `approveInPlace` false.
- **Student names and chat.** Student names are read by admins and board members only (the staff gate plus RLS). Board chat cards read area channels only, never direct messages, and a reply goes to the channel the message came from.
- **Time.** Counted from a server-provided Eastern `today`, in pure functions with tests for every weekday and month/year edges. Groups are calendar weeks (Mon to Sun): This week = through Sunday, Next week = next Mon to Sun, Later after. Never call `new Date()` while rendering.
- **Writes.** Optimistic, with rollback and the fixed error line "Couldn't save. Try again." Serialize writes per record id. Require exactly one row back (`.select('id')`): under RLS an update that matches no row returns no error. Every live call has a timeout (`AbortSignal.timeout(15000)`). Undo = the write happens at tap time and Undo writes the reverse. After a live write, `router.refresh()` inside a transition; re-seed state from server data only when no write is running and no refresh is pending.
- **Scoped styles.** A page's CSS lives in its own file, classes prefixed per page and scoped under a wrapper class; the page ground is set with `.o-page:has(> .wrapper)`. Never edit another page's CSS. Shell styles only in the shell blocks of `app/ops.css`.
- **Loading.** Each page gets its own `loading.tsx` through its own route group (for Today: `app/(shell)/(today)/`). A `loading.tsx` at `(shell)` level would cover every page. The skeleton is shaped like the page and has a screen-reader-only h1.
- **States in mock mode:** `?demo=stress`, `?demo=empty`, `?demo=error` (the panel's own load error), `?demo=failed` (the whole page), `?demo=loading` (the skeleton).
- **Accessibility.** An element's accessible name must contain its visible text (axe `label-content-name-mismatch`): put the name in real text, hide repeats such as initials with `aria-hidden`. One `<main>`. Anything reachable only by swipe also has a keyboard and screen-reader path (a visually hidden button that appears on focus). Focus moves to a sensible place after Done, Undo and Add. Announce changes in a polite live region.

## Write rules learned in batch 1 (Tasks, Calendar, Goals, Chat; 2026-11-12)

Four independent reviews found the same classes of bug on every data page. Build them out before the review, not after.

- **A write that may have committed must be safe to repeat.** A request that times out can still have saved. Make the row id in the browser (`crypto.randomUUID()`, with a `getRandomValues` fallback) and insert it as `id`; a retry of the SAME failed action reuses that id and a duplicate-key error (`23505`) counts as success. A NEW deliberate action always gets a new id, and a remembered id is forgotten on success, on expiry (2 minutes) or when a refresh shows the row. Keep that logic in a pure, unit-tested helper in the page's own `lib/`.
- **The writer refuses what the screen refuses.** Row-level security lets any board member update any row, so a rule that lives only in the buttons is not a rule. Approvals: every status or due-date write filters `.neq('type','approval')`, so a refused write matches zero rows and reports as a failed save. Send only the fields you mean to change (a status change sends `{status}` alone; the database trigger stamps `completed_at` from the server clock, never the browser's).
- **A failed read is never a zero.** A figure, count or list whose read failed shows "Couldn't count" or the page's load-error card, never "$0 raised", "0 of 0" or "No messages here yet". Core reads fail the whole page; optional reads mark only their own piece.
- **Page every growing read.** PostgREST silently stops at 1,000 rows. Page with `.range()` ordered by a unique key, advance the offset by the rows actually returned, stop only on an empty page, and throw (a load error, never partial data) past a sane ceiling. Chunk `in(...)` id lists at 100.
- **A failed send keeps the person's words, in a place that cannot be lost.** Never put failed text back into a box the person may already be typing in. Keep it as its own visible "Not sent" row with Retry and Remove, in a store keyed by the signed-in user's id (module-level state survives sign-out, because sign-out is a soft navigation). Drafts are per channel or view, and also keyed by user.
- **Read marks cover only what was shown.** Stamp "read" from server messages the person could see (never the browser clock, never a pending message, capped at the server's `now` plus a few minutes), never backwards, and skip a channel with an unread message that is hidden by a cap.
- **One announcement per result.** One polite live region says "Sending…", "Sent", "Saved"; a failure is announced once (clear then set, or key the alert). A message list or a news card is not a live region. After Undo, a failure or a closed sheet, focus goes to the next sensible control, never the page body; a refused write never moves focus out of a box the person is typing in.
- **Refresh and re-seed gates.** Run the "a hidden row comes back" step after every settled refresh, still only when no write is running and no refresh is pending; a late refusal (carries a sequence number) changes nothing on screen.
- **Global class collisions.** Shared packages define bare classes (`.rf { margin-top:auto }`, `.ch`): the shared layer resets the first (`.o-page > .rf { margin-top: 0 }`); a page whose prefix collides adds its own wrapper class (Chat uses `rf ch-pg`). Check a new prefix against `packages/ui/src/components.css` before using it.
- **Design check reads the first word after "Audience:".** "Internal" is read as the lighter accessibility level; keep "Full" first (see the Audience line above).
- **Mock-only demo flags** may exist to make an otherwise unseeable state visible (`?demo=failsend`, `?demo=capped`, `?demo=uncounted`). They switch themselves off in live mode and have a test.

## Write rules learned in the full build (every remaining page; 2026-11-12)

Eighteen more pages were built and each got an independent review. The same few mistakes came back, so build these in from the first line.

- **A confirm button must survive a held key.** Opening a confirm moves focus into it, and a held Enter repeats keydown and clicks whatever has focus: a held key released decisions (Selection), published a score (Scoring) and could have emailed every applicant (Interviews). Every confirm for something costly, irreversible or outside-facing uses one pattern: the go button is armed about 400 ms after the confirm opens, ignores `e.repeat`, acts on keyup only after a keydown that began on that button; focus goes to the confirm's own text (`tabIndex={-1}`, linked to the button with `aria-describedby`), not onto the go button. Pure helper per page (`lib/*-arm.ts`), unit tested, plus a markup test that the button renders unarmed.
- **After an unconfirmed outcome, the server is the baseline.** A failed, partial or timed-out write may have committed. Re-read first; keep the control locked until a refreshed view has landed (a gate cleared when the view prop changes), then say plainly what the server holds. Undo goes back to the re-read state, never to a screen the server no longer matches; "Nothing to send" shows only when the draft equals the re-read state; if the screen still differs, say so ("Your saved times differ from what's shown.").
- **Show the server's words.** A success line is built from the server's answer, never over it. If an action can answer ok with a partial failure ("Saved 1 link. 2 emails didn't go"), classify the message in a pure tested function and draw the tick only when no failure part is present. A timeout on anything that sends or creates meetings says "No answer in time. Reload to check. Some emails or meetings may already have gone out."
- **Lock the whole page while one write runs.** Disable every write control (use `aria-disabled` so focus is not dropped), not only the one pressed; a late answer for a locked or published thing changes nothing and announces nothing. Without this, edits made during "Sending…" are silently lost, and a pick changed during a publish can leave the screen showing values the database never stored.
- **A preview is not a promise.** Server actions that recompute their plan when confirmed can act on a different set than the one shown. Re-run the read-only preview on confirm, compare, and refuse with "Things changed. Check this list again." when it differs; show the preview's own words, never a mix of a fresh count and a stale list.
- **Say what a count counts.** Row-level security can hide rows from the signed-in person (staff see only submitted applications), so a count of "started" things may really be "submitted". Name the rule in the words ("submitted applications") or use a function that sees all rows. Decide gates (Unpublish) so they fail closed when the count fails.
- **Do not send what the person cannot use.** The role comes from the server and decides what is drawn AND what goes into the page payload: another interviewer's join link, an unpublished score, a release control for a board member never reach the browser. A hidden button is not a guard; the server action checks the role again.
- **Cancel with care.** A queued write cancelled by an earlier failure must keep the person's words (the "Not saved" store) or say "Not done"; never drop it silently. A row that is still "Saving…" under a placeholder id has its controls disabled. Keys for stores are module-level counters or uuids, never per-mount counters. Editors are keyed by the record's identity, never an array index. Clear every pending timer when a sheet opens, closes or unmounts.
- **Optimistic lock on shared settings.** Two admins editing different fields can each pass a cross-field rule. Filter the update on the row's `updated_at` as well as id and status; zero rows back says "This cycle changed while you were editing. Reload and try again.", never "not an admin". Compare "is it already this value" before "was it changed since", so a repeat of a save that landed late is a success.
- **Browser-run server actions are one queue.** Next 16.4 runs Server Actions and `router.refresh()` through a single queue in the browser (`app-call-server.js`, `app-router-instance.js`; `concurrentRouterQueue` is not set in `next.config`), so a refresh always reads data that includes earlier writes. These rules lean on that: if `concurrentRouterQueue` is ever enabled, per-write sequence numbers only guard what the screen shows, not the order on the server.
- **Tests must fail without the fix.** Test pure write-decision functions, the live writers (success, refusal, timeout that is never success, thrown error), and a markup or reducer level check of the wiring. A test that redraws the answer inside itself, or covers a path the board cannot reach, proves nothing: delete it.
- **Own data in memory is allowed, scores you may not see are not.** A per-user, in-memory store of the person's OWN failed draft or unsaved note (Scoring, Questions, People) survives navigation, is keyed by user id, clears when a different person signs in, and never goes into a URL or browser storage. Nothing the person may not see goes in any module-level variable.
- **After a page is rebuilt, delete what it replaced.** Run the import-graph scan (modules under `components/`, `lib/`, `mock/` that nothing reachable imports) and delete confirmed orphans with their tests. Old loaders that honour `?demo=error` live are a hole until they are gone.

## Checks before a page counts as done

1. `npm run typecheck:ops`, `npm run lint:ops` (0 errors), `npm run test:ops` from the repo root.
2. **Parity with the demo:** screenshot the page and its demo page in every state at 390x844 and 1440x900; the "real" difference (pixels no neighbor within 1px explains) stays under 1% and page heights match within 1px. A known data difference is named, not hidden.
3. **Design check** (`~/.claude/skills/design-dna/scripts/design-check.mjs`, run with `--repo`, `--base origin/master`, `--base-url`, `--paths`): PASSED, including axe 0.
4. No console errors or hydration warnings; no sideways scroll at 375, 1024 and 1280.
5. **An independent code review** (a reviewer that did not write it) for any page that reads or writes data. The pilot's reviews found real bugs each time: the approval bypass, a DM leaking into a board card, write races, a skeleton leaking to all pages, silent no-op updates, and a 1,000-row read cap.
6. The pull request body carries a "Security notes" block for any change to data access, writes or chat.

## Never → Instead (project-specific)

| Never | Instead |
|---|---|
| Soft shadows, glass, gradients, tinted pill strips | Hairlines and white-on-wash; a plain gold-ink line with a small outlined button |
| Filled or rounded tiles behind icons or step numbers | A bare 22px line icon in a 24px column |
| Pills and 10-14px radii | 4px surfaces, 2px controls |
| A long sentence headline that leads nowhere | A short title and one tappable news card |
| A row of filter chips, one per value | One picker per dimension |
| A control with no real write behind it | Hide it (`caps` false); log it on the backlog |
| Mock-only behaviour reachable in live mode (fake times, in-memory sends) | Gate by `caps`; fixtures only in mock mode |
| A `loading.tsx` at `(shell)` level | One per page, in its own route group |
| `aria-label` that omits the visible text | Real text as the name; `aria-hidden` on duplicates |

## Deviations log

- 2026-11-11: the old page ground `--bg` is replaced by `--wash` on refreshed pages. Pages not yet refreshed keep the old look inside the new shell until their turn.
- 2026-11-11: the shared initials badge `.o-av` is now a hairline gold-tint square app-wide (the demo's avatar), so it changed on pages not yet refreshed.
- 2026-11-12: Chat draws three things the signed-off demo has no frame for, all needed by real failures: the "Not sent" row (neutral 2px rule, words, one red error line as text only, a gold Retry and a muted Remove), the "Older messages aren't shown here." hairline at the top of a capped thread, and a one-line note under search results when a channel was capped. Tasks adds a gold "Review" link in place of the check on an approval in live mode. Goals adds a "Couldn't count" state on a goal whose read failed. Calendar's Month/Agenda toggle is UI only (owner decision O5 keeps Week and List hidden).
- 2026-11-12: laptop parity on every refreshed page keeps 0.6 to 0.8% difference from the demo because the shell's sidebar counts are live app data (for example Finance 2, demo 1); page content matches. Phone heights are within 1px.
- 2026-11-12 (full build): every page of the Ops Hub is now on the refreshed layer. What the pages draw or do differently from their signed-off demo frames, each reported by its builder and kept on purpose:
  - **Live-only extra steps.** Scoring asks before Publish and Questions asks "Remove for good?" (nothing can bring either back); Selection and Interviews arm their confirm buttons; Cycle settings asks before Undo of a money or date on a published cycle. Mock mode keeps the demo's one-tap flow, except where the demo itself had a confirm.
  - **Wrapping instead of nowrap.** Long names and titles wrap (`overflow-wrap:anywhere; min-width:0`) where the demo kept one line: Grants, Awardees, Cycle (owner names), Availability and Selection (stress states), Interviews (link-form name).
  - **Words that say less than the demo.** Sponsorships "Log it once, here." replaces "Nobody logs it twice."; Newsletter live reads "Goes out <date>, sent outside the Ops Hub" and "Planned for <date>, passed"; Instagram live reads "Marked as waiting for approval"; Awardees live reads "$2,500 marked sent today, 9:02 AM, logged on Budget" and "This records a payment you already made. It does not send money."; Applicants "Opening in a new tab"; Availability timeout "No answer in time. Your times are kept here while the page checks what was saved."
  - **Hidden live (no real write, or it would send):** Undo after removals and starter questions, Remind students, Share the schedule, Nudge everywhere except a real DM path, Send agenda, "Who calls the winners" (constant), Newsletter send, Fundraising/Grants/Budget money writes (owner decision), "See who", the Draft chip, booked-interview overlays on Availability, "Publish undone" (a published score is locked).
  - **Added because a real failure needed it:** "Not saved" rows (Questions, People, Scoring), "Not done" and "Cut to 500 characters" lines, an earlier-cycle block with Copy and Remove, "Two main awards are recorded" warning, a no-cycle state on Interviews, a Make Teams links path restoring what the old sheet could do, `?demo=` states `longnames`, `confirm`, `failsend`, `longname`.
  - **Behaviour changes found by review:** Cycle open/closed now comes from the cycle's dates (B14); live Cycle shows only real tasks in its Award group and promotes the next stage to Now even without a date; Unpublish is refused from the opening instant on; Interviews shows Join only on your own interviews (admins on all) and strips other people's links from the page payload; Selection blocks Release while two main awards exist; Scoring reads only the current cycle's interview questions.
  - **Unpaged reads kept on purpose:** the Interviews loader still uses `lib/interviews.ts` (about 20 applicants); every new loader pages its own reads.
  - **Parity:** the laptop residue of 0.6 to 1.3% on every page is the shell sidebar's live badges; Certifications empty state (6.6% phone) draws an ideas panel the demo does not; stress states without a demo frame compare against the normal frame.

## Shared layer (extracted from Today, 2026-11-11)

Every refreshed page reuses this instead of copying Today. Code: `apps/ops/components/refresh/` (CSS + React) and `apps/ops/lib/refresh-time.ts`.

**Wrapper and page CSS**
- Wrap the page in `<div className="rf <prefix>">` (Today: `rf td`); the loading skeleton uses the same wrapper. Import `@/components/refresh/refresh.css` before the page's own CSS.
- `refresh.css` holds the tokens (on `.rf`), the base, the page ground (`.o-page:has(> .rf)`), the full-width column (`.o-col:has(> .o-page > .rf)`) and every `rf-` class; phone below 760px, mid laptops 760 to 1359, laptop from 1360.
- A page adds only what no other page has, in `components/<page>/<page>.css`, every class `<prefix>-` and every rule under `.<prefix>` (`.td .td-ticket`). To adjust a shared piece in one place, scope it by the page's own class (`.td .td-iv .rf-pcard`), never edit the `rf-` rule for one page. Never redefine tokens per page.

**React primitives** (`components/refresh/`)
- `PageHeader`: the title with the date beside it, optional content under the title, the search look on laptops; `loading` draws its skeleton.
- `NewsCard` (`.rf-nx`): one "what happened / what's next" card; a link with `href`, a button with `onClick`, a plain block with neither; `gold` for the one item that needs the person.
- `Panel`: section heading on the ground (h2 + optional link) over a flat card (`.rf-pcard`); `className` adds the page's prefixed class.
- `Tabs`: text tabs with counts and the sliding gold line; ARIA tabs with roving focus and Left/Right arrows. The page draws its panels with ids `<idBase>-p-<id>`.
- `StateLine`: `kind="empty"` is the one muted line (`.rf-none`); `kind="error"` is the alert line with Try again (`.rf-load-err`), holding the section's skeleton while the retry runs.
- `Sk`, `SkPanelHead`, `SkTabs`, `SkRows`: skeleton blocks shaped like the page; the page skeleton adds one sr-only h1 and a "Loading <page>" status.
- `Fold` (height open/close, `appear` grows a new item in), `Nw` (names, dates and amounts never break), `foldMs()` / `useFoldMs()` / `prefersReducedMotion()` (0 ms with reduced motion), `isPhone()`.
- `Icon`: every symbol the demo sprites define, named as the demo names them (`cal`, `chev`, `snooze` ...); 20px unless a rule sizes it.

**CSS-only vocabulary** (`rf-` classes, no component needed)
- Row grammar: `.rf-item > .rf-row` with icon cell `.rf-kt` (`.rf-k-tint` / `.rf-k-gold` for gold-ink icons), `.rf-main` holding eyebrow `.rf-eb` (with `.rf-due`, `.rf-kw`), title `.rf-t` and meta `.rf-meta`, then the trailing control (`.rf-check`, round, `aria-pressed`). Hairlines between items start at the text; `.rf-done`, `.rf-open`, `.rf-flash`, `.rf-pop` are its states. `.rf-sub-in` is a panel opening under a row, indented to the title.
- Group headings `.rf-grp` (`.rf-g-late`, count `.rf-gn`); late tag `.rf-late`; chip `.rf-chip`; picker `.rf-pick`; parsed chip `.rf-pchip` in `.rf-chips`; filter or select chip `.rf-fchip` (a `<select>` laid over it), labelled select `.rf-sel`.
- Buttons: `.rf-btn` (quiet outlined) and `.rf-btn-gold` (the one primary per view); gold-ink text link `.rf-lnk` (44px hit area; gold-ink inside panel headings and row meta).
- Avatar `.rf-avatar` (`.rf-round` for people in chat); waiting line `.rf-waitbar` with `.rf-wt`; date block `.rf-stub` (weekday, large day, month); done tick `.rf-tick`; slim bar `.rf-bar` (spans, `.rf-on` filled) and squares mark `.rf-sq`; empty block `.rf-empty` for a whole list; `.rf-saveerr` for "Couldn't save. Try again."; `.rf-sr` for screen-reader-only text.

**Time words** (`lib/refresh-time.ts`): `rel`, `dueTitle`, `groupOf` (calendar weeks Mon to Sun), `shortDate`, `fullDate`, `weekday`, `snoozeDays`, `daysFrom`, `addDays`, `easternDay`, `clock`. Page-specific words stay in `lib/<page>-time.ts`.
