// sync-program-plan-progress
//
// Receives a program_plan_progress row (one plan year's milestone/task
// counters) from an external Google Apps Script trigger and upserts it into
// public.program_plan_progress, keyed on plan_year. Deployed with
// --no-verify-jwt because Apps Script's UrlFetchApp has no Supabase session
// to attach a JWT to -- the x-sync-secret header below is the real
// authentication for this endpoint, not Supabase's own JWT check.
//
// Runs with the service role key (see getServiceClient below), so it
// bypasses RLS entirely. That's required here: there's no signed-in
// user for this request to act as, and program_plan_progress's RLS
// policies only grant INSERT/UPDATE to the "admin" role, which this
// request can't prove it holds any other way.
//
// Validation here deliberately diverges from sync-donor-impact and
// sync-fundraising-health: see the "required, not optional" note below
// parseInteger for why.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const PROGRAM_PLAN_PROGRESS_TABLE = 'program_plan_progress'

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
// PROGRAM_PLAN_SYNC_SECRET value set via `supabase secrets set`. This is a
// distinct secret from SYNC_SECRET and FUNDRAISING_SYNC_SECRET -- all three
// sync endpoints are authenticated independently so one can be rotated
// without affecting the others. Three distinct failure cases -- the secret
// isn't configured server-side, the header is missing, or the header
// doesn't match -- are all folded into the same generic result so an
// unauthenticated caller can't use the response to fingerprint which case
// occurred (e.g. learn that the server is misconfigured).
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('PROGRAM_PLAN_SYNC_SECRET')
  const provided = req.headers.get('x-sync-secret')
  return Boolean(expected) && Boolean(provided) && provided === expected
}

// Coerces a value into a finite number. undefined/null/'' (field omitted,
// explicit null, or an empty string cell from Sheets) map to `null` --
// callers here still branch on that the same way the reference functions
// do, but every column on this table is NOT NULL, so every caller below
// treats a `null` result as "missing" and rejects it, same as `undefined`.
// Anything else that isn't a clean finite number (a non-numeric string, a
// bool, an object, NaN/Infinity) maps to `undefined`.
function parseNumeric(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined
  if (typeof value === 'string') {
    const n = Number(value)
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

// Same as parseNumeric, but additionally rejects non-whole numbers -- every
// column on this table is a Postgres `integer`, so e.g. 12.5 for
// tasks_complete would otherwise reach Postgres and fail there with a less
// useful error than the one this function can give up front.
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

  // plan_year is the upsert conflict target, so unlike every other field
  // here it must be present and valid -- there's no "null" way to upsert
  // a row with no key to match on. Same role as cycle_year/period_year in
  // the reference functions.
  const planYear = parseInteger(body.plan_year)
  if (planYear === null || planYear === undefined) {
    return json({ success: false, error: 'plan_year is required and must be a valid whole number' }, 400)
  }

  // Required-fields design fork vs. sync-donor-impact/sync-fundraising-health:
  // in those two functions, every non-key numeric column is NULLABLE, so an
  // omitted field parses to `null` and that `null` is written as-is -- it's
  // a legitimate "clear this column" value. Every counter column on
  // program_plan_progress is `integer NOT NULL DEFAULT 0`, so `null` is not
  // a legal value to write here; naively reusing the reference pattern
  // would let a caller's `null` reach Postgres and fail as a raw
  // NOT-NULL-violation 500 instead of a clean 400.
  //
  // The fallback of silently writing the column's own default (0) instead
  // of rejecting was considered and rejected: these six fields describe one
  // coherent snapshot of a single plan's progress, not independent
  // metrics a caller might legitimately submit only some of (contrast
  // donor_impact's Engagement/Outcomes/Equity/Stewardship groups, which
  // really can arrive independently). An omitted field here is
  // indistinguishable from a caller bug -- e.g. an Apps Script column
  // rename -- and defaulting it to 0 would silently overwrite a
  // previously-nonzero progress value with "0 complete" on a dashboard
  // humans read. So every field below is required: missing or unparseable
  // is a 400, exactly like plan_year, rather than null-tolerant like the
  // reference functions' non-key fields.
  const milestonesComplete = parseInteger(body.milestones_complete)
  if (milestonesComplete === null || milestonesComplete === undefined) {
    return json({ success: false, error: 'milestones_complete is required and must be a valid whole number' }, 400)
  }

  const milestonesTotal = parseInteger(body.milestones_total)
  if (milestonesTotal === null || milestonesTotal === undefined) {
    return json({ success: false, error: 'milestones_total is required and must be a valid whole number' }, 400)
  }

  const tasksComplete = parseInteger(body.tasks_complete)
  if (tasksComplete === null || tasksComplete === undefined) {
    return json({ success: false, error: 'tasks_complete is required and must be a valid whole number' }, 400)
  }

  const tasksTotal = parseInteger(body.tasks_total)
  if (tasksTotal === null || tasksTotal === undefined) {
    return json({ success: false, error: 'tasks_total is required and must be a valid whole number' }, 400)
  }

  const tasksInProgress = parseInteger(body.tasks_in_progress)
  if (tasksInProgress === null || tasksInProgress === undefined) {
    return json({ success: false, error: 'tasks_in_progress is required and must be a valid whole number' }, 400)
  }

  const tasksNotStarted = parseInteger(body.tasks_not_started)
  if (tasksNotStarted === null || tasksNotStarted === undefined) {
    return json({ success: false, error: 'tasks_not_started is required and must be a valid whole number' }, 400)
  }

  // Sanity checks: program_plan_progress has no CHECK constraints at all
  // (unlike fundraising_health's period_month range, which at least has a
  // DB-level backstop), so these logically-impossible values -- more
  // complete than the total they're counted out of -- would otherwise
  // write silently. Caught here so the caller gets a clear 400 instead.
  // Deliberately narrow: this does NOT check that
  // tasks_complete + tasks_in_progress + tasks_not_started == tasks_total,
  // since that's a stricter invariant than "complete can't exceed total"
  // and risks rejecting valid payloads whose source computes those three
  // categories independently.
  if (milestonesComplete > milestonesTotal) {
    return json({ success: false, error: 'milestones_complete cannot exceed milestones_total' }, 400)
  }

  if (tasksComplete > tasksTotal) {
    return json({ success: false, error: 'tasks_complete cannot exceed tasks_total' }, 400)
  }

  const row = {
    plan_year: planYear,
    milestones_complete: milestonesComplete,
    milestones_total: milestonesTotal,
    tasks_complete: tasksComplete,
    tasks_total: tasksTotal,
    tasks_in_progress: tasksInProgress,
    tasks_not_started: tasksNotStarted,
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from(PROGRAM_PLAN_PROGRESS_TABLE)
    .upsert(row, { onConflict: 'plan_year' })
    // program_plan_progress's primary key column is `id` (a plain uuid),
    // same as fundraising_health, unlike donor_impact's `metric_id`.
    .select('id, plan_year')
    .single()

  if (error) {
    return json({ success: false, error: error.message }, 500)
  }

  return json({ success: true, plan_year: data.plan_year, id: data.id }, 200)
})
