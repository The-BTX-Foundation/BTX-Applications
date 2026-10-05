// submit-application
//
// Receives one Scholarship apply-flow submission directly from the portal
// app's own browser (btx-frontend-portal, Step7ReviewSubmit.vue via
// stores/application.js's submitApplication()) and inserts it into
// public.scholarship_applicants + public.scholarship_decisions. Unlike
// every sync-* function in this project (sync-donor-impact,
// sync-program-plan-tasks, etc.), the caller here is a public,
// unauthenticated browser -- an applicant with no Supabase session at all,
// not Apps Script's UrlFetchApp -- so there is deliberately no
// x-sync-secret shared-secret check. Field validation, the cycle-open
// check, a honeypot field, and a per-IP rate limit (see
// scholarship_submit_attempts) are this endpoint's defenses against abuse,
// since there is no shared secret or session to rely on instead.
//
// Must be deployed with `supabase functions deploy submit-application
// --no-verify-jwt` (not done by this change -- see task instructions: no
// deployment). Every other function in this project also deploys
// --no-verify-jwt, but for a different reason (Apps Script has no JWT to
// attach); here it's because a genuinely anonymous applicant has none
// either.
//
// CORS: this is the first function in this project a browser calls
// directly, so it's the first to need preflight (OPTIONS) handling --
// every sync-* function's own "no CORS" comment explains why they don't:
// their caller is server-to-server. Access-Control-Allow-Origin is '*'
// since this is a public submission endpoint with no cookies/session to
// protect via a stricter origin allowlist.
//
// Runs with the service role key (see getServiceClient below), so it
// bypasses RLS entirely -- required here since there's no signed-in user
// for this request to act as, and scholarship_applicants/
// scholarship_decisions have no INSERT policy for any role (by design --
// see the migration's own comment: the only writer either table is meant
// to have is this function).
//
// Self-contained by design, like every function here: patterns (json(),
// getServiceClient(), field parsers) are copied from the reference
// functions rather than imported from them.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

const MIN_SELECTED_SLOTS = 4
const MAX_SELECTED_SLOTS = 20
const MAX_AWARD_OPT_OUTS = 20
const MAX_SHORT_FIELD_LENGTH = 300
const MAX_ESSAY_LENGTH = 10000
const MAX_FILENAME_LENGTH = 255
const TERPMAIL_DOMAIN = '@terpmail.umd.edu'

// Rate limit: at most this many attempts per ip_hash in a rolling window of
// this many minutes -- see the rate-limit block in Deno.serve below for how
// the count is taken.
const RATE_LIMIT_MAX_ATTEMPTS = 5
const RATE_LIMIT_WINDOW_MINUTES = 10

// Used when x-forwarded-for is absent (e.g. a local `supabase functions
// serve` invocation hit directly with curl) so getCallerIp never throws --
// every caller missing the header shares this one rate-limit bucket in that
// case, rather than the function crashing.
const FALLBACK_IP = 'unknown'

// Allow-lists mirroring the portal's own option lists exactly -- gender,
// race, education_status, and major from btx-frontend-portal/src/views/
// apply/Step1BasicInfo.vue; how_heard from Step2HowYouFoundUs.vue (not
// Step1 -- howHeard is a Step 2 field in the portal, despite the field
// living on the same scholarship_applicants row as everything else here).
// Duplicated rather than imported, per this project's self-contained-
// function convention (see header comment) -- if the portal's lists ever
// change, these need updating to match by hand.
const GENDER_OPTIONS = ['Female', 'Male', 'Prefer not to say']
const RACE_OPTIONS = [
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Hispanic or Latino',
  'Native Hawaiian or Other Pacific Islander',
  'White',
  'Two or more races',
  'Prefer not to say',
]
const EDUCATION_STATUS_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior']
const MAJOR_OPTIONS = [
  'Aerospace Engineering',
  'Bioengineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Computer Engineering',
  'Electrical Engineering',
  'Environmental Engineering',
  'Fire Protection Engineering',
  'Materials Science and Engineering',
  'Mechanical Engineering',
  'Robotics Engineering',
  'Undecided / Other',
]
const HOW_HEARD_OPTIONS = [
  'I was nominated!',
  'A friend or mentor shared it with me!',
  'Instagram or LinkedIn',
  'Other',
]

// Wraps a JSON body and status into a Response, used for every reply this
// function makes. CORS_HEADERS are merged into every response (not just
// the OPTIONS preflight) -- the browser enforces CORS on the actual
// POST response too, not only the preflight.
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

// Hashes an IP (or the FALLBACK_IP placeholder) with SHA-256 before it's
// ever written to scholarship_submit_attempts. The table only needs to
// recognize "same caller, again" within a short window, never the literal
// address, so storing a hash instead of the raw IP is strictly less to leak
// if that table were ever read some other way.
async function hashIp(ip: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(ip))
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// x-forwarded-for can carry a comma-separated proxy chain
// ("client, proxy1, proxy2"); the first entry is the original caller, as set
// by the platform's own edge network. Falls back to a constant string
// rather than throwing when the header is missing entirely -- see
// FALLBACK_IP above for why that matters for local/CLI testing.
function getCallerIp(req: Request): string {
  const header = req.headers.get('x-forwarded-for')
  if (!header) return FALLBACK_IP
  const first = header.split(',')[0].trim()
  return first || FALLBACK_IP
}

// Coerces a value into a finite whole number for credits_left. Same shape
// as the sync-* functions' own parseInteger, duplicated rather than shared
// per this project's self-contained-function convention. undefined/null/''
// map to `undefined` here (unlike the sync-* version's `null`) since
// credits_left is a required field with no "clear the column" concept --
// there's no legitimate way for a submission to omit it.
function parseRequiredInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return Number.isInteger(n) ? n : undefined
}

// One normalized, ready-to-insert scholarship_applicants row (minus
// cycle_year, applicant_code, and submitted_at -- cycle_year is computed by
// the caller before this shape is built, applicant_code is generated by the
// table's own BEFORE INSERT trigger, and submitted_at defaults to now()).
interface ParsedApplication {
  full_name: string
  terpmail_email: string
  phone: string
  gender: string
  race: string
  attends_umd: boolean
  education_status: string
  credits_left: number
  major: string
  how_heard: string
  award_opt_outs: string[]
  certification_interest: boolean
  essay_text: string | null
  selected_slots: string[]
  resume_filename: string
  transcript_filename: string
  agreed_accurate: true
  agreed_terms: true
  agreed_privacy: true
}

// Validates and normalizes the request body against scholarship_applicants'
// real columns (see 20260930120000_create_scholarship_backend.sql -- this
// is the deployed schema, not any older draft). Returns the cleaned row, or
// a string naming what was wrong -- the caller turns that into a 400, same
// convention as sync-program-plan-tasks' own parseTask.
//
// Field-mapping note (see the task's own Step 1 read of
// btx-frontend-portal/src/stores/application.js): the store's field names
// don't all match these column names 1:1 --
//   - store.email -> terpmail_email (name only, no shape change)
//   - store.resumeFileName / store.transcriptFileName -> resume_filename /
//     transcript_filename (name only -- the store spells "FileName" as two
//     words, the column as one)
//   - store.attendsUMD is the STRING 'Yes'/'No' (a SegmentedControl value),
//     but attends_umd is a boolean column -- the frontend is expected to
//     convert 'Yes' -> true before sending, and this function independently
//     re-validates the result is actually a boolean rather than trusting
//     that conversion happened correctly.
//   - store.creditsLeft is a STRING of digits (a text input's raw value),
//     but credits_left is an integer column -- same pattern: the frontend
//     converts before sending, this function re-validates the result is a
//     real whole number.
// Both conversions are re-validated here, not merely assumed, because nothing
// about this public endpoint's request body can be trusted regardless of
// what the portal's own frontend does.
function parseApplication(body: Record<string, unknown>): ParsedApplication | string {
  const fullName = body.full_name
  if (typeof fullName !== 'string' || fullName.trim() === '') {
    return 'full_name is required and must be a non-empty string'
  }
  if (fullName.trim().length > MAX_SHORT_FIELD_LENGTH) {
    return `full_name must be ${MAX_SHORT_FIELD_LENGTH} characters or fewer`
  }

  const rawEmail = body.terpmail_email
  if (typeof rawEmail !== 'string' || rawEmail.trim() === '') {
    return 'terpmail_email is required and must be a non-empty string'
  }
  const email = rawEmail.trim().toLowerCase()
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  if (!looksLikeEmail || !email.endsWith(TERPMAIL_DOMAIN)) {
    return `terpmail_email must be a valid ${TERPMAIL_DOMAIN} address`
  }

  const rawPhone = body.phone
  if (typeof rawPhone !== 'string') {
    return 'phone is required and must be a string'
  }
  const phoneDigits = rawPhone.replace(/\D/g, '')
  if (phoneDigits.length !== 10) {
    return 'phone must contain exactly 10 digits'
  }

  const gender = body.gender
  if (typeof gender !== 'string' || gender.trim() === '') {
    return 'gender is required and must be a non-empty string'
  }
  if (!GENDER_OPTIONS.includes(gender)) {
    return 'gender must be one of the listed options'
  }

  const race = body.race
  if (typeof race !== 'string' || race.trim() === '') {
    return 'race is required and must be a non-empty string'
  }
  if (!RACE_OPTIONS.includes(race)) {
    return 'race must be one of the listed options'
  }

  const attendsUmd = body.attends_umd
  if (typeof attendsUmd !== 'boolean') {
    return 'attends_umd is required and must be a boolean'
  }

  const educationStatus = body.education_status
  if (typeof educationStatus !== 'string' || educationStatus.trim() === '') {
    return 'education_status is required and must be a non-empty string'
  }
  if (!EDUCATION_STATUS_OPTIONS.includes(educationStatus)) {
    return 'education_status must be one of the listed options'
  }

  const creditsLeft = parseRequiredInteger(body.credits_left)
  if (creditsLeft === undefined || creditsLeft < 0) {
    return 'credits_left is required and must be a whole number of 0 or more'
  }

  const major = body.major
  if (typeof major !== 'string' || major.trim() === '') {
    return 'major is required and must be a non-empty string'
  }
  if (!MAJOR_OPTIONS.includes(major)) {
    return 'major must be one of the listed options'
  }

  const howHeard = body.how_heard
  if (typeof howHeard !== 'string' || howHeard.trim() === '') {
    return 'how_heard is required and must be a non-empty string'
  }
  if (!HOW_HEARD_OPTIONS.includes(howHeard)) {
    return 'how_heard must be one of the listed options'
  }

  // Optional -- defaults to [], matching the column's own default.
  let awardOptOuts: string[] = []
  if (body.award_opt_outs !== undefined && body.award_opt_outs !== null) {
    if (!Array.isArray(body.award_opt_outs) || !body.award_opt_outs.every((v) => typeof v === 'string')) {
      return 'award_opt_outs must be an array of strings'
    }
    if (body.award_opt_outs.length > MAX_AWARD_OPT_OUTS) {
      return `award_opt_outs must contain at most ${MAX_AWARD_OPT_OUTS} entries`
    }
    awardOptOuts = body.award_opt_outs
  }

  // Optional -- defaults to false, matching the column's own default.
  let certificationInterest = false
  if (body.certification_interest !== undefined && body.certification_interest !== null) {
    if (typeof body.certification_interest !== 'boolean') {
      return 'certification_interest must be a boolean'
    }
    certificationInterest = body.certification_interest
  }

  // Optional -- blank/absent maps to null (the column is nullable with no
  // default), never invented.
  let essayText: string | null = null
  if (body.essay_text !== undefined && body.essay_text !== null && body.essay_text !== '') {
    if (typeof body.essay_text !== 'string') {
      return 'essay_text must be a string'
    }
    if (body.essay_text.length > MAX_ESSAY_LENGTH) {
      return `essay_text must be ${MAX_ESSAY_LENGTH} characters or fewer`
    }
    essayText = body.essay_text
  }

  if (
    !Array.isArray(body.selected_slots) ||
    !body.selected_slots.every((v) => typeof v === 'string' && v.trim() !== '')
  ) {
    return 'selected_slots is required and must be an array of non-empty strings'
  }
  if (body.selected_slots.length < MIN_SELECTED_SLOTS) {
    return `selected_slots must contain at least ${MIN_SELECTED_SLOTS} entries`
  }
  if (body.selected_slots.length > MAX_SELECTED_SLOTS) {
    return `selected_slots must contain at most ${MAX_SELECTED_SLOTS} entries`
  }

  const resumeFilename = body.resume_filename
  if (typeof resumeFilename !== 'string' || resumeFilename.trim() === '') {
    return 'resume_filename is required and must be a non-empty string'
  }
  if (resumeFilename.length > MAX_FILENAME_LENGTH) {
    return `resume_filename must be ${MAX_FILENAME_LENGTH} characters or fewer`
  }

  const transcriptFilename = body.transcript_filename
  if (typeof transcriptFilename !== 'string' || transcriptFilename.trim() === '') {
    return 'transcript_filename is required and must be a non-empty string'
  }
  if (transcriptFilename.length > MAX_FILENAME_LENGTH) {
    return `transcript_filename must be ${MAX_FILENAME_LENGTH} characters or fewer`
  }

  if (body.agreed_accurate !== true) {
    return 'agreed_accurate must be true'
  }
  if (body.agreed_terms !== true) {
    return 'agreed_terms must be true'
  }
  if (body.agreed_privacy !== true) {
    return 'agreed_privacy must be true'
  }

  return {
    full_name: fullName.trim(),
    terpmail_email: email,
    phone: rawPhone,
    gender,
    race,
    attends_umd: attendsUmd,
    education_status: educationStatus,
    credits_left: creditsLeft,
    major,
    how_heard: howHeard,
    award_opt_outs: awardOptOuts,
    certification_interest: certificationInterest,
    essay_text: essayText,
    selected_slots: body.selected_slots,
    resume_filename: resumeFilename,
    transcript_filename: transcriptFilename,
    agreed_accurate: true,
    agreed_terms: true,
    agreed_privacy: true,
  }
}

Deno.serve(async (req) => {
  // Preflight -- the only request type here that needs no body/auth
  // handling at all, just the CORS headers themselves.
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS })
  }

  if (req.method !== 'POST') {
    return json({ success: false, error: 'Method not allowed' }, 405)
  }

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ success: false, error: 'Request body must be valid JSON' }, 400)
  }

  const supabase = getServiceClient()

  // Rate limit -- runs before every other check on this request, including
  // the honeypot below, so every POST that reaches this function consumes
  // part of its caller's budget regardless of what it turns out to be
  // (malformed, honeypot-caught, invalid, or a genuine submission).
  // Insert-then-count, not count-then-insert: the row for THIS attempt is
  // written first, so it's included in its own count -- the 5th attempt in
  // the window is the one that trips the limit, not the 6th.
  const callerIp = getCallerIp(req)
  const ipHash = await hashIp(callerIp)

  const { error: attemptInsertError } = await supabase.from('scholarship_submit_attempts').insert({ ip_hash: ipHash })

  if (attemptInsertError) {
    console.error('submit-application: scholarship_submit_attempts insert failed:', attemptInsertError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  const rateLimitWindowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
  const { count: attemptCount, error: attemptCountError } = await supabase
    .from('scholarship_submit_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('attempted_at', rateLimitWindowStart)

  if (attemptCountError) {
    console.error('submit-application: scholarship_submit_attempts count failed:', attemptCountError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  if ((attemptCount ?? 0) >= RATE_LIMIT_MAX_ATTEMPTS) {
    return json({ success: false, error: 'rate_limited' }, 429)
  }

  // Honeypot -- `website` is a field no real applicant ever sees or fills
  // (see the portal's Step1BasicInfo.vue for how it's hidden off-screen), so
  // a non-empty value here means whatever submitted this request is an
  // automated form-filler, not a person. The response below is built to be
  // indistinguishable from a genuine 201 success -- same shape, same status
  // code, a syntactically valid but fake applicant_code that can never
  // collide with a real one (the backing sequence starts at 1, so
  // "...-00000" is never issued for real) -- never a 400, never a distinct
  // error shape, so nothing about this response can teach a bot that it was
  // caught rather than genuinely accepted. No insert happens; nothing about
  // this request ever reaches scholarship_applicants or
  // scholarship_decisions.
  const honeypotValue = body.website
  if (typeof honeypotValue === 'string' && honeypotValue.trim() !== '') {
    const fakeCycleYear = new Date().getFullYear()
    return json({ success: true, applicant_code: `APP-${fakeCycleYear}-00000`, submitted_at: new Date().toISOString() }, 201)
  }

  const parsed = parseApplication(body)
  if (typeof parsed === 'string') {
    return json({ success: false, error: parsed }, 400)
  }

  // cycle_year is ALWAYS server-computed -- never read from the request
  // body even if the caller supplied one, so a client can't submit into an
  // arbitrary (or fake) cycle.
  const cycleYear = new Date().getFullYear()

  const dryRun = body.dry_run === true

  // Gate every submission (real or dry_run) on an actually-open cycle for
  // the computed year -- dry_run validates this too, per this function's
  // own contract, so a caller can tell "my data is fine but the cycle isn't
  // open yet" apart from "my data has an error" before ever attempting a
  // real write.
  const { data: openCycle, error: cycleError } = await supabase
    .from('scholarship_cycles')
    .select('id')
    .eq('cycle_year', cycleYear)
    .eq('status', 'open')
    .maybeSingle()

  if (cycleError) {
    console.error('submit-application: scholarship_cycles lookup failed:', cycleError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  if (!openCycle) {
    return json(
      {
        success: false,
        error: 'cycle_not_open',
        message: `Applications for ${cycleYear} are not currently open.`,
      },
      403,
    )
  }

  if (dryRun) {
    return json(
      {
        success: true,
        dry_run: true,
        cycle_year: cycleYear,
        would_insert: { ...parsed, cycle_year: cycleYear },
      },
      200,
    )
  }

  const { data: applicant, error: applicantError } = await supabase
    .from('scholarship_applicants')
    .insert({ ...parsed, cycle_year: cycleYear })
    .select('id, applicant_code, submitted_at')
    .single()

  if (applicantError) {
    // 23505 = unique_violation -- either the (cycle_year, lower(email))
    // index or the applicant_code unique constraint. In practice this is
    // always the email index: a second submission for the same email in
    // the same cycle, which is exactly what "already_submitted" means to
    // an applicant.
    if (applicantError.code === '23505') {
      return json({ success: false, error: 'already_submitted' }, 409)
    }
    console.error('submit-application: scholarship_applicants insert failed:', applicantError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  const { error: decisionError } = await supabase.from('scholarship_decisions').insert({
    applicant_id: applicant.id,
    cycle_year: cycleYear,
    stage: 'in_review',
  })

  if (decisionError) {
    // No real multi-statement transaction available via the REST client in
    // this runtime -- compensate manually instead of leaving an applicant
    // row with no matching decision. Best-effort: if this delete itself
    // fails, the orphan is logged for manual cleanup rather than silently
    // lost.
    const { error: cleanupError } = await supabase.from('scholarship_applicants').delete().eq('id', applicant.id)
    if (cleanupError) {
      console.error(
        `submit-application: orphaned scholarship_applicants row ${applicant.id} after a failed decisions insert, and the compensating delete ALSO failed:`,
        cleanupError.message,
      )
    }
    console.error('submit-application: scholarship_decisions insert failed:', decisionError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  // Only applicant_code + submitted_at -- never the full row, and nothing
  // from scholarship_decisions, so this public response can't leak any of
  // the PII just written.
  return json({ success: true, applicant_code: applicant.applicant_code, submitted_at: applicant.submitted_at }, 201)
})
