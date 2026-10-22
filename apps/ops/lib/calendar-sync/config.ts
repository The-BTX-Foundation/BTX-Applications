// Settings for the one-way sync of the Calendar page into the board's shared Google Calendar. A Google Apps Script
// owned by SYNC_ACCOUNT (apps/ops/google/calendar-sync/) calls GET /api/calendar-sync every 10 minutes with a
// Google-signed identity token; the route checks that token against these values (lib/calendar-sync/verify-caller.ts).

/** The Google account that owns the Apps Script and the calendar it writes to. The token's email must be this one. */
export const SYNC_ACCOUNT = 'info@thebtxfoundation.org';

/**
 * The Apps Script project's OAuth client ID: the `aud` that `showSyncId()` logs in the script editor (one-time setup,
 * apps/ops/google/calendar-sync/README.md). While it is empty the route refuses every call (fail closed). Not a secret:
 * it names the script; only Google can sign a token for it. Project "BTX Ops Hub calendar sync" in info@'s Apps Script
 * (read 2026-10-22).
 */
export const SYNC_CLIENT_ID: string = '534657991053-gfkj50me6iltbpeku30vq9bidk1s9ltn.apps.googleusercontent.com';

/** How many Eastern days before today the feed reaches back. */
export const SYNC_DAYS_BACK = 30;
/** How many Eastern days after today the feed reaches forward. */
export const SYNC_DAYS_AHEAD = 400;

/** The live Ops Hub, used for the "change it there" link when OPS_HUB_URL is not set. */
export const OPS_HUB_FALLBACK = 'https://ops.thebtxfoundation.org';

/** The Ops Hub's address for links: OPS_HUB_URL when set (as the email code reads it), else the live Ops Hub. */
export function opsHubUrl(): string {
  return (process.env.OPS_HUB_URL || OPS_HUB_FALLBACK).replace(/\/+$/, '');
}
