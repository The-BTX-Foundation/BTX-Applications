// sync-grant-pipeline
//
// Receives a grant_pipeline row from an external Google Apps Script trigger
// and upserts it into public.grant_pipeline, keyed on the (grant_name,
// funder) pair. Deployed with --no-verify-jwt because Apps Script's
// UrlFetchApp has no Supabase session to attach a JWT to -- the
// x-sync-secret header below is the real authentication for this endpoint,
// not Supabase's own JWT check.
//
// Runs with the service role key (see getServiceClient below), so it
// bypasses RLS entirely. That's required here: there's no signed-in
// user for this request to act as, and grant_pipeline's RLS policies
// only grant INSERT/UPDATE to the "admin" role, which this request can't
// prove it holds any other way.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const GRANT_PIPELINE_TABLE = 'grant_pipeline'

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
// GRANT_PIPELINE_SYNC_SECRET value set via `supabase secrets set`. This is
// a distinct secret from the other sync endpoints' secrets -- each sync
// endpoint is authenticated independently so one can be rotated without
// affecting the others. Three distinct failure cases -- the secret isn't
// configured server-side, the header is missing, or the header doesn't
// match -- are all folded into the same generic result so an
// unauthenticated caller can't use the response to fingerprint which case
// occurred (e.g. learn that the server is misconfigured).
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('GRANT_PIPELINE_SYNC_SECRET')
  const provided = req.headers.get('x-sync-secret')
  return Boolean(expected) && Boolean(provided) && provided === expected
}

// Validates a required text column (grant_name, funder). Rejects
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

// Coerces a value into a finite number for the nullable amount column.
// undefined/null/'' (field omitted, explicit null, or an empty string cell
// from Sheets) all map to `null` so the column is cleared rather than
// rejected. Anything else that isn't a clean finite number (a non-numeric
// string, a bool, an object, NaN/Infinity) maps to `undefined`, which the
// caller treats as "reject with 400" rather than silently writing a string
// or NaN into a numeric column.
function parseNumeric(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

const VALID_GRANT_STATUSES = ['Submitted', 'Pending', 'Awarded', 'Declined']

// Validates the nullable status column against the table's own
// grant_pipeline_status_check CHECK constraint. Omitted/empty/explicit
// null all map to null (clears the column), same as every other nullable
// field. A present value must match one of the four constraint values
// exactly -- case-sensitive, not normalized -- because the CHECK
// constraint itself is a plain string-equality test (status = ANY (ARRAY[
// 'Submitted','Pending','Awarded','Declined'])) with no case folding, so
// "submitted" would fail at the database level exactly as written here.
// Silently accepting lowercase and rewriting it to "Submitted" would mask
// a real data-quality problem in the source spreadsheet (whoever typed
// lowercase meant something, even if it was just a typo) rather than
// surfacing it as a clear 400 -- the same philosophy as rejecting an
// out-of-range reporting_month instead of clamping it.
function parseGrantStatus(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return undefined
  return VALID_GRANT_STATUSES.includes(value) ? value : undefined
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

  // grant_name and funder together are the upsert conflict target
  // (grant_pipeline_grant_name_funder_key), so unlike amount/status, both
  // must be present and valid -- there's no "null" way to upsert a row
  // with no complete key to match on.
  const grantName = parseRequiredString(body.grant_name)
  if (grantName === undefined) {
    return json({ success: false, error: 'grant_name is required and must be a non-empty string' }, 400)
  }

  const funder = parseRequiredString(body.funder)
  if (funder === undefined) {
    return json({ success: false, error: 'funder is required and must be a non-empty string' }, 400)
  }

  const amount = parseNumeric(body.amount)
  if (amount === undefined) {
    return json({ success: false, error: 'amount must be a valid number' }, 400)
  }

  const status = parseGrantStatus(body.status)
  if (status === undefined) {
    return json({ success: false, error: 'status must be one of Submitted, Pending, Awarded, Declined' }, 400)
  }

  const row = {
    grant_name: grantName,
    funder,
    amount,
    status,
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(GRANT_PIPELINE_TABLE)
    // Composite conflict target: the two columns backing
    // grant_pipeline_grant_name_funder_key, same shape as fundraising_health's
    // period_year/period_month key.
    .upsert(row, { onConflict: 'grant_name,funder' })
    .select('id, grant_name, funder')
    .single()

  if (error) {
    return json({ success: false, error: error.message }, 500)
  }

  return json({ success: true, grant_name: data.grant_name, funder: data.funder, id: data.id }, 200)
})
