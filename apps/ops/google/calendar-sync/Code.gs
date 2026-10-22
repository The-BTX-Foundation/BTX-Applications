// BTX Ops Hub -> Google Calendar sync (one way). Runs as info@thebtxfoundation.org in Google Apps Script.
// Every 10 minutes syncNow() fetches the Ops Hub's feed (GET /api/calendar-sync, proven with this script's Google
// identity token) and makes the shared calendar match it. It only ever touches events it created: those carry a private
// tag (TAG_ID) holding the Ops Hub id. Events people add by hand have no tag and are never read, changed or deleted.
// Setup, pausing and undoing: README.md next to this file. Logs hold counts only, never titles or tokens.

const FEED_URL = 'https://btx-ops-azure.vercel.app/api/calendar-sync';
const CALENDAR_ID = 'info@thebtxfoundation.org';
const TAG_ID = 'btxSyncId';
const TAG_HASH = 'btxSyncHash';
const MAX_DELETES = 40;
const MAX_WRITES = 150;
const TIME_ZONE = 'America/New_York';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

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

// The sync itself: fetch the feed, compare with the tagged events in the calendar, then delete, update and create.
function syncNow() {
  // One run at a time: a manual run overlapping the timer could otherwise create the same event twice.
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    console.log('Another sync is running; skipped this one.');
    return;
  }
  try {
    const feed = fetchFeed_();
    const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
    if (!calendar) throw new Error('Calendar not found: ' + CALENDAR_ID);
    const winStart = dayStart_(feed.windowStart).getTime();
    const winEnd = dayStart_(feed.windowEnd).getTime();
    // Listed two days wider on each side, so an event sitting right on an edge is always found (never created twice).
    const listed = calendar.getEvents(new Date(winStart - 2 * DAY_MS), new Date(winEnd + 2 * DAY_MS));
    const rows = [];
    listed.forEach(function (ev, i) {
      const id = ev.getTag(TAG_ID);
      if (!id) return; // made by hand: never touched
      const allDay = ev.isAllDayEvent();
      rows.push({
        key: i,
        id: id,
        hash: ev.getTag(TAG_HASH) || '',
        startMs: (allDay ? ev.getAllDayStartDate() : ev.getStartTime()).getTime(),
        endMs: (allDay ? ev.getAllDayEndDate() : ev.getEndTime()).getTime(),
      });
    });
    const desiredIds = {};
    feed.events.forEach(function (e) { desiredIds[e.id] = true; });
    const plan = planSync(pickExisting_(rows, desiredIds, winStart, winEnd), feed.events);

    plan.delete.forEach(function (key) { listed[key].deleteEvent(); });
    // An update is delete + recreate: simplest, and it handles a timed event becoming all-day (or back).
    plan.update.forEach(function (u) {
      listed[u.key].deleteEvent();
      createSynced_(calendar, u.event);
    });
    plan.create.forEach(function (e) { createSynced_(calendar, e); });
    console.log('created ' + plan.create.length + ', updated ' + plan.update.length + ', deleted ' + plan.delete.length +
      ', skipped (unchanged) ' + plan.unchanged + ', deferred to next run ' + plan.deferred);
  } finally {
    lock.releaseLock();
  }
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
      typeof e.start === 'string' && typeof e.end === 'string' && typeof e.allDay === 'boolean';
    if (!ok) throw new Error('Feed has a malformed event');
  });
  return feed;
}

// "2026-11-02" -> midnight at the start of that day in Eastern time.
function dayStart_(day) {
  if (!DAY_RE.test(day)) throw new Error('Not a day: ' + day);
  return Utilities.parseDate(day, TIME_ZONE, 'yyyy-MM-dd');
}

// "2026-11-02" -> "2026-11-03" (plain calendar arithmetic).
function nextDay_(day) {
  const p = day.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + 1)).toISOString().slice(0, 10);
}

// Creates one feed event in the calendar and tags it as ours (the id to match it next time, the hash to spot changes).
function createSynced_(calendar, e) {
  const options = { description: e.description || '', location: e.location || '' };
  let ev;
  if (e.allDay) {
    // The feed's end day is exclusive (Google's rule). A one-day event uses the one-date form; a longer one passes the
    // exclusive end date, which createAllDayEvent(title, startDate, endDate) also treats as exclusive.
    ev = nextDay_(e.start) === e.end
      ? calendar.createAllDayEvent(e.title, dayStart_(e.start), options)
      : calendar.createAllDayEvent(e.title, dayStart_(e.start), dayStart_(e.end), options);
  } else {
    ev = calendar.createEvent(e.title, new Date(e.start), new Date(e.end), options);
  }
  ev.setTag(TAG_ID, e.id);
  ev.setTag(TAG_HASH, e.hash);
}

// Which tagged events the plan may act on: any whose id the feed still has (wherever it sits), plus any that overlap
// the feed's window. A tagged event outside the window that the feed no longer lists is left alone (old history stays).
// rows: [{ key, id, hash, startMs, endMs }] -> [{ key, id, hash }].
function pickExisting_(rows, desiredIds, winStartMs, winEndMs) {
  return rows
    .filter(function (r) { return desiredIds[r.id] === true || (r.startMs < winEndMs && r.endMs > winStartMs); })
    .map(function (r) { return { key: r.key, id: r.id, hash: r.hash }; });
}

// PURE: what to change. existing = [{ key, id, hash }] (tagged events only), desired = the feed's events.
// Returns { create: event[], update: [{ key, event }], delete: key[], deferred, unchanged }.
// Same id, same hash: left alone. Same id, new hash: update. Id no longer in the feed: delete. Two copies of one id:
// keep one (the up-to-date copy when there is one) and delete the rest. At most MAX_DELETES deletes and MAX_WRITES
// changes in all per run; the rest is counted in `deferred` and happens on the next run.
function planSync(existing, desired) {
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
    let keep = list.findIndex(function (x) { return x.hash === e.hash; });
    if (keep < 0) keep = 0;
    list.forEach(function (x, i) { if (i !== keep) deletes.push(x.key); });
    if (list[keep].hash === e.hash) unchanged++;
    else updates.push({ key: list[keep].key, event: e });
  });
  const creates = [];
  const seen = {};
  desired.forEach(function (e) {
    if (!copies[e.id] && !seen[e.id]) creates.push(e);
    seen[e.id] = true;
  });

  // The caps: deletes first (within MAX_DELETES), then updates, then creates, until MAX_WRITES is used up.
  const del = deletes.slice(0, Math.min(MAX_DELETES, MAX_WRITES));
  let budget = MAX_WRITES - del.length;
  const upd = updates.slice(0, budget);
  budget -= upd.length;
  const cre = creates.slice(0, budget);
  const deferred = (deletes.length - del.length) + (updates.length - upd.length) + (creates.length - cre.length);
  return { create: cre, update: upd, delete: del, deferred: deferred, unchanged: unchanged };
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

// Rollback step 2: deletes every event this script created (tagged), from 400 days ago to 800 days ahead.
// Hand-made events have no tag and are never touched. Run removeTrigger first, or the next sync puts them back.
function deleteSyncedEvents() {
  const calendar = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!calendar) throw new Error('Calendar not found: ' + CALENDAR_ID);
  const now = Date.now();
  const events = calendar.getEvents(new Date(now - 400 * DAY_MS), new Date(now + 800 * DAY_MS));
  let n = 0;
  events.forEach(function (ev) {
    if (!ev.getTag(TAG_ID)) return;
    ev.deleteEvent();
    n++;
  });
  console.log('Deleted ' + n + ' synced event(s). Hand-made events were not touched.');
}
