// sync-event-tracker-events
//
// Receives an event row from an external Google Apps Script trigger and
// upserts it into public.event_tracker_events, keyed on the
// (event_date, category, event_name) triple. Deployed with --no-verify-jwt
// because Apps Script's UrlFetchApp has no Supabase session to attach a JWT
// to -- the x-sync-secret header below is the real authentication for this
// endpoint, not Supabase's own JWT check.
//
// Runs with the service role key (see getServiceClient below), so it
// bypasses RLS entirely. That's required here: there's no signed-in
// user for this request to act as, and event_tracker_events's RLS policies
// only grant INSERT/UPDATE to the "admin" role, which this request can't
// prove it holds any other way.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const EVENT_TRACKER_EVENTS_TABLE = 'event_tracker_events'

// Wraps a JSON body and status into a Response, used for every reply
// this function makes.
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

// Builds a Supabase client authenticated as the service role. SUPABASE_URL
// and SUPABASE_SERVICE_ROLE_KEY are injected automatically into every Edge
// Function by the platform -- they are never set via `supabase secrets
// set` and never appear in this file. persistSession is turned off because
// there's no browser/session storage in this stateless environment to
// persist to.
function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not available in the function environment')
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } })
}

// Checks the caller-supplied x-sync-secret header against the
// EVENT_TRACKER_SYNC_SECRET value set via `supabase secrets set`. This is a
// distinct secret from the other sync endpoints' secrets -- each sync
// endpoint is authenticated independently so one can be rotated without
// affecting the others. Three distinct failure cases -- the secret isn't
// configured server-side, the header is missing, or the header doesn't
// match -- are all folded into the same generic result so an
// unauthenticated caller can't use the response to fingerprint which case
// occurred (e.g. learn that the server is misconfigured).
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('EVENT_TRACKER_SYNC_SECRET')
  const provided = req.headers.get('x-sync-secret')
  return Boolean(expected) && Boolean(provided) && provided === expected
}

// Extracts a bare 'YYYY-MM-DD' calendar date from event_date, whichever of
// the two shapes Apps Script sends: a plain date string, or the full
// ISO-8601 timestamp JSON.stringify(Date) produces (e.g.
// "2026-03-05T00:00:00.000Z") from stringifying a Sheets date cell's
// underlying Date object. Deliberately never constructs a JS Date from the
// input and reads getFullYear()/getMonth()/getDate() back off it -- that
// round trip is exactly what Event Calendar's day-click modal (dueLabel())
// avoids, since a bare date string run through `new Date(str)` is parsed as
// UTC midnight, and local getters can then shift the day depending on the
// runtime's own timezone. The calendar day this function cares about is
// just the leading YYYY-MM-DD digits of whichever string arrives, so this
// only ever does string matching against the raw components.
function parseEventDate(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return undefined
  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)

  // Confirms the digits form a real calendar date (rejects e.g.
  // 2026-02-30). Date.UTC/getUTC* are used purely as a calendar
  // calculator here, read back with UTC-only methods so the check can't
  // be skewed by the function runtime's own timezone -- the captured
  // strings above, not this Date object, are what actually get stored.
  const check = new Date(Date.UTC(year, month - 1, day))
  const isValidCalendarDate =
    check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
  if (!isValidCalendarDate) return undefined

  return `${yearStr}-${monthStr}-${dayStr}`
}

// Validates a required text column (category, event_name). Rejects
// non-strings, empty strings, and whitespace-only strings with a clear 400
// rather than writing blank/garbage values into a column that's part of
// the upsert conflict target. Returns the trimmed value so accidental
// leading/trailing whitespace from a Sheets cell can't create a duplicate
// row against the composite key.
function parseRequiredString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  // Checked before the body is even parsed -- an unauthenticated caller
  // shouldn't get feedback about whether their JSON was well-formed.
  if (!isAuthorized(req)) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ success: false, error: 'Request body must be valid JSON' }, 400)
  }

  // event_date, category, and event_name together are the upsert conflict
  // target (event_tracker_events' three-column UNIQUE constraint), so
  // unlike a single-column key, all three must be present and valid --
  // there's no "null" way to upsert a row with no complete key to match on.
  const eventDate = parseEventDate(body.event_date)
  if (eventDate === undefined) {
    return json({ success: false, error: 'event_date is required and must be a valid YYYY-MM-DD date' }, 400)
  }

  const category = parseRequiredString(body.category)
  if (category === undefined) {
    return json({ success: false, error: 'category is required and must be a non-empty string' }, 400)
  }

  const eventName = parseRequiredString(body.event_name)
  if (eventName === undefined) {
    return json({ success: false, error: 'event_name is required and must be a non-empty string' }, 400)
  }

  const row = {
    event_date: eventDate,
    category,
    event_name: eventName,
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(EVENT_TRACKER_EVENTS_TABLE)
    // Composite conflict target: the three columns backing
    // event_tracker_events' UNIQUE constraint, not a single or double
    // column like the other sync functions' keys.
    .upsert(row, { onConflict: 'event_date,category,event_name' })
    .select('id, event_date, category, event_name')
    .single()

  if (error) {
    return json({ success: false, error: error.message }, 500)
  }

  return json(
    { success: true, event_date: data.event_date, category: data.category, event_name: data.event_name, id: data.id },
    200,
  )
})
