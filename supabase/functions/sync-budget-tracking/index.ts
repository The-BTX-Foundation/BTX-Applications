// sync-budget-tracking
//
// Receives a budget_tracking row (one reporting month) from an external
// Google Apps Script trigger and upserts it into public.budget_tracking,
// keyed on the (reporting_year, reporting_month) pair. Deployed with
// --no-verify-jwt because Apps Script's UrlFetchApp has no Supabase session
// to attach a JWT to -- the x-sync-secret header below is the real
// authentication for this endpoint, not Supabase's own JWT check.
//
// Runs with the service role key (see getServiceClient below), so it
// bypasses RLS entirely. That's required here: there's no signed-in
// user for this request to act as, and budget_tracking's RLS policies
// only grant INSERT/UPDATE to the "admin" role, which this request can't
// prove it holds any other way.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const BUDGET_TRACKING_TABLE = 'budget_tracking'

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
// BUDGET_TRACKING_SYNC_SECRET value set via `supabase secrets set`. This is
// a distinct secret from the other sync endpoints' secrets -- each sync
// endpoint is authenticated independently so one can be rotated without
// affecting the others. Three distinct failure cases -- the secret isn't
// configured server-side, the header is missing, or the header doesn't
// match -- are all folded into the same generic result so an
// unauthenticated caller can't use the response to fingerprint which case
// occurred (e.g. learn that the server is misconfigured).
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('BUDGET_TRACKING_SYNC_SECRET')
  const provided = req.headers.get('x-sync-secret')
  return Boolean(expected) && Boolean(provided) && provided === expected
}

// Coerces a value into a finite number for a nullable numeric column.
// undefined/null/'' (field omitted, explicit null, or an empty string cell
// from Sheets) all map to `null` so the column is cleared rather than
// rejected -- every numeric column here is nullable except reporting_year
// and reporting_month, which are checked separately as required. Anything
// else that isn't a clean finite number (a non-numeric string, a bool, an
// object, NaN/Infinity) maps to `undefined`, which callers treat as
// "reject with 400" rather than silently writing a string or NaN into a
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

// Same as parseNumeric, but additionally rejects non-whole numbers --
// reporting_year and reporting_month are Postgres `integer` columns, so a
// fractional value would otherwise reach Postgres and fail there with a
// less useful error than the one this function can give up front.
function parseInteger(value: unknown): number | null | undefined {
  const n = parseNumeric(value)
  if (n === null || n === undefined) return n
  return Number.isInteger(n) ? n : undefined
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

  // reporting_year and reporting_month together are the upsert conflict
  // target (budget_tracking_reporting_year_reporting_month_key), so unlike
  // the 13 fields below, BOTH must be present and valid -- there's no
  // "null" way to upsert a row with no complete key to match on.
  const reportingYear = parseInteger(body.reporting_year)
  if (reportingYear === null || reportingYear === undefined) {
    return json({ success: false, error: 'reporting_year is required and must be a valid whole number' }, 400)
  }

  const reportingMonth = parseInteger(body.reporting_month)
  if (reportingMonth === null || reportingMonth === undefined) {
    return json({ success: false, error: 'reporting_month is required and must be a valid whole number' }, 400)
  }

  // Mirrors the table's budget_tracking_reporting_month_check CHECK
  // constraint (reporting_month between 1 and 12) -- caught here so the
  // caller gets a clear 400 instead of a raw Postgres constraint-violation
  // error, same philosophy as the numeric/integer parsing above.
  if (reportingMonth < 1 || reportingMonth > 12) {
    return json({ success: false, error: 'reporting_month must be between 1 and 12' }, 400)
  }

  // The remaining 13 columns are all nullable with no default (confirmed
  // against the live schema, not assumed) -- unlike program_plan_progress's
  // NOT NULL DEFAULT 0 columns, nothing here forces a "required" check.
  // Each is still parsed and rejected on `undefined` (genuinely
  // unparseable, e.g. a stray string), but `null` (omitted/empty/explicit
  // null) passes through and simply clears the column. `row` below is
  // built exclusively from these coerced results, never from raw `body`
  // values -- that's what guarantees a stray string can never reach a
  // numeric column.
  const programExpenses = parseNumeric(body.program_expenses)
  if (programExpenses === undefined) {
    return json({ success: false, error: 'program_expenses must be a valid number' }, 400)
  }

  const overheadExpenses = parseNumeric(body.overhead_expenses)
  if (overheadExpenses === undefined) {
    return json({ success: false, error: 'overhead_expenses must be a valid number' }, 400)
  }

  const fundraisingExpenses = parseNumeric(body.fundraising_expenses)
  if (fundraisingExpenses === undefined) {
    return json({ success: false, error: 'fundraising_expenses must be a valid number' }, 400)
  }

  const currentFundsOnHand = parseNumeric(body.current_funds_on_hand)
  if (currentFundsOnHand === undefined) {
    return json({ success: false, error: 'current_funds_on_hand must be a valid number' }, 400)
  }

  const monthlyOperatingExpense = parseNumeric(body.monthly_operating_expense)
  if (monthlyOperatingExpense === undefined) {
    return json({ success: false, error: 'monthly_operating_expense must be a valid number' }, 400)
  }

  const programsBudgeted = parseNumeric(body.programs_budgeted)
  if (programsBudgeted === undefined) {
    return json({ success: false, error: 'programs_budgeted must be a valid number' }, 400)
  }

  const programsActual = parseNumeric(body.programs_actual)
  if (programsActual === undefined) {
    return json({ success: false, error: 'programs_actual must be a valid number' }, 400)
  }

  const overheadAdminBudgeted = parseNumeric(body.overhead_admin_budgeted)
  if (overheadAdminBudgeted === undefined) {
    return json({ success: false, error: 'overhead_admin_budgeted must be a valid number' }, 400)
  }

  const overheadAdminActual = parseNumeric(body.overhead_admin_actual)
  if (overheadAdminActual === undefined) {
    return json({ success: false, error: 'overhead_admin_actual must be a valid number' }, 400)
  }

  const fundraisingBudgeted = parseNumeric(body.fundraising_budgeted)
  if (fundraisingBudgeted === undefined) {
    return json({ success: false, error: 'fundraising_budgeted must be a valid number' }, 400)
  }

  const fundraisingActual = parseNumeric(body.fundraising_actual)
  if (fundraisingActual === undefined) {
    return json({ success: false, error: 'fundraising_actual must be a valid number' }, 400)
  }

  const marketingBudgeted = parseNumeric(body.marketing_budgeted)
  if (marketingBudgeted === undefined) {
    return json({ success: false, error: 'marketing_budgeted must be a valid number' }, 400)
  }

  const marketingActual = parseNumeric(body.marketing_actual)
  if (marketingActual === undefined) {
    return json({ success: false, error: 'marketing_actual must be a valid number' }, 400)
  }

  const row = {
    reporting_year: reportingYear,
    reporting_month: reportingMonth,
    program_expenses: programExpenses,
    overhead_expenses: overheadExpenses,
    fundraising_expenses: fundraisingExpenses,
    current_funds_on_hand: currentFundsOnHand,
    monthly_operating_expense: monthlyOperatingExpense,
    programs_budgeted: programsBudgeted,
    programs_actual: programsActual,
    overhead_admin_budgeted: overheadAdminBudgeted,
    overhead_admin_actual: overheadAdminActual,
    fundraising_budgeted: fundraisingBudgeted,
    fundraising_actual: fundraisingActual,
    marketing_budgeted: marketingBudgeted,
    marketing_actual: marketingActual,
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(BUDGET_TRACKING_TABLE)
    // Composite conflict target: the pair of columns backing
    // budget_tracking_reporting_year_reporting_month_key, same shape as
    // fundraising_health's period_year/period_month key.
    .upsert(row, { onConflict: 'reporting_year,reporting_month' })
    .select('id, reporting_year, reporting_month')
    .single()

  if (error) {
    return json({ success: false, error: error.message }, 500)
  }

  return json(
    { success: true, reporting_year: data.reporting_year, reporting_month: data.reporting_month, id: data.id },
    200,
  )
})
