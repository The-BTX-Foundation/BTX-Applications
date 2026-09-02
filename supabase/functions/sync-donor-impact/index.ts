// sync-donor-impact
//
// Receives a donor_impact row (one reporting cycle) from an external
// Google Apps Script trigger and upserts it into public.donor_impact,
// keyed on cycle_year. Deployed with --no-verify-jwt because Apps
// Script's UrlFetchApp has no Supabase session to attach a JWT to --
// the x-sync-secret header below is the real authentication for this
// endpoint, not Supabase's own JWT check.
//
// Runs with the service role key (see getServiceClient below), so it
// bypasses RLS entirely. That's required here: there's no signed-in
// user for this request to act as, and donor_impact's RLS policies only
// grant INSERT/UPDATE to the "admin" role, which this request can't
// prove it holds any other way.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const DONOR_IMPACT_TABLE = 'donor_impact'

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

// Checks the caller-supplied x-sync-secret header against the SYNC_SECRET
// value set via `supabase secrets set` (this one, unlike the service role
// key above, is NOT auto-injected -- it's specific to this function and
// must be provisioned manually). Three distinct failure cases -- the
// secret isn't configured server-side, the header is missing, or the
// header doesn't match -- are all folded into the same generic result so
// an unauthenticated caller can't use the response to fingerprint which
// case occurred (e.g. learn that the server is misconfigured).
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('SYNC_SECRET')
  const provided = req.headers.get('x-sync-secret')
  return Boolean(expected) && Boolean(provided) && provided === expected
}

// Coerces a value into a finite number for a nullable numeric/integer
// column. undefined/null/'' (field omitted, explicit null, or an empty
// string cell from Sheets) all map to `null` so the column is cleared
// rather than rejected -- every numeric column here is nullable except
// cycle_year, which is checked separately as required. Anything else that
// isn't a clean finite number (a non-numeric string, a bool, an object,
// NaN/Infinity) maps to `undefined`, which callers treat as "reject with
// 400" rather than silently writing a string or NaN into a numeric column.
function parseNumeric(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

// Same as parseNumeric, but additionally rejects non-whole numbers for the
// columns that are Postgres `integer` rather than `numeric` -- e.g. 12.5
// for students_reached would otherwise reach Postgres and fail there with
// a less useful error than the one this function can give up front.
function parseInteger(value: unknown): number | null | undefined {
  const n = parseNumeric(value)
  if (n === null || n === undefined) return n
  return Number.isInteger(n) ? n : undefined
}

// Accepts a real boolean or the common string forms a Google Sheet /
// Apps Script trigger tends to produce -- "TRUE"/"FALSE" from a checkbox
// cell read as text, "true"/"false" from JSON.stringify of a JS boolean.
// Absent/null defaults to false, matching the column's own `default
// false`. Anything else (a number, an unrecognized string) is
// unparseable and maps to `undefined`, same 400-on-write-time convention
// as the numeric parsers above.
function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const v = value.trim().toLowerCase()
    if (v === 'true') return true
    if (v === 'false') return false
  }
  return undefined
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

  // cycle_year is the upsert conflict target, so unlike every other field
  // here it must be present and valid -- there's no "null" way to upsert
  // a row with no key to match on.
  const cycleYear = parseInteger(body.cycle_year)
  if (cycleYear === null || cycleYear === undefined) {
    return json({ success: false, error: 'cycle_year is required and must be a valid whole number' }, 400)
  }

  // Every other field is validated the same way: parse, and if parsing
  // says "unparseable" (undefined, as opposed to a legitimate null),
  // reject immediately rather than writing a partial row. `row` below is
  // built exclusively from these coerced results, never from raw
  // `body` values -- that's what guarantees a stray string can never
  // reach a numeric column.
  const fundsGranted = parseNumeric(body.funds_granted)
  if (fundsGranted === undefined) {
    return json({ success: false, error: 'funds_granted must be a valid number' }, 400)
  }

  const studentsReached = parseInteger(body.students_reached)
  if (studentsReached === undefined) {
    return json({ success: false, error: 'students_reached must be a valid whole number' }, 400)
  }

  const scholarshipsAwarded = parseInteger(body.scholarships_awarded)
  if (scholarshipsAwarded === undefined) {
    return json({ success: false, error: 'scholarships_awarded must be a valid whole number' }, 400)
  }

  const applicantsCount = parseInteger(body.applicants_count)
  if (applicantsCount === undefined) {
    return json({ success: false, error: 'applicants_count must be a valid whole number' }, 400)
  }

  const geographicSpreadCount = parseInteger(body.geographic_spread_count)
  if (geographicSpreadCount === undefined) {
    return json({ success: false, error: 'geographic_spread_count must be a valid whole number' }, 400)
  }

  const scholarshipFundsAwarded = parseNumeric(body.scholarship_funds_awarded)
  if (scholarshipFundsAwarded === undefined) {
    return json({ success: false, error: 'scholarship_funds_awarded must be a valid number' }, 400)
  }

  const otherProgramFundsAwarded = parseNumeric(body.other_program_funds_awarded)
  if (otherProgramFundsAwarded === undefined) {
    return json({ success: false, error: 'other_program_funds_awarded must be a valid number' }, 400)
  }

  const published = parseBoolean(body.published)
  if (published === undefined) {
    return json({ success: false, error: 'published must be a boolean (or "true"/"false")' }, 400)
  }

  const row = {
    cycle_year: cycleYear,
    funds_granted: fundsGranted,
    students_reached: studentsReached,
    scholarships_awarded: scholarshipsAwarded,
    applicants_count: applicantsCount,
    geographic_spread_count: geographicSpreadCount,
    scholarship_funds_awarded: scholarshipFundsAwarded,
    other_program_funds_awarded: otherProgramFundsAwarded,
    published,
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(DONOR_IMPACT_TABLE)
    .upsert(row, { onConflict: 'cycle_year' })
    .select('metric_id, cycle_year')
    .single()

  if (error) {
    return json({ success: false, error: error.message }, 500)
  }

  return json({ success: true, cycle_year: data.cycle_year, metric_id: data.metric_id }, 200)
})
