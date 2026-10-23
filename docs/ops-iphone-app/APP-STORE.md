# BTX Ops Hub: App Store listing

State as of 2026-10-22 night. The listing is a **draft** in App Store Connect (app "BTX Ops Hub", Apple ID 6826045448, bundle `org.thebtxfoundation.opshub`, version 1.0). Nothing has been submitted. Claude wrote the draft through the App Store Connect API; the rest is Dominick's, as Account Holder.

## What is already in the draft

| Field | Value |
|---|---|
| Name / subtitle | BTX Ops Hub / The BTX board's workspace |
| Category | Business |
| Price / availability | Free, United States only (the other 174 territories are off, and no new ones are added) |
| Privacy address | https://www.thebtxfoundation.org/ops-hub-app-privacy/ (**must be live before submitting**: PR Btx-Website#71, then Dominick's promote) |
| Support / marketing address | https://www.thebtxfoundation.org/contact/ and https://www.thebtxfoundation.org/ |
| Keywords | BTX,board,nonprofit,scholarship,tasks,calendar,chat,interviews,foundation,operations |
| Promotional text | The BTX board's tasks, calendar, chat and scholarship reviews, in one place. |
| Description | In App Store Connect (board only, invitation sign-in, the seven features, codes not passwords) |
| Release | Manual (nothing goes live on approval) |
| Content rights | Does not use third-party content |
| Encryption | Standard HTTPS only (`ITSAppUsesNonExemptEncryption = false`) |
| Age rating | Answers: messaging and chat **yes**, user-generated content **yes** (Board chat, board members only), everything else none or no. Apple computed 4+ |
| Screenshots | 5 at 1320x2868 (Apple's "6.9-inch" size, API name `APP_IPHONE_67`) from the sample-data copy: [store-screenshots/](store-screenshots/) |
| Review notes | Written (below). Sign-in line: `appreview@thebtxfoundation.org` opens the sample-data copy |
| Build | **Not attached yet** (see "Build 2") |

## Build 2 also fixes Face ID

Build 1 asked for the iPhone passcode instead of Face ID: `Info.plist` had no `NSFaceIDUsageDescription`, so iOS never offered Face ID to the app. Build 2 adds it. Checked in the simulator (enrolled face: the Face ID prompt appears over the lock cover, a simulated match unlocks it); Dominick re-checks on his phone from build 2.

## Build 2 (why build 1 can't go to the App Store)

Build 1 was uploaded as "TestFlight Internal Only", and Apple never lets an internal-only build into the App Store (attaching it fails with "pre-release build could not be added"). Build 2 is the same code with the number bumped (`CURRENT_PROJECT_VERSION = 2`), distributed with **TestFlight & App Store**, then attached to version 1.0. Route: Claude archives and copies the archive into Xcode's Organizer; Dominick clicks Distribute App > TestFlight & App Store > Distribute (Claude's App Manager key can't sign App Store builds; see `apps/ops/mobile/README.md`).

## Review notes (as saved in App Review Information)

> HOW TO SIGN IN: type appreview@thebtxfoundation.org on the sign-in screen and tap "Email me a code". The app opens a separate copy of the Ops Hub that runs on sample data only (fictional people; a banner says so). No code, password or account is needed.
>
> WHAT THE APP IS: the private workspace of the board of The BTX Foundation, a 501(c)(3) nonprofit, for the board's own members (about 8), invited by an administrator. No sign-up, no payment. We are requesting Unlisted App Distribution (Guideline 3.2).
>
> NATIVE FEATURES: Face ID / passcode lock (60 seconds after leaving the app); opt-in push notifications (menu > Notifications) that never show an applicant's name or a chat message's text; an offline screen.
>
> ACCOUNT DELETION: accounts exist only by administrator invitation, so the app has no sign-up; deletion is by email to info@thebtxfoundation.org.

Still empty: the **review contact phone** (Apple requires one, with `+1`). Dominick adds it in App Store Connect > App Review Information.

## App Privacy answers (Dominick enters these: App Store Connect > App Privacy; the API has no way to)

Do **not** accept the default "Data Not Collected": the app does collect the data below. Tracking: **No**. For every row: *used for* App Functionality only, *linked to the user's identity*: Yes, *used for tracking*: No.

| Apple's category | Data type | Why |
|---|---|---|
| Contact Info | Email Address | the sign-in code is emailed to it |
| Contact Info | Name | shown with what a board member adds |
| Identifiers | User ID | the board member's account |
| Identifiers | Device ID | the phone's push address, only if Notifications is on |
| User Content | Emails or Text Messages | Board chat messages |
| User Content | Other User Content | tasks, calendar entries, goals, scores and notes |

Not collected: location, contacts, photos, microphone, camera, browsing history, purchases, diagnostics or analytics (the app has no analytics tools). Face ID is checked by iOS on the phone.

## Unlisted App Distribution request (Dominick files it, as Account Holder, before the first submit)

Form: https://developer.apple.com/contact/request/unlisted-app/ . Draft answers, same shape as the Driver Portal's approved request:

- **Type of app / use:** Business (an organization's own operations app).
- **Who uses it:** the volunteer board members of one 501(c)(3), about 8 people, 1 organization. They are not employees, so also pick the external option if the form requires one.
- **Devices:** their own phones, not managed; about 8 devices.
- **Why not public:** the app is only useful to the board and shows the board's private records; sign-in is by invitation, so the public could not use it. A link-only listing lets them install it without TestFlight's 90-day expiry.
- **Distribution countries:** United States.
- **Link or Custom App:** link (Apple Business Manager doesn't fit: personal phones).
- Traps from the Driver Portal: the people and device fields take digits only; the acknowledgment box is the Account Holder's to tick; **Unlisted is permanent** (never back to public or private). Don't submit the app before Apple's email.

## Order of the remaining steps

1. Dominick: Face ID check on the real phone (build 1).
2. Btx-Website#71 merged and the privacy page promoted live (Dominick's `promote`).
3. Claude: archive build 2; Dominick distributes it (TestFlight & App Store); Claude attaches it.
4. Dominick: App Privacy answers, review contact phone, Unlisted request.
5. After Apple's Unlisted email: Pricing and Availability > App Distribution Methods > Unlisted; Claude checks the draft; Dominick submits for review.
