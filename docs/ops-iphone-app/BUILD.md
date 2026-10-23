# BTX Ops Hub iPhone app: build spec

Approved by Dominick on 2026-10-22. That covers the plan (claude.ai/artifact/U1RGkv5WbckfNcvZaSAmuY) with its three choices:

- the push alert list
- iPhone only
- a review account that sees sample data only

He also signed off the Figma frames. This file is the single source for the build. Follow it in order. Don't re-decide anything written here; if something can't be done as written, stop and report.

Worktree: `~/btx-applications-wt/ops-iphone`, branch `feat/ops-iphone-app` (from master e72026b). Ship as **three PRs**, in order (A, B, C), each through the deploy-playbook. Run `lint:ops`, `typecheck:ops`, `test:ops` and `build:ops`, plus the Portal's checks when the Portal changes. Then PR, preview, and `gh pr merge` after Dominick's go. Merges deploy on their own: both Vercel projects in team btx-aps are Git-linked.

## Design source (signed off; build to these frames)

Figma file `byg3AToqjCajJKPI88DkOz` ("BTX Apps"), page "Ops Hub (staff)", section **465:11710** "iPhone app: new screens for sign-off". Pull each frame with `get_design_context` and `get_screenshot`; never work from this text alone.

| Frame | Node | Used in |
|---|---|---|
| App lock (Face ID), phone | 465:11712 | PR A (native lock cover) |
| Offline, phone | 465:11727 | PR A (`offline.html`) |
| Menu with the Notifications row, phone | 466:11789 | PR B (phone drawer row) |
| Notifications row: the three states | 466:12043 | PR B |
| Push notifications (exact wording) | 465:11750 | PR B (copy) |
| Components: Push notification 465:11741, Switch 466:11788 | | PR B |

Tokens: `apps/ops/app/ops.css` and `docs/DESIGN-DNA.md`. Fonts: Google Sans Flex. Colors: bg #f4f5f2, ink #15171a, muted #545a60, gold #c99b31, gold-tint #f6eeda, wash #eceeea, line #c9cec8.

## Rules that apply to every PR

- **Pushes are two rows: a title and one short line.** Applicants appear as `Applicant 15`: the number after the last dash of the applicant code, leading zeros dropped. Never a name, an email or the full code. Board chat pushes never include the message text. (Dominick, 2026-10-22.)
- **Cost $0.** No paid services. APNs is called directly over Node `http2`.
- **Secrets:** the Apple push key (.p8) is created and pasted by Dominick (gated). Code must run with the key missing: the transport falls back to logging, as the Driver Portal's does.
- **Database change:** the push tables are a production migration on Supabase `awiaebtqalcmfafvktwh` ("BTX Student/Operations Hub"). Write the migration file in PR B and test it locally. Apply it to production only after Dominick replies naming BTX Student/Operations Hub. Apply the file verbatim, then fingerprint-check it (deploy-playbook footgun).
- **Security:** PR B and PR C get an `opus` code-reviewer pass (security-playbook triggers: new tables, a new endpoint, a new sign-in path).
- **Commits** end with the session's Co-Authored-By line. **Pushes** go out as btx-foundation automatically through the repo's git helper. Use plain `gh` for PRs.

## PR A: the app shell (no web changes)

Copy Prism's working shell and adapt it. Prism's source is only in the worktree `~/PrismWealth/.claude/worktrees/next-security/mobile/`, branch fix/next-security-2026-10-22. Read it there; do not modify Prism.

Create `apps/ops/mobile/`. This is **not** a workspace package: keep it out of the root `workspaces` so npm installs and Vercel builds ignore it.

- **package.json:** `@capacitor/core` 8.5.2, `@capacitor/ios` 8.5.2, `@capacitor/push-notifications` 8.1.2 (dev: `@capacitor/cli` 8.5.2), pinned exactly. No scripts block.
- **capacitor.config.ts:**
  - appId `org.thebtxfoundation.opshub`, appName `BTX Ops Hub`, webDir `native-shell`
  - `server.url` `https://ops.thebtxfoundation.org`, `server.errorPath` `offline.html`, `cleartext` false
  - `server.allowNavigation` `['demo-ops.thebtxfoundation.org']` (for PR C)
  - `ios.contentInset` `'automatic'` (the Ops Hub has no safe-area CSS, so with `'never'` its header sits under the status bar and the tab bar under the home indicator; found in the PR B simulator run), `ios.backgroundColor` `#f4f5f2ff`
  - `plugins.PushNotifications.presentationOptions` `['badge','sound','alert']`
- **iOS project** (`npx cap add ios`; Capacitor 8 uses SPM, so there is no .xcworkspace and builds use `-project ios/App/App.xcodeproj`):
  - DEVELOPMENT_TEAM `6H2R38WKP3` (Yachtsy, LLC)
  - PRODUCT_BUNDLE_IDENTIFIER `org.thebtxfoundation.opshub`
  - MARKETING_VERSION 1.0, CURRENT_PROJECT_VERSION 1
  - TARGETED_DEVICE_FAMILY `1` (iPhone only), IPHONEOS_DEPLOYMENT_TARGET 15.0
  - Display name "BTX Ops Hub" (`CFBundleDisplayName`); it fits under the home-screen icon. Check that it isn't cut off.
- **Push entitlements per build configuration** (Driver Portal trap: Xcode does NOT swap them at archive time):
  - `AppDebug.entitlements` with `aps-environment` = `development`, wired to Debug
  - `AppRelease.entitlements` with `aps-environment` = `production`, wired to Release
  - Verify the pbxproj `CODE_SIGN_ENTITLEMENTS` per configuration.
- **AppDelegate.swift:**
  - Forward APNs registration to Capacitor (`didRegisterForRemoteNotificationsWithDeviceToken` posts `.capacitorDidRegisterForRemoteNotifications`; the failure callback posts `.capacitorDidFailToRegisterForRemoteNotifications`). See the Driver Portal's `~/Yachtsy/DriverPortal/ios/App/App/AppDelegate.swift` lines 43-53. Without it the token listener never fires.
  - Call `PrivacyLock.shared.start()`.
- **PrivacyLock.swift**, adapted from Prism:
  - same grace period (60 s) and cold-launch lock
  - covers the window on `willResignActive` so the app-switcher snapshot is opaque
  - `.deviceOwnerAuthentication` with reason "Unlock BTX Ops Hub"
  - The cover view must match **Figma 465:11712**: bg #f4f5f2; the BTX logo centered (use the PNG/PDF logo from `apps/ops/public`, never the website's); a 64 px gold-tint circle with the lock mark; title "BTX Ops Hub is locked" (26 Medium, ink); line "It locks when you've been away, so applicant details stay private." (16 Regular, muted, centered, 300 wide); a full-width gold button "Unlock with Face ID" (48 tall, on-gold text) above the home indicator, which re-runs the authentication.
- **`native-shell/offline.html`**, matching **Figma 465:11727**: logo at the top; a wash circle with the offline mark; "You're offline"; "The Ops Hub needs a connection. Check Wi-Fi or mobile data, then try again."; a gold "Try again" button that loads `https://ops.thebtxfoundation.org`. Inline CSS only, with the fonts as system fallback: the page must render with no network.
- **App icon:** the BTX mark on #f4f5f2, 1024 px source plus the generated set. Use `apps/ops/public` assets. If no square mark exists there, crop the logo's "BTX" mark and note it in the PR.
- **`apps/ops/mobile/README.md`:** install, `npx cap sync ios` (needed in a fresh checkout because public/ and config files are generated), the simulator build and run commands, and the archive steps for TestFlight. **Uploads need Dominick**: the safety check blocks `xcodebuild archive` and uploads, so hand him the exact archive command and the Xcode Organizer steps, or use the App Store Connect key once the Platform session has it.
- **Root `.gitignore`:** ignore `apps/ops/mobile/node_modules`, `ios/App/App/public`, `ios/App/App/capacitor.config.json`, `ios/App/App/config.xml`, `DerivedData`.
- **Verify:**
  - Build for the iOS Simulator (iPhone 17).
  - Launch the app, sign-in page visible: screenshot.
  - Background for 61 s or more, then foreground: the lock cover shows. Screenshot it next to the Figma frame.
  - Airplane-mode equivalent (point server.url at an unreachable host in a scratch copy): the offline page shows. Screenshot it next to Figma.
  - Attach the screenshots to the PR as a parity sheet.

## PR B: push notifications

### Database (migration file; apply only after Dominick's named go)

New file `supabase/migrations/<timestamp>_ops_push.sql`:

- **`public.ops_push_devices`:**
  - columns: `id uuid pk default gen_random_uuid()`, `user_id uuid not null references auth.users(id) on delete cascade`, `kind text not null check (kind in ('apns'))`, `token text not null`, `label text`, `created_at timestamptz default now()`, `last_seen_at timestamptz default now()`, `disabled_at timestamptz`, `last_error text`
  - `unique (user_id, token)`
  - RLS on: staff may SELECT their own rows (`user_id = (select auth.uid())`). No insert, update or delete policies: the server writes with the service role.
  - Revoke all from anon.
  - Index on `user_id`.
- **`public.ops_push_log`:**
  - columns: `id bigserial pk`, `user_id uuid`, `key text not null`, `title text`, `sent_at timestamptz default now()`, `result text`
  - `unique (user_id, key)` for idempotency, like `email_log`
  - RLS on, with no policies (service role only). Revoke all from anon and authenticated.
- Run the Supabase advisors after the local apply. Nothing new may show.

### Shared sender: `packages/push`

A new workspace package, used by both apps, server-only. Port the Driver Portal's transport `~/Yachtsy/DriverPortal/backend/src/services/push/transports/apns.js` to TypeScript:

- Node `http2` and the ES256 JWT, cached 40 minutes.
- Env: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY` (the .p8 contents), `APNS_BUNDLE_ID` (default `org.thebtxfoundation.opshub`), `APNS_PRODUCTION` (`'true'` selects api.push.apple.com, otherwise sandbox).
- With any env missing, fall back to a log transport and return `{ transport: 'log' }`. Never throw.
- `410 Unregistered` or `BadDeviceToken` → set `disabled_at` and `last_error` on that device.

API: `sendPush({ userIds, key, title, body, url })`:

1. Looks up active devices with the service-role client.
2. Skips any `(user_id, key)` already in `ops_push_log`.
3. Sends, then logs the result.

`url` is an Ops Hub path, delivered in the payload so a tap opens it. Title and body are plain strings; enforce the two-row rule in code by truncating body to 60 characters with "…", plus a unit test.

Wrap fire-and-forget sends in Vercel's `waitUntil`, loading `@vercel/functions` **synchronously** (see the Driver Portal's `backend/src/services/push/notifyDriver.js` lines 95-120). In Next.js route handlers or server actions, Next's `after()` is the equivalent; use `after()` where the code already uses it, as the Portal's `book-emails.ts` does.

### Device registration (Ops Hub)

- **`POST /api/push/register`** `{ token, label }`:
  - Signed-in staff only (`isStaffRole`).
  - `user_id` always comes from the session, never the body.
  - Upserts with the service role, refreshing `last_seen_at` and clearing `disabled_at`.
- **`POST /api/push/unregister`** `{ token }`: same rules, sets `disabled_at`.
- The proxy already guards staff routes; confirm `/api/push/*` sits behind the staff check.

### The Notifications row (Ops Hub phone menu)

- Find the phone drawer component; the class names `mn-dr` and `mn-me` are the Figma names and may differ in code. Grep `apps/ops/components` for the drawer and the account footer.
- Add the row per **Figma 466:11789 and 466:12043**: bell icon (add `bell` to `components/icons.tsx` with the frame's path), label "Notifications", and a Switch (44×26, gold when on; tap target 48×44).
- **Render it only inside the native app:** `Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('PushNotifications')`, read from `window.Capacitor` (the bridge injects it on the remote origin). Add no Capacitor dependency to the web app.
- **States:**
  - **Off:** tapping calls `PushNotifications.requestPermissions()`. If granted, `register()`, wait up to 20 s for the `registration` event, POST the token, show On.
  - **On:** tapping unregisters (POST unregister) and shows Off.
  - **Blocked** (permission `denied`): the sub-line "Off in Settings" and the link "Open Settings", which opens `app-settings:`.
- Remember the state per device in `localStorage` (try/catch). Confirm it from `checkPermissions()` on every menu open.

### The alerts (exact copy in Figma 465:11750; times are Eastern)

| Alert | Fires from | Who | Title | Body |
|---|---|---|---|---|
| Interview booked | Portal `apps/portal/lib/book-emails.ts` `bookAndNotify` (next to `planBooked`) | the two interviewers | Interview booked | `Applicant 15 · Tue Nov 10, 6:00 PM` |
| Interview moved | same, the `'switched'` result | the interviewers | Interview moved | `Applicant 15 · now Wed Nov 11, 7:00 PM` |
| Interview cancelled | where `planCancel` runs (Portal cancel path, and the Ops Hub's interviewer removal if it cancels) | the interviewers | Interview cancelled | `Applicant 21 · Thu Nov 12, 6:00 PM` |
| Interviews tomorrow | Ops cron `?kind=prep` (`sendPrepEmails`, `apps/ops/lib/email/interviews.ts`) | each interviewer with interviews tomorrow | Interviews tomorrow | `You have 2. Your prep is in the Ops Hub.` (`You have 1.` when singular) |
| Availability | `sendAvailabilityReminders` (`apps/ops/lib/actions/interviews.ts` line ~165, the admin's "Remind the others") | the same people the email goes to | Give your interview availability | `Add your times by Fri Nov 6` (the cycle's close date) |
| New task | the task create/assign server action (find it: tasks-board "Add a task", `lib/actions/*`) | each assignee except the creator | New task for you | `<task title> · due <Mon D>` (title cut so the line fits) |
| Due tomorrow | add to the existing Ops cron `?kind=reminder` (do NOT add a new cron) | assignees of open tasks due tomorrow | Due tomorrow | `<task title>` |
| Board chat | `postMessage` in `apps/ops/lib/chat-actions.ts` | every staff member except the author | Board chat | `<Author name> sent a message.` |
| Approval waiting | **not built**: nothing in the Ops Hub creates approval requests yet. Leave a `TODO(push)` comment where one would be created and note it in the PR | | | |

- **Idempotency keys:**
  - `interview-booked:<slot_id>:<user_id>` (and moved/cancelled the same way)
  - `prep:<eastern-date>:<user_id>`
  - `availability:<cycle>:<eastern-date>:<user_id>`
  - `task-new:<task_id>:<user_id>`
  - `task-due:<task_id>:<eastern-date>:<user_id>`
  - `chat:<message_id>:<user_id>`
- **Tap targets (`url`):**
  - `/scholarships/interviews` for interviews
  - `/scholarships/interviews/availability` for availability
  - `/tasks` for tasks
  - `/chat` for Board chat

  Confirm each route exists.
- **Portal:** the Portal sends interview pushes through `packages/push` with its existing service-role client. Both projects need the APNs env vars; the gated env step sets them on btx-ops and btx-portal.
- **Admin test:** add a "Send a test push to me" button under People and roles for admins. It sends "Test from the Ops Hub" / "Pushes work on this phone." to the caller only.
- **Tests:**
  - truncation and applicant-number formatting (`APP-2026-00015` → `Applicant 15`)
  - idempotency
  - the log fallback with no env
  - register refusing a body `user_id`
  - each alert's recipients (mocked data)

### After merge (in order, each gated)

1. The migration: Dominick's reply naming BTX Student/Operations Hub. Apply verbatim and fingerprint.
2. The APNs key:
   1. Dominick creates a key in Apple Developer → Certificates, IDs & Profiles → Keys ("BTX Ops Hub push", APNs).
   2. He pastes `APNS_KEY` and `APNS_KEY_ID` into btx-ops and btx-portal with a one-line command that reads from his clipboard and never echoes the key.
   3. Claude sets `APNS_TEAM_ID` 6H2R38WKP3, `APNS_BUNDLE_ID` and `APNS_PRODUCTION`. `false` (sandbox) is for Debug simulator and phone builds; `true` is for TestFlight and App Store builds.
3. A redeploy of both apps.
4. The test push from People and roles to Dominick's phone (a Debug build installed with `xcrun devicectl`, Developer Mode on).

## PR C: Apple's review access (sample data only)

- **A second Vercel project, `btx-ops-demo`,** in team btx-aps:
  - Same repo, root `apps/ops`, production branch `master`.
  - **No Supabase or secret env vars at all,** so the Ops Hub runs in its built-in mock mode with sample data. Verify it can't reach the database: no `NEXT_PUBLIC_SUPABASE_*` and no service key set. The app's mock check is `!hasSupabaseEnv()`. Make sure the build doesn't inherit the Supabase defaults: check `apps/ops/next.config.ts` for hard-coded fallbacks like the Portal's, and if there are any, add an explicit `BTX_FORCE_MOCK=1` switch that wins.
  - Domain `demo-ops.thebtxfoundation.org`: a CNAME in Squarespace Domains (Rayken Chrome profile), on the same pattern as `ops`.
  - Use the BTX Vercel key at `~/.config/btx/vercel.token`. Creating the project and its domain are setting changes covered by the approved plan; DNS needs the Squarespace re-verify by Dominick if it prompts.
- **Ops Hub sign-in (`apps/ops/components/sign-in.tsx`):**
  - When the typed email is exactly `appreview@thebtxfoundation.org` (lowercased, trimmed), skip the code request and go to `https://demo-ops.thebtxfoundation.org/`.
  - No account is created and no code is sent.
  - Add a unit test.
  - The demo copy shows a thin banner, "Sample data for App Review. No real information.", only when mock mode is forced.
- **Security pass (opus):** no path from the demo copy to real data; the redirect can't be abused (fixed URL); the email match is exact.
- **App Review notes text** (for the listing later): "Sign in with appreview@thebtxfoundation.org. That opens the app with sample data. Real board members sign in with a code sent to their email."

## After the PRs (later steps; not part of this build)

- **TestFlight internal build:** Dominick archives, or uses the App Store Connect key.
- **App Store Connect record:** "BTX Ops Hub" with the bundle id.
- **Privacy page:** an unlinked page on thebtxfoundation.org.
- **App Privacy answers.**
- **Screenshots:** iPhone 6.9" and 6.5".
- **The Unlisted request before submitting:** Dominick, as account holder. Claude drafts the answers.
- **Submit.**

The Driver Portal's notes (`~/.claude/projects/-Users-dominicklittleton-Yachtsy-DriverPortal/memory/driver-push-ios-app.md`) have every listing and review lesson.

## Status after PR B (push)

Built: interview booked / moved / cancelled (Portal booking route, and the Ops Hub's interviewer swap), interviews tomorrow (prep cron), availability reminder, due tomorrow (reminder cron), Board chat, and the admin's test push. Every push is two rows (title and one short line), applicants appear only as "Applicant 15", and the chat push never carries the message text. Tapping a push opens the Ops Hub path it carries (checked: this site only), verified in the simulator with `xcrun simctl push`.

Behaviour worth knowing:
- **Signing out turns the phone off for that person** (the app calls `/api/push/unregister` before signing out). The Notifications switch asks the server (`/api/push/status`) what it holds, so a phone another person signed in on shows Off, and a phone a push error switched off registers itself again when the menu opens.
- **BadDeviceToken is a retry, not a retirement.** A wrong `APNS_PRODUCTION` (sandbox vs production) makes Apple answer it for every phone, so only 410 switches a phone off. If pushes stop arriving, check `last_error` on `ops_push_devices` first.
- **At most once.** A push is reserved before it is sent and given back only when no phone accepted it, so cron pushes retry on the next run; chat, booking, rebalance and test pushes have no later run, so a failure there is a lost push. A function killed between the reservation and the send also loses that push. Each run stops starting sends after 40 seconds.
- **Interview keys carry the student** and, for Portal bookings, a per-request nonce, so each booking action notifies and a second student in the same slot is not silenced.
- **The page-side Capacitor bridge hands back plain listener handles, not promises.** Any code that adds a listener must wrap it in `Promise.resolve`. This broke the whole page once in the simulator and no browser test showed it, so check any new native call in the real shell.

Not built, on purpose:
- **New task for you.** The Ops Hub only adds a task for the person who is signed in (`apps/ops/components/tasks/tasks-writes.ts`), so there is nobody to tell. Add it where a task gets assigned to someone else when that exists.
- **Approval waiting.** Nothing in the Ops Hub creates approval requests yet.

Gated, in order, after the merge: apply `supabase/migrations/20261022200000_ops_push.sql` to the production database; Dominick creates the Apple push key and sets `APNS_KEY` and `APNS_KEY_ID` in both Vercel projects; Claude sets `APNS_TEAM_ID`, `APNS_BUNDLE_ID` and `APNS_PRODUCTION`, then redeploys both.
