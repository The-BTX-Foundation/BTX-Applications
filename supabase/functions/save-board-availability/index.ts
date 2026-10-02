// save-board-availability
//
// Admin/board/reviewer-only write endpoint: replaces one board member's
// own availability slot list for the current cycle via
// replace_board_availability() (see that function's own migration
// comment -- 20261002130000_scholarship_interview_pairing.sql -- for why
// this is a full replace, not an upsert: same "one coherent snapshot"
// rationale as submit-application's own all-or-nothing validation and
// sync-program-plan-tasks' replace_program_plan_tasks).
//
// Unlike every sync-* function (server-to-server, x-sync-secret) and
// unlike submit-application (a genuinely public/anonymous applicant),
// this caller is a signed-in BTX staff member -- a real Supabase session
// with a real JWT. Deployed with `supabase functions deploy
// save-board-availability --no-verify-jwt` (not done by this change --
// no deployment per task instructions), same flag every other function
// in this project uses but for a DIFFERENT reason: this function wants
// full control over its own auth-failure response shape (the same
// json() convention as every other response here), rather than letting
// Supabase's platform-level JWT gate reject an unauthenticated request
// with its own differently-shaped error before this function's code ever
// runs. getCallerRole() below is what actually verifies the JWT, by
// hand, via supabase.auth.getUser(jwt) against Supabase Auth itself --
// this is the first function in this project with a real user session to
// verify at all.
//
// CORS: needed here (unlike the sync-* functions) because the caller is
// a browser -- same reasoning as submit-application's own CORS comment,
// except Access-Control-Allow-Headers also allows "authorization" here,
// since the caller's session JWT travels in that header.
//
// Runs with the service role key for the actual write (see
// getServiceClient below) -- scholarship_board_availability has no
// INSERT/UPDATE/DELETE policy for any role by design (see its own
// migration comment), so only a service-role call can write to it
// regardless of the caller's own role. The role check below is this
// function's own authorization logic, layered IN ADDITION to RLS, not a
// substitute for it -- RLS has nothing to check against here since
// service_role bypasses it entirely for the write itself.
//
// Self-contained by design, like every function here: patterns (json(),
// getServiceClient(), CORS_HEADERS, the cycle-open check) are copied from
// submit-application rather than imported from it.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

const STAFF_ROLES = ['admin', 'board', 'reviewer']
const MAX_SLOTS = 50
const MAX_LABEL_LENGTH = 200

// Wraps a JSON body and status into a Response, used for every reply
// this function makes.
function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
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

// Verifies the caller's bearer JWT against Supabase Auth and returns
// their role from user_metadata -- the same place every RLS policy in
// this project reads it from (see every
// "(auth.jwt() -> 'user_metadata' ->> 'role')" check across
// supabase/migrations). Returns null for anything short of "a currently
// valid session for a real user": missing header, malformed header, an
// expired/invalid token, or a user with no role set all collapse to the
// same null, which the caller turns into one 401 rather than leaking
// which specific case occurred.
async function getCallerRole(req: Request, supabase: ReturnType<typeof getServiceClient>): Promise<string | null> {
  const authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return null
  const jwt = authHeader.slice('Bearer '.length).trim()
  if (!jwt) return null

  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) return null

  const role = data.user.user_metadata?.role
  return typeof role === 'string' ? role : null
}

Deno.serve(async (req) => {
  // Preflight -- the only request type here that needs no auth/body
  // handling at all, just the CORS headers themselves.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  const supabase = getServiceClient()

  const role = await getCallerRole(req, supabase)
  if (!role) {
    return json({ success: false, error: 'Unauthorized' }, 401)
  }
  if (!STAFF_ROLES.includes(role)) {
    return json({ success: false, error: 'Forbidden' }, 403)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ success: false, error: 'Request body must be valid JSON' }, 400)
  }

  const rawLabel = body.board_member_label
  if (typeof rawLabel !== 'string' || rawLabel.trim() === '') {
    return json({ success: false, error: 'board_member_label is required and must be a non-empty string' }, 400)
  }
  const boardMemberLabel = rawLabel.trim()
  if (boardMemberLabel.length > MAX_LABEL_LENGTH) {
    return json({ success: false, error: `board_member_label must be ${MAX_LABEL_LENGTH} characters or fewer` }, 400)
  }

  if (!Array.isArray(body.slots) || !body.slots.every((v) => typeof v === 'string' && v.trim() !== '')) {
    return json({ success: false, error: 'slots is required and must be an array of non-empty strings' }, 400)
  }
  if (body.slots.length > MAX_SLOTS) {
    return json({ success: false, error: `slots must contain at most ${MAX_SLOTS} entries` }, 400)
  }
  // De-duped before it ever reaches the database -- a caller sending the
  // same slot twice in one request would otherwise hit
  // scholarship_board_availability's own UNIQUE constraint mid-insert,
  // turning a harmless duplicate click into a 500.
  const slots = [...new Set(body.slots as string[])]

  // cycle_year is ALWAYS server-computed -- never read from the request
  // body even if the caller supplied one, same rule and reasoning as
  // submit-application's own cycle_year line: a client can't save
  // availability into an arbitrary (or fake) cycle.
  const cycleYear = new Date().getFullYear()

  const dryRun = body.dry_run === true

  // Gate every save (real or dry_run) on an actually-open cycle for the
  // computed year -- same convention as submit-application: dry_run
  // validates this too, so a caller can tell "my data is fine but the
  // cycle isn't open" apart from "my data has an error."
  const { data: openCycle, error: cycleError } = await supabase
    .from('scholarship_cycles')
    .select('id')
    .eq('cycle_year', cycleYear)
    .eq('status', 'open')
    .maybeSingle()

  if (cycleError) {
    console.error('save-board-availability: scholarship_cycles lookup failed:', cycleError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  if (!openCycle) {
    return json(
      {
        success: false,
        error: 'cycle_not_open',
        message: `Scholarship cycle ${cycleYear} is not currently open.`,
      },
      403,
    )
  }

  if (dryRun) {
    return json(
      {
        success: true,
        dry_run: true,
        board_member_label: boardMemberLabel,
        cycle_year: cycleYear,
        slot_count: slots.length,
      },
      200,
    )
  }

  const { data: insertedCount, error: rpcError } = await supabase.rpc('replace_board_availability', {
    p_board_member_label: boardMemberLabel,
    p_cycle_year: cycleYear,
    p_slots: slots,
  })

  if (rpcError) {
    console.error('save-board-availability: replace_board_availability failed:', rpcError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  return json(
    { success: true, board_member_label: boardMemberLabel, cycle_year: cycleYear, slot_count: insertedCount },
    200,
  )
})
