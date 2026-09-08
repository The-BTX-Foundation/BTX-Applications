// sync-program-plan-milestones
//
// Receives one plan year's full milestone list from the Program Planning
// Apps Script (the same yearBuckets pass that already builds the
// sync-program-plan-progress aggregate row, via bucket.milestoneNames/
// bucket.milestoneComplete -- previously computed and then discarded after
// a Logger.log) and replaces public.program_plan_milestones' rows for that
// plan_year with the incoming list. Deployed with --no-verify-jwt for the
// same reason as every other sync function: Apps Script's UrlFetchApp has
// no Supabase session to attach a JWT to, so the x-sync-secret header below
// is the real authentication here, not Supabase's own JWT check.
//
// Runs with the service role key (see getServiceClient below), so it
// bypasses RLS entirely -- required here since there's no signed-in user
// for this request to act as, same as sync-program-plan-progress.
//
// First sync function to receive an array instead of a single row, and the
// first to delete rows rather than only upsert. Both are called out inline
// below where they diverge from the established single-row pattern.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const PROGRAM_PLAN_MILESTONES_TABLE = 'program_plan_milestones'

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
// PROGRAM_PLAN_MILESTONES_SYNC_SECRET value set via `supabase secrets set`.
// A distinct secret from PROGRAM_PLAN_SYNC_SECRET -- every sync endpoint in
// this project is authenticated independently so one can be rotated without
// affecting the others, even though the Apps Script currently happens to
// send the same secret value to both (one script, one Supabase project, not
// two independent integrations the way donor_impact/fundraising_health
// are). Three distinct failure cases -- the secret isn't configured
// server-side, the header is missing, or the header doesn't match -- are
// all folded into the same generic result so an unauthenticated caller
// can't use the response to fingerprint which case occurred.
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('PROGRAM_PLAN_MILESTONES_SYNC_SECRET')
  const provided = req.headers.get('x-sync-secret')
  return Boolean(expected) && Boolean(provided) && provided === expected
}

// Coerces a value into a finite whole number. undefined/null/'' all map to
// `null` (missing); anything else that isn't a clean whole number maps to
// `undefined` (invalid). Same shape as sync-program-plan-progress's
// parseInteger, duplicated rather than shared since these Edge Functions
// each deploy as an independent, self-contained Deno module.
function parseInteger(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return Number.isInteger(n) ? n : undefined
}

// Validates and normalizes one raw milestone entry from the request body.
// Returns the cleaned { milestoneName, isComplete } pair, or a string
// naming what was wrong with it -- the caller turns that string into a 400
// that identifies which array index failed, rather than a generic
// "milestones is invalid" that would leave the Apps Script author guessing.
// milestone_name must be non-empty after trimming (an all-whitespace name
// would otherwise upsert successfully but be unselectable/confusing in the
// UI); is_complete must be a real JSON boolean, not a truthy/falsy value --
// the Apps Script always sends a genuine JS boolean here (see
// bucket.milestoneComplete), so accepting e.g. the string 'true' would only
// mask a caller bug instead of catching it.
function parseMilestoneEntry(entry: unknown): { milestoneName: string; isComplete: boolean } | string {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return 'must be an object'
  }
  const record = entry as Record<string, unknown>

  const rawName = record.milestone_name
  if (typeof rawName !== 'string' || rawName.trim() === '') {
    return 'milestone_name is required and must be a non-empty string'
  }

  if (typeof record.is_complete !== 'boolean') {
    return 'is_complete is required and must be a boolean'
  }

  return { milestoneName: rawName.trim(), isComplete: record.is_complete }
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

  // plan_year scopes both the upsert and the stale-milestone delete below,
  // so unlike an individual milestone it has no "reject just this part"
  // fallback -- there's no request left to act on without it.
  const planYear = parseInteger(body.plan_year)
  if (planYear === null || planYear === undefined) {
    return json({ success: false, error: 'plan_year is required and must be a valid whole number' }, 400)
  }

  if (!Array.isArray(body.milestones)) {
    return json({ success: false, error: 'milestones is required and must be an array' }, 400)
  }

  // All-or-nothing validation: this array is one coherent snapshot of "every
  // milestone this plan year currently has," the same way
  // sync-program-plan-progress's six counters are one coherent snapshot of
  // a single plan's progress (see that function's comment on why it
  // rejects rather than defaults missing fields). A partially-valid list
  // has no safe partial action here -- silently dropping the one bad entry
  // and upserting the rest would then make that milestone a delete
  // candidate below (it's "missing from the incoming list" from the
  // cleanup step's point of view), permanently losing a real milestone row
  // over what might just be a sheet typo. Rejecting the whole request lets
  // the Apps Script author fix the sheet and re-run instead.
  const milestones: { milestoneName: string; isComplete: boolean }[] = []
  for (let i = 0; i < body.milestones.length; i++) {
    const parsed = parseMilestoneEntry(body.milestones[i])
    if (typeof parsed === 'string') {
      return json({ success: false, error: `milestones[${i}] ${parsed}` }, 400)
    }
    milestones.push(parsed)
  }

  const supabase = getServiceClient()

  // Read the plan year's current rows first, before writing anything --
  // this is the "before" snapshot the stale-milestone cleanup below diffs
  // against. Reading before the upsert (rather than after) means a
  // milestone name that's brand new this sync can never accidentally show
  // up in this snapshot and get treated as something to keep-or-delete;
  // it's simply absent from both sides of the diff until the upsert below
  // creates it.
  const { data: existingRows, error: readError } = await supabase
    .from(PROGRAM_PLAN_MILESTONES_TABLE)
    .select('id, milestone_name')
    .eq('plan_year', planYear)

  if (readError) {
    return json({ success: false, error: readError.message }, 500)
  }

  const incomingNames = new Set(milestones.map((m) => m.milestoneName))

  if (milestones.length > 0) {
    const rows = milestones.map((m) => ({
      plan_year: planYear,
      milestone_name: m.milestoneName,
      is_complete: m.isComplete,
    }))

    const { error: upsertError } = await supabase
      .from(PROGRAM_PLAN_MILESTONES_TABLE)
      .upsert(rows, { onConflict: 'plan_year,milestone_name' })

    if (upsertError) {
      return json({ success: false, error: upsertError.message }, 500)
    }
  }

  // Stale-milestone cleanup: a milestone can be renamed or removed from the
  // sheet between syncs, and an upsert alone never deletes -- without this,
  // a renamed milestone would leave its old name sitting in the table
  // forever alongside the new one. Deletes by primary-key `id`, gathered
  // from the "before" snapshot above, rather than a raw
  // `.delete().eq('plan_year', ...).not('milestone_name', 'in', ...)` --
  // building an IN-list out of arbitrary milestone-name strings would need
  // careful quoting (names can contain commas, parentheses, apostrophes);
  // comparing by id sidesteps that entirely. Every delete is additionally
  // scoped to id values already confirmed to belong to this exact
  // plan_year (they came from the eq('plan_year', planYear) read above),
  // so this can never reach a row in a different plan year no matter what
  // the incoming milestone list contains.
  const staleIds = (existingRows ?? [])
    .filter((row) => !incomingNames.has(row.milestone_name))
    .map((row) => row.id)

  if (staleIds.length > 0) {
    const { error: deleteError } = await supabase.from(PROGRAM_PLAN_MILESTONES_TABLE).delete().in('id', staleIds)

    if (deleteError) {
      return json({ success: false, error: deleteError.message }, 500)
    }
  }

  // Not wrapped in a single transaction -- the Supabase JS client has no
  // multi-statement transaction API, and every other sync function here is
  // a single upsert anyway, so this is the first place that tradeoff
  // matters. If the delete step fails after the upsert already succeeded,
  // the upsert's rows are still correctly written; only the stale-row
  // cleanup would need a retry on the next sync run, not the whole sync.
  return json(
    { success: true, plan_year: planYear, upserted: milestones.length, deleted: staleIds.length },
    200,
  )
})
