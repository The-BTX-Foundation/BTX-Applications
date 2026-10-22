# Ops Hub to Google Calendar sync

This folder holds a small Google Apps Script. It copies everything on the Ops Hub's Calendar page into the board's shared Google Calendar (the calendar of info@thebtxfoundation.org).

## What it does

- Every 10 minutes the script asks the Ops Hub for its full list of calendar items: events, booked interviews, task due dates, posts, plan milestones and the cycle's dates (applications open, applications close, the interview window, decisions).
- It then makes the Google Calendar match that list. New items are added, changed items are rewritten, and items removed from the Ops Hub are removed from Google.
- The Ops Hub only answers this script. The script proves who it is with a sign-in token that Google issues to info@ (no password or shared secret is stored anywhere).

Things to know:

- **One way only.** The Ops Hub is the source. Change things in the Ops Hub, never in Google.
- **Up to 10 minutes late.** A change in the Ops Hub shows up in Google at the next run.
- **Edits made in Google to a synced event are replaced** at the next run (each synced event says so at the bottom of its description).
- **Events people add by hand in Google are never touched.** The script marks the events it creates with a hidden tag and only ever changes or deletes those.
- **Applicant names are left out on purpose.** An interview shows as "BTX interview · APP-2026-00015" (the application number). Calendars show up on phones and lock screens, so no student's name, email or other details are sent to Google.
- **Range:** from 30 days ago to 400 days ahead. Older synced events stay in the calendar as history.

## One-time setup (in this order)

1. Sign in to Google as **info@thebtxfoundation.org** and open [Apps Script](https://script.google.com). Click **New project**. Name it "BTX Ops Hub calendar sync".
2. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**. Go back to the editor (the `< >` icon).
3. Open `appsscript.json` in the editor and replace everything in it with the contents of [appsscript.json](appsscript.json) from this folder.
4. Open `Code.gs` in the editor and replace everything in it with the contents of [Code.gs](Code.gs) from this folder. Click the save icon.
5. In the function menu at the top choose **showSyncId** and click **Run**. Google shows a permission screen: click **Review permissions**, pick info@, and click **Allow**. (It asks to see the account's email, manage its calendars, call outside services and run on a timer.)
6. The log at the bottom shows two lines. Copy the value after `aud` (a long id ending in `.apps.googleusercontent.com`). The `email` line should say info@thebtxfoundation.org.
7. That value goes into `SYNC_CLIENT_ID` in `apps/ops/lib/calendar-sync/config.ts`, and the Ops Hub change goes live through the normal pull request. Until then the Ops Hub refuses every call from the script.
8. Once that change is live, choose **syncNow** and click **Run** once. The log shows how many events it created. Check the calendar.
9. Choose **installTrigger** and click **Run**. From now on it runs every 10 minutes by itself.

The first sync of a long list may take a few runs: each run makes at most 150 changes (and at most 40 deletions) and leaves the rest for the next run.

## Pause it

Choose **removeTrigger** and click **Run**. The sync stops. Events already in the calendar stay. Run **installTrigger** again to restart it.

## Undo it completely

1. Run **removeTrigger** (stops the timer).
2. Run **deleteSyncedEvents**. It deletes every event the script created, from 400 days ago to 800 days ahead. Hand-made events are not touched. If the log says it ran out of time, run it again.

## If something goes wrong

The script changes nothing when the Ops Hub does not answer properly (an error, the sign-in page, a broken list). If the list ever came back empty while the calendar has more than five synced events, it stops with "Refusing to delete every synced event" instead of wiping the calendar. Errors show under **Executions** (the list icon on the left) in Apps Script.
