// save-score
//
// Admin/board/reviewer-only write endpoint: saves one (applicant,
// interviewer) scorecard as a draft, or publishes it, into
// public.scholarship_scores. Follows save-board-availability's own
// auth/cycle-open pattern exactly (same getCallerRole/JWT verification,
// same server-computed-cycle_year gate) -- see that function's own
// comment for the full rationale, not re-derived here.
//
// Deployed with `supabase functions deploy save-score --no-verify-jwt`
// (not done by this change -- no deployment per task instructions), same
// flag and same reason as save-board-availability: this function wants
// full control over its own auth-failure response shape.
//
// CORS: same as save-board-availability -- the caller is a browser with a
// real session, so Access-Control-Allow-Headers includes "authorization".
//
// Runs with the service role key for the actual write -- scholarship_scores
// has no INSERT/UPDATE/DELETE policy for any role (see
// 20260930120000_create_scholarship_backend.sql's own comment: "scoring
// has no client-facing write UI yet" -- this function is that write UI
// now), so only a service-role call can write to it regardless of the
// caller's own role. The role check below is this function's own
// authorization logic, layered IN ADDITION to RLS, not a substitute for
// it.
//
// Self-contained by design, like every function here: patterns (json(),
// getServiceClient(), getCallerRole(), CORS_HEADERS, the cycle-open check)
// are copied from save-board-availability rather than imported from it.
// RUBRIC_CRITERIA is similarly duplicated from btx-frontend/src/lib/
// scoringRubric.js -- see this function's own constant below for why.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

const STAFF_ROLES = ['admin', 'board', 'reviewer']
const MAX_LABEL_LENGTH = 200
const MAX_NOTE_LENGTH = 2000
const MAX_GENERAL_NOTES_LENGTH = 5000
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Duplicated from btx-frontend/src/lib/scoringRubric.js -- this is a
// frontend module, not something this isolated Deno Edge Function can
// import, and every function in this project is already self-contained
// for that reason. If the rubric ever changes, this list and that file
// must be updated together, by hand. Only key/weight are needed here
// (label is a display-only concern the frontend owns).
const RUBRIC_CRITERIA = [
  { key: 'community', weight: 20 },
  { key: 'resilience', weight: 20 },
  { key: 'leadership', weight: 20 },
  { key: 'financial', weight: 20 },
  { key: 'communication', weight: 10 },
  { key: 'passion', weight: 10 },
]
const RUBRIC_KEYS = RUBRIC_CRITERIA.map((c) => c.key)

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
// their role from user_metadata -- identical to save-board-availability's
// own getCallerRole. Returns null for anything short of "a currently
// valid session for a real user".
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

// Validates one criterion_scores/notes-shaped object: must be a plain
// object (not an array/null), every key present must be a real rubric
// key (extra/unknown keys rejected), and -- only for criterion_scores,
// via checkValue -- every value present must pass checkValue. Shared by
// both criterion_scores and notes validation below since the "plain
// object, known keys only" shape is identical; only what a present
// value must look like differs.
function validateKeyedObject(value: unknown, checkValue: (v: unknown) => boolean): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return 'must be an object keyed by rubric criterion'
  }
  for (const key of Object.keys(value as Record<string, unknown>)) {
    if (!RUBRIC_KEYS.includes(key)) return `unknown rubric criterion "${key}"`
    if (!checkValue((value as Record<string, unknown>)[key])) return `invalid value for criterion "${key}"`
  }
  return null
}

const isValidScoreValue = (v: unknown) => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
const isValidNoteValue = (v: unknown) => typeof v === 'string' && v.length <= MAX_NOTE_LENGTH

// Sum of (score * weight) / 100 across every rubric criterion -- a
// missing criterion contributes 0, not a partial/average value, same
// formula the old sample-data preview used. Computed server-side from
// the caller's criterion_scores, never trusting a client-sent total.
function computeWeightedTotal(criterionScores: Record<string, number>): number {
  let sum = 0
  for (const criterion of RUBRIC_CRITERIA) {
    const score = criterionScores[criterion.key]
    if (typeof score === 'number') sum += score * criterion.weight
  }
  return Math.round((sum / 100) * 10) / 10
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

  const rawApplicantId = body.applicant_id
  if (typeof rawApplicantId !== 'string' || !UUID_PATTERN.test(rawApplicantId)) {
    return json({ success: false, error: 'applicant_id is required and must be a valid uuid' }, 400)
  }
  const applicantId = rawApplicantId

  const rawLabel = body.interviewer_label
  if (typeof rawLabel !== 'string' || rawLabel.trim() === '') {
    return json({ success: false, error: 'interviewer_label is required and must be a non-empty string' }, 400)
  }
  const interviewerLabel = rawLabel.trim()
  if (interviewerLabel.length > MAX_LABEL_LENGTH) {
    return json({ success: false, error: `interviewer_label must be ${MAX_LABEL_LENGTH} characters or fewer` }, 400)
  }

  if (typeof body.publish !== 'boolean') {
    return json({ success: false, error: 'publish is required and must be a boolean' }, 400)
  }
  const publish = body.publish

  const scoresError = validateKeyedObject(body.criterion_scores, isValidScoreValue)
  if (scoresError) {
    return json({ success: false, error: `criterion_scores ${scoresError}` }, 400)
  }
  const criterionScores = (body.criterion_scores ?? {}) as Record<string, number>

  // Publishing means the scorecard is actually complete -- same rule
  // ScoreApplicant.vue's own Publish button already disables client-side,
  // re-enforced here since a disabled button is a UX nicety, not a
  // security boundary.
  if (publish) {
    const missing = RUBRIC_KEYS.filter((key) => !(key in criterionScores))
    if (missing.length > 0) {
      return json({ success: false, error: 'all rubric criteria must be scored before publishing' }, 400)
    }
  }

  let notes: Record<string, string> = {}
  if (body.notes !== undefined && body.notes !== null) {
    const notesError = validateKeyedObject(body.notes, isValidNoteValue)
    if (notesError) {
      return json({ success: false, error: `notes ${notesError}` }, 400)
    }
    notes = body.notes as Record<string, string>
  }

  let generalNotes: string | null = null
  if (body.general_notes !== undefined && body.general_notes !== null && body.general_notes !== '') {
    if (typeof body.general_notes !== 'string') {
      return json({ success: false, error: 'general_notes must be a string' }, 400)
    }
    if (body.general_notes.length > MAX_GENERAL_NOTES_LENGTH) {
      return json({ success: false, error: `general_notes must be ${MAX_GENERAL_NOTES_LENGTH} characters or fewer` }, 400)
    }
    generalNotes = body.general_notes
  }

  // cycle_year is ALWAYS server-computed -- never read from the request
  // body even if the caller supplied one, same rule as submit-application
  // and save-board-availability: a client can't save a score into an
  // arbitrary (or fake) cycle.
  const cycleYear = new Date().getFullYear()

  const { data: openCycle, error: cycleError } = await supabase
    .from('scholarship_cycles')
    .select('id')
    .eq('cycle_year', cycleYear)
    .eq('status', 'open')
    .maybeSingle()

  if (cycleError) {
    console.error('save-score: scholarship_cycles lookup failed:', cycleError.message)
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

  // Confirms the applicant exists AND actually belongs to the current
  // open cycle -- without this check, a scholarship_scores row could be
  // written with cycle_year set to the current year for an applicant who
  // actually belongs to a different cycle_year, leaving an inconsistent
  // row behind (scholarship_scores_applicant_id_fkey would still let the
  // insert through, since it only checks that the applicant exists at
  // all, not which cycle this save thinks it's in).
  const { data: applicant, error: applicantError } = await supabase
    .from('scholarship_applicants')
    .select('cycle_year')
    .eq('id', applicantId)
    .maybeSingle()

  if (applicantError) {
    console.error('save-score: scholarship_applicants lookup failed:', applicantError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }
  if (!applicant) {
    return json({ success: false, error: 'applicant_not_found' }, 400)
  }
  if (applicant.cycle_year !== cycleYear) {
    return json({ success: false, error: 'applicant does not belong to the current open cycle' }, 400)
  }

  // The actual "once published, locked" rule -- checked BEFORE any write,
  // for both a draft save and a publish. scholarship_scores_applicant_id_
  // interviewer_label_key is exactly (applicant_id, interviewer_label), so
  // this lookup matches the real unique constraint precisely.
  const { data: existing, error: existingError } = await supabase
    .from('scholarship_scores')
    .select('status')
    .eq('applicant_id', applicantId)
    .eq('interviewer_label', interviewerLabel)
    .maybeSingle()

  if (existingError) {
    console.error('save-score: scholarship_scores lookup failed:', existingError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  if (existing && existing.status === 'published') {
    return json({ success: false, error: 'already_published' }, 409)
  }

  const weightedTotal = computeWeightedTotal(criterionScores)
  const nowIso = new Date().toISOString()

  const { data: saved, error: upsertError } = await supabase
    .from('scholarship_scores')
    .upsert(
      {
        applicant_id: applicantId,
        cycle_year: cycleYear,
        interviewer_label: interviewerLabel,
        criterion_scores: criterionScores,
        notes,
        general_notes: generalNotes,
        weighted_total: weightedTotal,
        status: publish ? 'published' : 'draft',
        scored_at: publish ? nowIso : null,
      },
      { onConflict: 'applicant_id,interviewer_label' },
    )
    .select('status, weighted_total')
    .single()

  if (upsertError) {
    console.error('save-score: scholarship_scores upsert failed:', upsertError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  return json({ success: true, status: saved.status, weighted_total: saved.weighted_total }, 200)
})
