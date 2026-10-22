# Ops Hub to Google Calendar sync

This folder holds a small Google Apps Script. It copies everything on the Ops Hub's Calendar page into the board's shared Google Calendar (the calendar of info@thebtxfoundation.org).

## What it does

- Every 10 minutes the script asks the Ops Hub for its full list of calendar items: events, booked interviews, task due dates, posts, plan milestones and the cycle's dates (applications open, applications close, the interview window, decisions).
- It then makes the Google Calendar match that list. New items are added, changed items are rewritten, and items removed from the Ops Hub are removed from Google.
- The Ops Hub only answers this script. The script proves who it is with a sign-in token that Google issues to info@ (no password or shared secret is stored anywhere).
- It talks to Google Calendar through the **Advanced Calendar service** (Google's Calendar API). That service is switched on by `appsscript.json`, so pasting that file in is all it takes.

Things to know:

- **One way only.** The Ops Hub is the source. Change things in the Ops Hub, never in Google.
- **Up to 10 minutes late.** A change in the Ops Hub shows up in Google at the next run.
- **Edits made in Google to a synced event are put back** within about 10 minutes. That covers moving it, renaming it, or changing its description or location. Each synced event says so at the bottom of its description.
- **Synced events are privately marked.** The script stamps each event it creates with a hidden marker, in the same step that creates it. Only marked events are ever changed or deleted.
- **Events people add by hand in Google are never touched.** They have no marker.
- **Applicant names are left out on purpose.** An interview shows as "BTX interview · APP-2026-00015" (the application number). Calendars show up on phones and lock screens, so no student's name, email or other details are sent to Google.
- **Range:** from 30 days ago to 400 days ahead. Older synced events stay in the calendar as history.

## Safety limits

- **Each run makes at most 100 changes, and at most 40 of them are deletions.** It also stops starting new changes after about 4.5 minutes. Anything left over happens on the next run, so the first sync of a long list may take a few runs.
- **If a change fails,** the log shows one line saying which kind of change it was (create, update or delete) and Google's error number, never the event's details. A change Google rejects outright (for example an event that was already removed) is skipped and the run carries on. If Google says to slow down or has a server problem, the run stops writing. A run also stops after 3 failed changes. Either way the next run tries again, and nothing is left half done.
- **A failed change marks the run as Failed** under **Executions**, and Google emails info@ about it, so a problem never goes unnoticed.
- **A synced event someone turned into a repeating event** is replaced with a fresh single event at the next run.
- **It will not empty the calendar.** If the Ops Hub's list ever comes back empty while the calendar has more than five synced events, the run stops with "Refusing to delete every synced event".
- **It will not delete a large share at once.** If a run would delete more than 10 events and that is more than half of the synced events it is looking at, the run stops with "Refusing to delete … synced events in one run". If those items really were removed in the Ops Hub on purpose, choose **syncNowAllowDeletes** and click **Run**. It syncs with this limit lifted and keeps going until nothing is left to delete (the empty-list limit still applies). If it runs out of time first, the log says "run syncNowAllowDeletes again": run it again. The timer then carries on as normal.

## One-time setup (in this order)

1. Sign in to Google as **info@thebtxfoundation.org** and open [Apps Script](https://script.google.com). Click **New project**. Name it "BTX Ops Hub calendar sync".
2. Click the gear icon (**Project Settings**) and tick **Show "appsscript.json" manifest file in editor**. Go back to the editor (the `< >` icon).
3. Open `appsscript.json` in the editor and replace everything in it with the contents of [appsscript.json](appsscript.json) from this folder. This also switches on the Advanced Calendar service: under **Services** on the left you should now see **Google Calendar API**.
4. Open `Code.gs` in the editor and replace everything in it with the contents of [Code.gs](Code.gs) from this folder. Click the save icon.
5. In the function menu at the top choose **showSyncId** and click **Run**. Google shows a permission screen: click **Review permissions**, pick info@, and click **Allow**. (It asks to see the account's email, manage its calendars, call outside services and run on a timer.)
6. The log at the bottom shows two lines. Copy the value after `aud` (a long id ending in `.apps.googleusercontent.com`). The `email` line should say info@thebtxfoundation.org.
7. That value goes into `SYNC_CLIENT_ID` in `apps/ops/lib/calendar-sync/config.ts`, and the Ops Hub change goes live through the normal pull request. Until then the Ops Hub refuses every call from the script.
8. Once that change is live, choose **syncNow** and click **Run** once. The log shows how many events it created. Check the calendar.
9. Choose **installTrigger** and click **Run**. From now on it runs every 10 minutes by itself.

If you update `Code.gs` later, paste the new version in, save, and run **syncNow** once to check the log.

## Pause it

Choose **removeTrigger** and click **Run**. The sync stops. Events already in the calendar stay. Run **installTrigger** again to restart it.

## Undo it completely

1. Run **removeTrigger** (stops the timer).
2. Run **deleteSyncedEvents**. It deletes every event the script created, whatever its date. It checks each event's marker itself before deleting, so hand-made events are never touched. If a sync is running at that moment it deletes nothing and says to try again in a minute. If the log says it ran out of time, run it again.

## If something goes wrong

The script changes nothing when the Ops Hub does not answer properly (an error, the sign-in page, a broken list). The log only ever shows counts (created, updated, deleted, unchanged, left for the next run), never event titles. Errors show under **Executions** (the list icon on the left) in Apps Script.
