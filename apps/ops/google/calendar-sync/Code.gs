// BTX Ops Hub -> Google Calendar sync (one way). Runs as info@thebtxfoundation.org in Google Apps Script, using the
// Advanced Calendar service (Calendar API v3, switched on in appsscript.json under "dependencies").
// Every 10 minutes syncNow() fetches the Ops Hub's feed (GET /api/calendar-sync, proven with this script's Google
// identity token) and makes the shared calendar match it. It only ever touches events it created: each one carries a
// private marker (extendedProperties.private.btxSync = '1', plus the Ops Hub id and a fingerprint), written in the same
// API call that creates the event, so a run cut off half way never leaves an unmarked copy behind. Events people add by
// hand have no marker and are never read, changed or deleted. Edits made in Google to a synced event are put back.
// Setup, pausing and undoing: README.md next to this file. Logs hold counts only, never titles or tokens.

const FEED_URL = 'https://btx-ops-azure.vercel.app/api/calendar-sync';
const CALENDAR_ID = 'info@thebtxfoundation.org';
const TAG = 'btxSync';
const TAG_ID = 'btxSyncId';
const TAG_HASH = 'btxSyncHash';
const MAX_DELETES = 40;
const MAX_WRITES = 100;
// Apps Script stops a run at 6 minutes; no new write starts after 4.5 minutes, so a run always ends cleanly.
const TIME_BUDGET_MS = 270 * 1000;
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

// One sync with the proportional delete guard off, for when many Ops Hub items really were removed on purpose.
// The empty-feed guard still applies.
function syncNowAllowDeletes() {
  runSync_({ allowMassDelete: true });
}

// The sync itself: fetch the feed, compare with the synced events in the calendar, then delete, update and create.
// (Options are not syncNow's own parameter because a timer passes its event object as the first argument.)
function runSync_(opts) {
  const startedAt = Date.now();
  // One run at a time: a manual run overlapping the timer could otherwise create the same event twice.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('Another sync is running; skipped this one.');
    return;
  }
  try {
    const feed = fetchFeed_();
    const winStart = dayStart_(feed.windowStart).getTime();
    const winEnd = dayStart_(feed.windowEnd).getTime();
    const items = listSynced_();
    const rows = items.map(function (item, i) { return toLive_(item, i); }).filter(function (r) { return r !== null; });
    const desiredIds = {};
    feed.events.forEach(function (e) { desiredIds[e.id] = true; });
    const plan = planSync(pickExisting_(rows, desiredIds, winStart, winEnd), feed.events, { allowMassDelete: opts.allowMassDelete === true });
    const result = applyPlan_(plan, calendarApi_(items), startedAt, Date.now);
    console.log('created ' + result.created + ', updated ' + result.updated + ', deleted ' + result.deleted +
      ', skipped (unchanged) ' + plan.unchanged + ', deferred to next run ' + result.deferred +
      (result.stoppedEarly ? ', stopped early' : ''));
  } finally {
    lock.releaseLock();
  }
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
function listSynced_() {
  const out = [];
  let pageToken;
  do {
    const page = Calendar.Events.list(CALENDAR_ID, {
      privateExtendedProperty: TAG + '=1',
      singleEvents: true,
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

// A listed Calendar API event -> the fields the plan compares, or null when it is not one of ours or has no usable dates.
// startMs/endMs are only for the window rule (pickExisting_); the hash is kept as metadata only.
function toLive_(item, key) {
  const priv = (item.extendedProperties && item.extendedProperties.private) || {};
  if (priv[TAG] !== '1' || !priv[TAG_ID] || !item.start || !item.end) return null;
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

// PURE: does the live calendar event still show exactly what the feed wants? Compares title, description, location,
// all-day vs timed, and start and end (all-day as day strings; timed as instants, so "10:00-05:00" equals "15:00Z").
function sameEvent_(live, desired) {
  if (normText_(live.summary) !== normText_(desired.title)) return false;
  if (normText_(live.description) !== normText_(desired.description)) return false;
  if (normText_(live.location) !== normText_(desired.location)) return false;
  if (Boolean(live.allDay) !== Boolean(desired.allDay)) return false;
  if (desired.allDay) return live.start === desired.start && live.end === desired.end;
  return Date.parse(live.start) === Date.parse(desired.start) && Date.parse(live.end) === Date.parse(desired.end);
}

// Which synced events the plan may act on: any whose id the feed still has (wherever it sits), plus any that overlap
// the feed's window. A synced event outside the window that the feed no longer lists is left alone (old history stays).
function pickExisting_(rows, desiredIds, winStartMs, winEndMs) {
  return rows.filter(function (r) { return desiredIds[r.id] === true || (r.startMs < winEndMs && r.endMs > winStartMs); });
}

// PURE: what to change. existing = live synced events ({ key, id, summary, description, location, allDay, start, end }),
// desired = the feed's events. Returns { create: event[], update: [{ key, event }], delete: key[], deferred, unchanged }.
// Showing what the feed wants: left alone. Same id but anything different (including edits made in Google): update.
// Id no longer in the feed: delete. Two copies of one id: keep one (a matching copy when there is one), delete the rest.
// Guards: an empty feed never wipes more than 5 events; more than 10 deletes that are also more than half the events
// looked at is refused unless opts.allowMassDelete. Caps: MAX_DELETES deletes and MAX_WRITES changes in all per run;
// the rest is counted in `deferred` and happens on the next run.
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
    if (!matches) keep = 0;
    list.forEach(function (x, i) { if (i !== keep) deletes.push(x.key); });
    if (matches) unchanged++;
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

  // The caps: deletes first (within MAX_DELETES), then updates, then creates, until MAX_WRITES is used up.
  const del = deletes.slice(0, Math.min(MAX_DELETES, MAX_WRITES));
  let budget = MAX_WRITES - del.length;
  const upd = updates.slice(0, budget);
  budget -= upd.length;
  const cre = creates.slice(0, budget);
  const deferred = (deletes.length - del.length) + (updates.length - upd.length) + (creates.length - cre.length);
  return { create: cre, update: upd, delete: del, deferred: deferred, unchanged: unchanged };
}

// Carries out a plan: deletes, then updates, then creates, one API call each. No new write starts once TIME_BUDGET_MS
// has passed since `startedAt` (by `now()`), and the first failed write stops the run; what is left is counted as
// deferred and the next run picks it up. Returns { created, updated, deleted, deferred, stoppedEarly }.
function applyPlan_(plan, api, startedAt, now) {
  const steps = [];
  plan.delete.forEach(function (key) { steps.push({ kind: 'deleted', run: function () { api.remove(key); } }); });
  plan.update.forEach(function (u) { steps.push({ kind: 'updated', run: function () { api.update(u.key, u.event); } }); });
  plan.create.forEach(function (e) { steps.push({ kind: 'created', run: function () { api.insert(e); } }); });
  const done = { created: 0, updated: 0, deleted: 0 };
  let stoppedEarly = false;
  let i = 0;
  for (; i < steps.length; i++) {
    if (now() - startedAt > TIME_BUDGET_MS) { stoppedEarly = true; break; }
    try {
      steps[i].run();
    } catch (err) {
      // One failed write ends the run; its error text is not logged (it may quote event content).
      stoppedEarly = true;
      break;
    }
    done[steps[i].kind]++;
  }
  return { created: done.created, updated: done.updated, deleted: done.deleted, deferred: plan.deferred + (steps.length - i), stoppedEarly: stoppedEarly };
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
// never touched. Run removeTrigger first, or the next sync puts them back. Stops after TIME_BUDGET_MS; run it again.
function deleteSyncedEvents() {
  const startedAt = Date.now();
  const items = listSynced_();
  let n = 0;
  for (let i = 0; i < items.length; i++) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;
    Calendar.Events.remove(CALENDAR_ID, items[i].id);
    n++;
  }
  console.log('Deleted ' + n + ' synced event(s). Hand-made events were not touched.' +
    (n < items.length ? ' Ran out of time with ' + (items.length - n) + ' left: run deleteSyncedEvents again.' : ''));
}
