// BTX Ops Hub -> Google Calendar sync (one way). Runs as info@thebtxfoundation.org in Google Apps Script, using the
// Advanced Calendar service (Calendar API v3, switched on in appsscript.json under "dependencies").
// Every 10 minutes syncNow() fetches the Ops Hub's feed (GET /api/calendar-sync, proven with this script's Google
// identity token) and makes the shared calendar match it. It only ever touches events it created: each one carries a
// private marker (extendedProperties.private.btxSync = '1', plus the Ops Hub id and a fingerprint), written in the same
// API call that creates the event, so a run cut off half way never leaves an unmarked copy behind. Events people add by
// hand have no marker and are never read, changed or deleted. Edits made in Google to a synced event are put back.
// Setup, pausing and undoing: README.md next to this file. Logs hold counts only, never titles or tokens.

// The Ops Hub's address. Redirects are not followed (the token must only go here), so if the Ops Hub moves to another
// address or this one starts redirecting, runs fail with "Feed answered HTTP 3xx" and change nothing until this line is
// updated. Moved here from btx-ops-azure.vercel.app on 2026-10-22 when that address was retired.
const FEED_URL = 'https://ops.thebtxfoundation.org/api/calendar-sync';
const CALENDAR_ID = 'info@thebtxfoundation.org';
const TAG = 'btxSync';
const TAG_ID = 'btxSyncId';
const TAG_HASH = 'btxSyncHash';
const MAX_DELETES = 40;
const MAX_WRITES = 100;
// Apps Script stops a run at 6 minutes; no new write starts after 4.5 minutes, so a run always ends cleanly.
const TIME_BUDGET_MS = 270 * 1000;
// A run stops writing after this many failed writes.
const MAX_FAILURES = 3;
// The proportional delete guard: a run that would delete more than this many events AND more than this share of the
// synced events it is looking at is refused (syncNowAllowDeletes() lifts it for one run).
const MASS_DELETE_MIN = 10;
const MASS_DELETE_SHARE = 0.5;
const TIME_ZONE = 'America/New_York';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// One-time setup: logs the two values the Ops Hub checks (aud = this script's OAuth client ID, and the account's email).
// The token itself is never logged. Does not touch the calendar.
function showSyncId() {
  const payload = decodeTokenPayload_(ScriptApp.getIdentityToken());
  console.log('aud (copy this into SYNC_CLIENT_ID): ' + payload.aud);
  console.log('email: ' + payload.email);
}

// Reads the middle part of an identity token (base64url JSON). Google may leave off the "=" padding, so it is added back.
function decodeTokenPayload_(token) {
  if (!token) throw new Error('No identity token. Check that appsscript.json lists the openid scope.');
  let part = String(token).split('.')[1] || '';
  while (part.length % 4) part += '=';
  return JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(part)).getDataAsString());
}

// The timer's sync. Refuses a run that would delete an unusually large share of the synced events.
function syncNow() {
  runSync_({ allowMassDelete: false });
}

// For when many Ops Hub items really were removed on purpose: syncs with the proportional delete guard off, and keeps
// syncing (same run, same time budget) until a pass has nothing left to delete. The empty-feed guard still applies.
function syncNowAllowDeletes() {
  runSync_({ allowMassDelete: true });
}

// The sync itself: fetch the feed, compare with the synced events in the calendar, then delete, update and create.
// With allowMassDelete it repeats passes while there are deletes left and time remains.
// (Options are not syncNow's own parameter because a timer passes its event object as the first argument.)
// Throws at the end when any write failed, so the execution shows as Failed and Google emails the owner.
function runSync_(opts) {
  const startedAt = Date.now();
  // One run at a time: a manual run overlapping the timer could otherwise create the same event twice.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('Another sync is running; skipped this one.');
    return;
  }
  const total = { created: 0, updated: 0, deleted: 0, replaced: 0, skipped: 0, failed: 0, unchanged: 0, deferred: 0, stoppedEarly: false };
  let deletesLeft = false;
  try {
    const feed = fetchFeed_();
    const winStart = dayStart_(feed.windowStart).getTime();
    const winEnd = dayStart_(feed.windowEnd).getTime();
    const desiredIds = {};
    feed.events.forEach(function (e) { desiredIds[e.id] = true; });
    for (;;) {
      const items = listSynced_();
      const rows = items.map(function (item, i) { return toLive_(item, i); }).filter(function (r) { return r !== null; });
      const plan = planSync(pickExisting_(rows, desiredIds, winStart, winEnd), feed.events, { allowMassDelete: opts.allowMassDelete === true });
      const result = applyPlan_(plan, calendarApi_(items), startedAt, Date.now);
      ['created', 'updated', 'deleted', 'replaced', 'skipped', 'failed'].forEach(function (k) { total[k] += result[k]; });
      total.unchanged = plan.unchanged;
      total.deferred = result.deferred;
      total.stoppedEarly = result.stoppedEarly;
      deletesLeft = plan.delete.length > 0;
      // Another pass only for syncNowAllowDeletes, only while this pass deleted something and nothing went wrong.
      const again = opts.allowMassDelete === true && deletesLeft && result.deleted > 0 && !result.stoppedEarly &&
        result.failed === 0 && Date.now() - startedAt <= TIME_BUDGET_MS;
      if (!again) break;
    }
    console.log('created ' + total.created + ', updated ' + total.updated + ', replaced ' + total.replaced +
      ', deleted ' + total.deleted + ', skipped (unchanged) ' + total.unchanged + ', failed ' + total.failed +
      ', skipped after failing ' + total.skipped + ', deferred to next run ' + total.deferred +
      (total.stoppedEarly ? ', stopped early' : ''));
    if (opts.allowMassDelete === true && deletesLeft && (total.stoppedEarly || total.deferred > 0)) {
      console.log('Deletes are still left: run syncNowAllowDeletes again.');
    }
  } finally {
    lock.releaseLock();
  }
  if (total.failed > 0) throw new Error('A calendar write failed; ' + total.deferred + ' left for next run');
}

// The three Calendar API writes. A plan key is the index of the listed event, mapped back to Google's own event id.
function calendarApi_(items) {
  return {
    remove: function (key) { Calendar.Events.remove(CALENDAR_ID, items[key].id); },
    update: function (key, e) { Calendar.Events.update(toResource_(e), CALENDAR_ID, items[key].id); },
    insert: function (e) { Calendar.Events.insert(toResource_(e), CALENDAR_ID); },
  };
}

// Every event this script created (any date), page by page. Hand-made events lack the private marker and never appear.
// singleEvents is false so a synced event someone turned into a repeating series comes back as one item (repaired as
// a whole by the plan) instead of one item per occurrence.
function listSynced_() {
  const out = [];
  let pageToken;
  do {
    const page = Calendar.Events.list(CALENDAR_ID, {
      privateExtendedProperty: TAG + '=1',
      singleEvents: false,
      showDeleted: false,
      maxResults: 2500,
      pageToken: pageToken,
    });
    (page.items || []).forEach(function (item) { out.push(item); });
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

// Fetches and checks the feed. Throws (so nothing is changed this run) on any answer but a well-formed version 1 feed.
function fetchFeed_() {
  const res = UrlFetchApp.fetch(FEED_URL, {
    method: 'get',
    headers: { Authorization: 'Bearer ' + ScriptApp.getIdentityToken() },
    muteHttpExceptions: true,
    followRedirects: false, // a redirect means something is wrong (e.g. the sign-in page); never follow it with the token
  });
  const code = res.getResponseCode();
  if (code !== 200) throw new Error('Feed answered HTTP ' + code);
  let feed;
  try {
    feed = JSON.parse(res.getContentText());
  } catch (e) {
    throw new Error('Feed is not JSON');
  }
  if (!feed || feed.version !== 1) throw new Error('Unexpected feed version');
  if (!DAY_RE.test(feed.windowStart) || !DAY_RE.test(feed.windowEnd) || !Array.isArray(feed.events)) throw new Error('Feed is missing its window or events');
  feed.events.forEach(function (e) {
    const ok = e && typeof e.id === 'string' && e.id && typeof e.title === 'string' && typeof e.hash === 'string' &&
      typeof e.start === 'string' && typeof e.end === 'string' && typeof e.allDay === 'boolean' &&
      (e.allDay ? DAY_RE.test(e.start) && DAY_RE.test(e.end) : !isNaN(Date.parse(e.start)) && !isNaN(Date.parse(e.end)));
    if (!ok) throw new Error('Feed has a malformed event');
  });
  return feed;
}

// "2026-11-02" -> midnight at the start of that day in Eastern time.
function dayStart_(day) {
  if (!DAY_RE.test(day)) throw new Error('Not a day: ' + day);
  return Utilities.parseDate(day, TIME_ZONE, 'yyyy-MM-dd');
}

// A feed event -> a Calendar API event resource with the private marker included, so creating and marking is one call.
// All-day: date-only start and end, end exclusive (the feed already follows Google's rule). Timed: instants.
function toResource_(e) {
  return {
    summary: e.title,
    description: e.description || '',
    location: e.location || '',
    start: e.allDay ? { date: e.start } : { dateTime: e.start, timeZone: TIME_ZONE },
    end: e.allDay ? { date: e.end } : { dateTime: e.end, timeZone: TIME_ZONE },
    extendedProperties: { private: { btxSync: '1', btxSyncId: e.id, btxSyncHash: e.hash } },
  };
}

// A listed Calendar API event -> the fields the plan compares, or null when it is not one of ours, has no usable dates,
// or is a changed occurrence of a series (recurringEventId: the series itself is what gets repaired).
// startMs/endMs are only for the window rule (pickExisting_); the hash is kept as metadata only.
function toLive_(item, key) {
  const priv = (item.extendedProperties && item.extendedProperties.private) || {};
  if (priv[TAG] !== '1' || !priv[TAG_ID] || !item.start || !item.end || item.recurringEventId) return null;
  const allDay = Boolean(item.start.date);
  const start = allDay ? item.start.date : item.start.dateTime;
  const end = allDay ? item.end.date : item.end.dateTime;
  if (!start || !end) return null;
  if (allDay ? !DAY_RE.test(start) || !DAY_RE.test(end) : isNaN(Date.parse(start)) || isNaN(Date.parse(end))) return null;
  return {
    key: key,
    id: priv[TAG_ID],
    hash: priv[TAG_HASH] || '',
    summary: item.summary || '',
    description: item.description || '',
    location: item.location || '',
    allDay: allDay,
    recurring: Boolean(item.recurrence && item.recurrence.length),
    start: start,
    end: end,
    startMs: allDay ? dayStart_(start).getTime() : Date.parse(start),
    endMs: allDay ? dayStart_(end).getTime() : Date.parse(end),
  };
}

// Text as Google may hand it back: Windows line endings and trailing spaces do not count as an edit.
function normText_(s) {
  return String(s || '').replace(/\r\n/g, '\n').replace(/\s+$/, '');
}

// A timestamp -> whole seconds since 1970 (milliseconds are dropped on both sides before comparing).
function seconds_(ts) {
  return Math.floor(Date.parse(ts) / 1000);
}

// PURE: does the live calendar event still show exactly what the feed wants? Compares title, description, location,
// all-day vs timed, and start and end (all-day as day strings; timed as whole-second instants, so "10:00-05:00" equals
// "15:00Z"). A repeating series is never a match: synced events are single events.
function sameEvent_(live, desired) {
  if (live.recurring) return false;
  if (normText_(live.summary) !== normText_(desired.title)) return false;
  if (normText_(live.description) !== normText_(desired.description)) return false;
  if (normText_(live.location) !== normText_(desired.location)) return false;
  if (Boolean(live.allDay) !== Boolean(desired.allDay)) return false;
  if (desired.allDay) return live.start === desired.start && live.end === desired.end;
  return seconds_(live.start) === seconds_(desired.start) && seconds_(live.end) === seconds_(desired.end);
}

// Which synced events the plan may act on: any whose id the feed still has (wherever it sits), plus any that overlap
// the feed's window. A synced event outside the window that the feed no longer lists is left alone (old history stays).
function pickExisting_(rows, desiredIds, winStartMs, winEndMs) {
  return rows.filter(function (r) { return desiredIds[r.id] === true || (r.startMs < winEndMs && r.endMs > winStartMs); });
}

// PURE: what to change. existing = live synced events ({ key, id, summary, description, location, allDay, recurring,
// start, end }), desired = the feed's events.
// Returns { create: event[], update: [{ key, event }], replace: [{ key, event }], delete: key[], deferred, unchanged }.
// Showing what the feed wants: left alone. Same id but anything different (including edits made in Google): update.
// A copy someone turned into a repeating series: replace (delete it, then insert a fresh single event; two writes).
// Id no longer in the feed: delete. Two copies of one id: keep one (a matching copy, else a single event, else the
// first), delete the rest.
// Guards: an empty feed never wipes more than 5 events; more than 10 deletes that are also more than half the events
// looked at is refused unless opts.allowMassDelete (replacements are repairs and do not count). Caps: MAX_DELETES
// deletes and MAX_WRITES writes in all per run; the rest is counted in `deferred` and happens on the next run.
function planSync(existing, desired, opts) {
  const allowMassDelete = Boolean(opts && opts.allowMassDelete);
  if (desired.length === 0 && existing.length > 5) throw new Error('Refusing to delete every synced event');
  const want = {};
  desired.forEach(function (e) { if (!want[e.id]) want[e.id] = e; });
  // Group the calendar's copies by id, in the order they were listed (keeps the plan deterministic).
  const copies = {};
  const order = [];
  existing.forEach(function (x) {
    if (!copies[x.id]) { copies[x.id] = []; order.push(x.id); }
    copies[x.id].push(x);
  });

  const deletes = [];
  const updates = [];
  const replaces = [];
  let unchanged = 0;
  order.forEach(function (id) {
    const list = copies[id];
    const e = want[id];
    if (!e) {
      list.forEach(function (x) { deletes.push(x.key); });
      return;
    }
    let keep = list.findIndex(function (x) { return sameEvent_(x, e); });
    const matches = keep >= 0;
    if (!matches) keep = list.findIndex(function (x) { return !x.recurring; });
    if (keep < 0) keep = 0;
    list.forEach(function (x, i) { if (i !== keep) deletes.push(x.key); });
    if (matches) unchanged++;
    else if (list[keep].recurring) replaces.push({ key: list[keep].key, event: e });
    else updates.push({ key: list[keep].key, event: e });
  });
  const creates = [];
  const seen = {};
  desired.forEach(function (e) {
    if (!copies[e.id] && !seen[e.id]) creates.push(e);
    seen[e.id] = true;
  });

  if (!allowMassDelete && deletes.length > MASS_DELETE_MIN && deletes.length > MASS_DELETE_SHARE * existing.length) {
    throw new Error('Refusing to delete ' + deletes.length + ' of ' + existing.length + ' synced events in one run. ' +
      'If the Ops Hub items really were removed, run syncNowAllowDeletes once.');
  }

  // The caps: deletes first (within MAX_DELETES), then replacements (two writes each), then updates, then creates,
  // until MAX_WRITES is used up.
  const del = deletes.slice(0, Math.min(MAX_DELETES, MAX_WRITES));
  let budget = MAX_WRITES - del.length;
  const rep = replaces.slice(0, Math.floor(budget / 2));
  budget -= 2 * rep.length;
  const upd = updates.slice(0, budget);
  budget -= upd.length;
  const cre = creates.slice(0, budget);
  const deferred = (deletes.length - del.length) + 2 * (replaces.length - rep.length) + (updates.length - upd.length) + (creates.length - cre.length);
  return { create: cre, update: upd, replace: rep, delete: del, deferred: deferred, unchanged: unchanged };
}

// How to treat a failed Calendar API call: 'skip' it (a permanent problem with that one event: a 4xx answer) or 'stop'
// writing for this run (rate limit, server error, or anything unknown; the next run retries).
function failureKind_(err) {
  const details = (err && err.details) || {};
  const code = typeof details.code === 'number' ? details.code : 0;
  const reasons = (details.errors || []).map(function (x) { return x && x.reason; });
  const rateLimited = code === 429 || (code === 403 && (reasons.indexOf('rateLimitExceeded') >= 0 || reasons.indexOf('userRateLimitExceeded') >= 0));
  return code >= 400 && code < 500 && !rateLimited ? 'skip' : 'stop';
}

// Carries out a plan: deletes, then replacements (delete, then a fresh insert), then updates, then creates, one API
// call each. No new write starts once TIME_BUDGET_MS has passed since `startedAt` (by `now()`). A failed write is
// logged as one fixed line (its kind and HTTP status only, never the error text, which may quote event content):
// a permanent failure is skipped and the run goes on; a rate limit or server error stops writing; so do
// MAX_FAILURES failures. Whatever is not attempted is counted as deferred and the next run picks it up.
// Returns { created, updated, deleted, replaced, skipped, failed, deferred, stoppedEarly }.
function applyPlan_(plan, api, startedAt, now) {
  const steps = [];
  plan.delete.forEach(function (key) { steps.push({ kind: 'delete', run: function () { api.remove(key); } }); });
  (plan.replace || []).forEach(function (r) {
    steps.push({ kind: 'delete', count: false, run: function () { api.remove(r.key); } });
    steps.push({ kind: 'create', count: 'replaced', run: function () { api.insert(r.event); } });
  });
  plan.update.forEach(function (u) { steps.push({ kind: 'update', run: function () { api.update(u.key, u.event); } }); });
  plan.create.forEach(function (e) { steps.push({ kind: 'create', run: function () { api.insert(e); } }); });
  const counter = { delete: 'deleted', update: 'updated', create: 'created' };
  const done = { created: 0, updated: 0, deleted: 0, replaced: 0 };
  let skipped = 0;
  let failed = 0;
  let stoppedEarly = false;
  let i = 0;
  for (; i < steps.length; i++) {
    if (now() - startedAt > TIME_BUDGET_MS || failed >= MAX_FAILURES) { stoppedEarly = true; break; }
    const step = steps[i];
    try {
      step.run();
    } catch (err) {
      failed++;
      const code = err && err.details && err.details.code;
      console.log('Write failed: ' + step.kind + (code ? ' (HTTP ' + code + ')' : ''));
      if (failureKind_(err) === 'skip') { skipped++; continue; }
      stoppedEarly = true;
      break;
    }
    if (step.count === 'replaced') done.replaced++;
    else if (step.count !== false) done[counter[step.kind]]++;
  }
  // A step that failed and stopped the run is retried next time, so it counts as deferred too.
  const notDone = steps.length - i;
  return {
    created: done.created, updated: done.updated, deleted: done.deleted, replaced: done.replaced,
    skipped: skipped, failed: failed, deferred: plan.deferred + notDone, stoppedEarly: stoppedEarly,
  };
}

// Turns the sync on: runs syncNow every 10 minutes (any older syncNow timer is removed first, so there is only one).
function installTrigger() {
  removeSyncTriggers_();
  ScriptApp.newTrigger('syncNow').timeBased().everyMinutes(10).create();
  console.log('Sync timer installed: every 10 minutes.');
}

// Rollback step 1: pauses the sync. Events already in the calendar stay where they are.
function removeTrigger() {
  console.log('Removed ' + removeSyncTriggers_() + ' sync timer(s).');
}

// Deletes every syncNow timer and returns how many there were.
function removeSyncTriggers_() {
  let n = 0;
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncNow') {
      ScriptApp.deleteTrigger(t);
      n++;
    }
  });
  return n;
}

// Rollback step 2: deletes every event this script created, whatever its date. Hand-made events have no marker and are
// never touched: each listed item's marker is checked again here rather than trusting the server's filter alone.
// Holds the same lock as a sync. Run removeTrigger first, or the next sync puts them back. Stops after TIME_BUDGET_MS;
// run it again.
function deleteSyncedEvents() {
  const startedAt = Date.now();
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('A sync is running; nothing was deleted. Try again in a minute.');
    return;
  }
  try {
    const items = listSynced_();
    let n = 0;
    let unmarked = 0;
    let i = 0;
    for (; i < items.length; i++) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;
      const priv = (items[i].extendedProperties && items[i].extendedProperties.private) || {};
      if (priv[TAG] !== '1') { unmarked++; continue; }
      Calendar.Events.remove(CALENDAR_ID, items[i].id);
      n++;
    }
    console.log('Deleted ' + n + ' synced event(s). Hand-made events were not touched.' +
      (unmarked ? ' Skipped ' + unmarked + ' listed event(s) without the sync marker.' : '') +
      (i < items.length ? ' Ran out of time with ' + (items.length - i) + ' left: run deleteSyncedEvents again.' : ''));
  } finally {
    lock.releaseLock();
  }
}
