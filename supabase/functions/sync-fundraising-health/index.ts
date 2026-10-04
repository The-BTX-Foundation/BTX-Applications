// sync-fundraising-health
//
// Receives a fundraising_health row (one reporting month) from an external
// Google Apps Script trigger and upserts it into public.fundraising_health,
// keyed on the (period_year, period_month) pair. Deployed with
// --no-verify-jwt because Apps Script's UrlFetchApp has no Supabase session
// to attach a JWT to -- the x-sync-secret header below is the real
// authentication for this endpoint, not Supabase's own JWT check.
//
// Runs with the service role key (see getServiceClient below), so it
// bypasses RLS entirely. That's required here: there's no signed-in
// user for this request to act as, and fundraising_health's RLS policies
// only grant INSERT/UPDATE to the "admin" role, which this request can't
// prove it holds any other way.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const FUNDRAISING_HEALTH_TABLE = 'fundraising_health'

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
// FUNDRAISING_SYNC_SECRET value set via `supabase secrets set`. This is a
// distinct secret from sync-donor-impact's SYNC_SECRET -- the two sync
// endpoints are authenticated independently so one can be rotated without
// affecting the other. Three distinct failure cases -- the secret isn't
// configured server-side, the header is missing, or the header doesn't
// match -- are all folded into the same generic result so an
// unauthenticated caller can't use the response to fingerprint which case
// occurred (e.g. learn that the server is misconfigured).
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('FUNDRAISING_SYNC_SECRET')
  const provided = req.headers.get('x-sync-secret')
  return Boolean(expected) && Boolean(provided) && provided === expected
}

// Coerces a value into a finite number for a nullable numeric/integer
// column. undefined/null/'' (field omitted, explicit null, or an empty
// string cell from Sheets) all map to `null` so the column is cleared
// rather than rejected -- every numeric column here is nullable except
// period_year and period_month, which are checked separately as required.
// Anything else that isn't a clean finite number (a non-numeric string, a
// bool, an object, NaN/Infinity) maps to `undefined`, which callers treat
// as "reject with 400" rather than silently writing a string or NaN into a
// numeric column.
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
// for new_donors would otherwise reach Postgres and fail there with a less
// useful error than the one this function can give up front.
function parseInteger(value: unknown): number | null | undefined {
  const n = parseNumeric(value)
  if (n === null || n === undefined) return n
  return Number.isInteger(n) ? n : undefined
}

// fundraising_health has no boolean column (unlike donor_impact's
// `published`), so there is no parseBoolean here -- intentionally omitted
// rather than left unused.

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

  // period_year and period_month together are the upsert conflict target
  // (fundraising_health_period_year_period_month_key), so unlike
  // donor_impact's single cycle_year, BOTH must be present and valid --
  // there's no "null" way to upsert a row with no complete key to match on.
  const periodYear = parseInteger(body.period_year)
  if (periodYear === null || periodYear === undefined) {
    return json({ success: false, error: 'period_year is required and must be a valid whole number' }, 400)
  }

  const periodMonth = parseInteger(body.period_month)
  if (periodMonth === null || periodMonth === undefined) {
    return json({ success: false, error: 'period_month is required and must be a valid whole number' }, 400)
  }

  // Mirrors the table's fundraising_health_period_month_check CHECK
  // constraint (period_month between 1 and 12) -- caught here so the
  // caller gets a clear 400 instead of a raw Postgres constraint-violation
  // error, same philosophy as the numeric/integer parsing above.
  if (periodMonth < 1 || periodMonth > 12) {
    return json({ success: false, error: 'period_month must be between 1 and 12' }, 400)
  }

  // Every other field is validated the same way: parse, and if parsing
  // says "unparseable" (undefined, as opposed to a legitimate null),
  // reject immediately rather than writing a partial row. `row` below is
  // built exclusively from these coerced results, never from raw
  // `body` values -- that's what guarantees a stray string can never
  // reach a numeric column.
  const individualDonors = parseNumeric(body.individual_donors)
  if (individualDonors === undefined) {
    return json({ success: false, error: 'individual_donors must be a valid number' }, 400)
  }

  const corporatePartnerships = parseNumeric(body.corporate_partnerships)
  if (corporatePartnerships === undefined) {
    return json({ success: false, error: 'corporate_partnerships must be a valid number' }, 400)
  }

  const grantsRevenue = parseNumeric(body.grants_revenue)
  if (grantsRevenue === undefined) {
    return json({ success: false, error: 'grants_revenue must be a valid number' }, 400)
  }

  const eventsRevenue = parseNumeric(body.events_revenue)
  if (eventsRevenue === undefined) {
    return json({ success: false, error: 'events_revenue must be a valid number' }, 400)
  }

  const annualGoal = parseNumeric(body.annual_goal)
  if (annualGoal === undefined) {
    return json({ success: false, error: 'annual_goal must be a valid number' }, 400)
  }

  const donorRetentionRate = parseNumeric(body.donor_retention_rate)
  if (donorRetentionRate === undefined) {
    return json({ success: false, error: 'donor_retention_rate must be a valid number' }, 400)
  }

  const averageGiftSize = parseNumeric(body.average_gift_size)
  if (averageGiftSize === undefined) {
    return json({ success: false, error: 'average_gift_size must be a valid number' }, 400)
  }

  const medianGiftSize = parseNumeric(body.median_gift_size)
  if (medianGiftSize === undefined) {
    return json({ success: false, error: 'median_gift_size must be a valid number' }, 400)
  }

  const newDonors = parseInteger(body.new_donors)
  if (newDonors === undefined) {
    return json({ success: false, error: 'new_donors must be a valid whole number' }, 400)
  }

  const recurringDonors = parseInteger(body.recurring_donors)
  if (recurringDonors === undefined) {
    return json({ success: false, error: 'recurring_donors must be a valid whole number' }, 400)
  }

  const row = {
    period_year: periodYear,
    period_month: periodMonth,
    individual_donors: individualDonors,
    corporate_partnerships: corporatePartnerships,
    grants_revenue: grantsRevenue,
    events_revenue: eventsRevenue,
    annual_goal: annualGoal,
    donor_retention_rate: donorRetentionRate,
    average_gift_size: averageGiftSize,
    median_gift_size: medianGiftSize,
    new_donors: newDonors,
    recurring_donors: recurringDonors,
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(FUNDRAISING_HEALTH_TABLE)
    // Composite conflict target: the pair of columns backing
    // fundraising_health_period_year_period_month_key, not a single column
    // like donor_impact's 'cycle_year'.
    .upsert(row, { onConflict: 'period_year,period_month' })
    // fundraising_health's primary key column is `id` (a plain uuid),
    // unlike donor_impact's `metric_id`.
    .select('id, period_year, period_month')
    .single()

  if (error) {
    return json({ success: false, error: error.message }, 500)
  }

  return json({ success: true, period_year: data.period_year, period_month: data.period_month, id: data.id }, 200)
})
