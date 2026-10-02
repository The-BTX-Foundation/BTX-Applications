// run-interview-pairing
//
// Admin-only write endpoint: pairs every not-yet-interviewed, eligible
// applicant in the current cycle with a 2-person interview slot, drawn
// from scholarship_board_availability, and writes the result into
// scholarship_interviews. Stricter than save-board-availability's
// admin/board/reviewer gate -- admin ONLY -- because this is a real
// operational action with side effects (it schedules real interviews),
// not a read or a self-service availability save.
//
// Deployed with `supabase functions deploy run-interview-pairing
// --no-verify-jwt` (not done by this change -- no deployment per task
// instructions), for the same reason as save-board-availability: full
// control over this function's own auth-failure response shape, verified
// by hand via getCallerRole() rather than relying on the platform's own
// JWT gate. See that function's own comment for the longer version of
// this reasoning -- not repeated here beyond this pointer, per this
// project's self-contained-but-not-redundant-explanation balance (the
// json()/getServiceClient()/getCallerRole() CODE is still duplicated
// below, per the self-contained-function convention; only the
// explanatory comment is not).
//
// CORS: same as save-board-availability -- the caller is a browser (the
// Ops Hub), Access-Control-Allow-Headers allows "authorization" for the
// same reason.
//
// Runs with the service role key for every read and the final write (see
// getServiceClient below) -- scholarship_applicants, scholarship_
// interviews, and scholarship_board_availability all have narrower RLS
// policies than this function needs (scholarship_applicants is admin-only
// SELECT; the other two have no write policy for any role at all), so a
// service-role client is required regardless of the caller's own
// already-verified admin role.
//
// Self-contained by design, like every function here: patterns (json(),
// getServiceClient(), getCallerRole(), the cycle-open check) are copied
// from save-board-availability rather than imported from it.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type, authorization',
}

const MIN_SELECTED_SLOTS = 4
const MIN_INTERVIEWERS_PER_SLOT = 2
const SLOT_ID_PATTERN = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...CORS_HEADERS },
  })
}

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRoleKey) {
    throw new Error('SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not available in the function environment')
  }
  return createClient(url, serviceRoleKey, { auth: { persistSession: false } })
}

// See save-board-availability's own copy of this function for the full
// explanation of what it does and why each failure case collapses to
// null.
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

// Resolves one of this app's slot ids (e.g. "2026-10-05-1400" -- the
// exact shape minted by btx-frontend-portal/src/lib/interviewSlots.js's
// INTERVIEW_SLOTS[].id: "YYYY-MM-DD-HHMM", 24-hour time, no explicit
// timezone) into a real timestamptz. That file -- not Interviews.vue's
// own sample data -- is the convention reused here: Interviews.vue's
// "slot ids" (checked per this migration's own Step 1 instructions) are
// a day-key/slot-key pair like 'thu-sep-17' + '9-10', for a disconnected,
// sample-data-only preview of a DIFFERENT feature (a board member's own
// weekly grid), with no year and no real timestamp behind them at all --
// that scheme can't be resolved to a timestamptz and isn't what actually
// ends up in scholarship_applicants.selected_slots or this table's own
// slot_id column. interviewSlots.js's ids are what the real apply flow
// (Step5InterviewAvailability.vue) actually writes into
// store.selectedSlots, so that's the id space this function has to
// parse.
//
// This parses the id's digits directly rather than looking them up
// against a hardcoded list of known slots -- a fixed list would silently
// go stale the moment interviewSlots.js's own pilot-week dates are
// swapped for a real schedule, since nothing would keep the two in sync.
//
// No timezone is encoded in the id itself. Resolved as America/New_York
// (UMD's campus timezone -- the only one that makes sense for an
// interview week scheduled by and for University of Maryland people) via
// a two-pass Intl offset lookup: treat the digits as if they were UTC,
// ask Intl what that instant displays as in America/New_York, and
// correct by the difference. This correctly handles the EDT/EST boundary
// without an external timezone library (Deno's Intl implementation
// includes the IANA tz database; nothing else needs to be bundled).
// Returns null for anything that doesn't match the expected shape or
// resolve to a real calendar date/time, rather than guessing.
function resolveSlotToTimestamptz(slotId: string): string | null {
  const match = slotId.match(SLOT_ID_PATTERN)
  if (!match) return null
  const [, yearStr, monthStr, dayStr, hourStr, minuteStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const hour = Number(hourStr)
  const minute = Number(minuteStr)
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) return null

  // Pass 1: treat the wall-clock digits as if they were already UTC.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute)

  // Pass 2: ask what that instant looks like in America/New_York. The
  // difference between the two IS the zone's real UTC offset at this
  // date (DST-aware, since the formatter knows the real transition
  // dates) -- applying it to the original guess gives the correct
  // instant.
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const parts = Object.fromEntries(formatter.formatToParts(new Date(guessUtc)).map((p) => [p.type, p.value]))
  const nyHour = parts.hour === '24' ? 0 : Number(parts.hour)
  const nyAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    nyHour,
    Number(parts.minute),
  )

  const offsetMs = guessUtc - nyAsUtc
  const realUtc = new Date(guessUtc + offsetMs)
  if (Number.isNaN(realUtc.getTime())) return null
  return realUtc.toISOString()
}

// Picks one element of `candidates` with probability proportional to
// weightFn(candidate) -- standard cumulative-weight roulette selection.
// The final `return candidates[candidates.length - 1]` is a
// floating-point-rounding fallback (the loop should always return before
// falling through), not a real code path under normal conditions.
function weightedPick<T>(candidates: T[], weightFn: (c: T) => number): T {
  const weights = candidates.map(weightFn)
  const total = weights.reduce((a, b) => a + b, 0)
  let r = Math.random() * total
  for (let i = 0; i < candidates.length; i++) {
    r -= weights[i]
    if (r <= 0) return candidates[i]
  }
  return candidates[candidates.length - 1]
}

// Chooses 2 DISTINCT board members from `members` (already a distinct
// list -- see where slotToMembers is built below), weighted by
// 1 / (current_count + 1): a lower current interview count means a
// higher chance of being picked, but +1 means even a member with 0
// interviews never has an infinite/zero-divide weight, and no member is
// ever a hard exclusion regardless of how high their count already is.
// Picks the first member from the full weighted pool, then the second
// from the same pool minus the first -- weights are read from
// countByMember fresh for each pick, so if the first pick's count were
// somehow already reflected (it isn't, until AFTER both picks are made
// and recorded by the caller), the second pick would account for it.
function pickTwoDistinctWeighted(members: string[], countByMember: Map<string, number>): [string, string] {
  const weightOf = (m: string) => 1 / ((countByMember.get(m) ?? 0) + 1)
  const first = weightedPick(members, weightOf)
  const remaining = members.filter((m) => m !== first)
  const second = weightedPick(remaining, weightOf)
  return [first, second]
}

interface PairedResult {
  applicant_id: string
  applicant_code: string
  scheduled_at: string
  interviewer_one_label: string
  interviewer_two_label: string
  mode: string
  status: string
}

interface UnpairedResult {
  applicant_id: string
  applicant_code: string
  reason: string
}

Deno.serve(async (req) => {
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
  // Admin only -- stricter than save-board-availability's admin/board/
  // reviewer gate. See this function's own header comment on why.
  if (role !== 'admin') {
    return json({ success: false, error: 'Forbidden' }, 403)
  }

  // No required body fields -- dry_run is the only one, and it's
  // optional, so a bodyless POST (a plain "run it") is valid. Parsed
  // leniently rather than requiring Content-Type: application/json with
  // a body present, since there's nothing else this endpoint needs from
  // the caller.
  let body: Record<string, unknown> = {}
  const rawBody = await req.text()
  if (rawBody.trim() !== '') {
    try {
      body = JSON.parse(rawBody)
    } catch {
      return json({ success: false, error: 'Request body must be valid JSON' }, 400)
    }
  }
  const dryRun = body.dry_run === true

  // cycle_year is ALWAYS server-computed -- never read from the request
  // body even if the caller supplied one, same rule as every other
  // cycle-scoped function in this project.
  const cycleYear = new Date().getFullYear()

  const { data: openCycle, error: cycleError } = await supabase
    .from('scholarship_cycles')
    .select('id')
    .eq('cycle_year', cycleYear)
    .eq('status', 'open')
    .maybeSingle()

  if (cycleError) {
    console.error('run-interview-pairing: scholarship_cycles lookup failed:', cycleError.message)
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

  // ---- Step 1: eligible applicants -- 4+ selected_slots, no existing
  // interview row, oldest submission first. The "no existing interview
  // row" half of this filter is what the new UNIQUE constraint on
  // scholarship_interviews.applicant_id (20261002130000_scholarship_
  // interview_pairing.sql) makes reliable: at most one interview row can
  // ever exist per applicant, so this filter can never under- or
  // over-count. ----
  const { data: applicants, error: applicantsError } = await supabase
    .from('scholarship_applicants')
    .select('id, applicant_code, selected_slots, submitted_at')
    .eq('cycle_year', cycleYear)
    .order('submitted_at', { ascending: true })

  if (applicantsError) {
    console.error('run-interview-pairing: scholarship_applicants query failed:', applicantsError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  const { data: existingInterviews, error: existingInterviewsError } = await supabase
    .from('scholarship_interviews')
    .select('applicant_id, interviewer_one_label, interviewer_two_label')
    .eq('cycle_year', cycleYear)

  if (existingInterviewsError) {
    console.error(
      'run-interview-pairing: existing scholarship_interviews query failed:',
      existingInterviewsError.message,
    )
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  const alreadyInterviewedApplicantIds = new Set((existingInterviews ?? []).map((row) => row.applicant_id))

  const eligibleApplicants = (applicants ?? []).filter(
    (a) => Array.isArray(a.selected_slots) && a.selected_slots.length >= MIN_SELECTED_SLOTS && !alreadyInterviewedApplicantIds.has(a.id),
  )

  // ---- Step 2: board availability for this cycle -> slot_id -> distinct
  // board_member_labels map. ----
  const { data: availabilityRows, error: availabilityError } = await supabase
    .from('scholarship_board_availability')
    .select('board_member_label, slot_id')
    .eq('cycle_year', cycleYear)

  if (availabilityError) {
    console.error('run-interview-pairing: scholarship_board_availability query failed:', availabilityError.message)
    return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
  }

  const slotToMembers = new Map<string, Set<string>>()
  for (const row of availabilityRows ?? []) {
    if (!slotToMembers.has(row.slot_id)) slotToMembers.set(row.slot_id, new Set())
    slotToMembers.get(row.slot_id)!.add(row.board_member_label)
  }

  // ---- Step 3: seed each board member's current interview count from
  // EXISTING scholarship_interviews rows (from before this run). This
  // map is mutated in place as pairings are made in Step 4, so weighting
  // adapts across the whole batch, not just against pre-run history. ----
  const countByMember = new Map<string, number>()
  const bump = (label: string | null) => {
    if (!label) return
    countByMember.set(label, (countByMember.get(label) ?? 0) + 1)
  }
  for (const row of existingInterviews ?? []) {
    bump(row.interviewer_one_label)
    bump(row.interviewer_two_label)
  }

  // ---- Step 4: pair (or record unpaired) each eligible applicant, in
  // submitted_at order. ----
  const paired: PairedResult[] = []
  const unpaired: UnpairedResult[] = []

  for (const applicant of eligibleApplicants) {
    const candidateSlots = (applicant.selected_slots as string[]).filter(
      (slotId) => (slotToMembers.get(slotId)?.size ?? 0) >= MIN_INTERVIEWERS_PER_SLOT,
    )

    if (candidateSlots.length === 0) {
      unpaired.push({
        applicant_id: applicant.id,
        applicant_code: applicant.applicant_code,
        reason: 'no overlapping availability for a 2-interviewer slot',
      })
      continue
    }

    const chosenSlot = candidateSlots[Math.floor(Math.random() * candidateSlots.length)]
    const availableMembers = Array.from(slotToMembers.get(chosenSlot)!)
    const [interviewerOne, interviewerTwo] = pickTwoDistinctWeighted(availableMembers, countByMember)

    const scheduledAt = resolveSlotToTimestamptz(chosenSlot)
    if (!scheduledAt) {
      // Malformed slot_id slipped past save-board-availability's own
      // validation (or the applicant's own selected_slots) -- treat as
      // unpaired with a distinct reason rather than writing a row with a
      // null scheduled_at, which would silently break every UI that
      // expects one.
      unpaired.push({
        applicant_id: applicant.id,
        applicant_code: applicant.applicant_code,
        reason: `selected slot "${chosenSlot}" is not a resolvable date/time`,
      })
      continue
    }

    paired.push({
      applicant_id: applicant.id,
      applicant_code: applicant.applicant_code,
      scheduled_at: scheduledAt,
      interviewer_one_label: interviewerOne,
      interviewer_two_label: interviewerTwo,
      // PLACEHOLDER: always 'Video' -- not derived from anything the
      // applicant chose, since nothing in the apply flow (see
      // Step5InterviewAvailability.vue) captures a format preference.
      // Replace with a real value once the apply flow asks for one.
      mode: 'Video',
      status: 'Scheduled',
    })

    countByMember.set(interviewerOne, (countByMember.get(interviewerOne) ?? 0) + 1)
    countByMember.set(interviewerTwo, (countByMember.get(interviewerTwo) ?? 0) + 1)
  }

  const pairedCount = paired.length
  const unpairedCount = unpaired.length

  // dry_run never touches the database -- returns exactly what would be
  // written, so an admin can review a proposed pairing run before
  // committing to it. Safe to call repeatedly: it reads the same "no
  // existing interview row" state real runs do, so a dry_run reflects
  // what a real run would actually do right now.
  if (dryRun) {
    return json(
      {
        success: true,
        dry_run: true,
        cycle_year: cycleYear,
        paired,
        unpaired,
        paired_count: pairedCount,
        unpaired_count: unpairedCount,
      },
      200,
    )
  }

  if (paired.length > 0) {
    const { error: insertError } = await supabase.from('scholarship_interviews').insert(
      paired.map((p) => ({
        applicant_id: p.applicant_id,
        cycle_year: cycleYear,
        scheduled_at: p.scheduled_at,
        interviewer_one_label: p.interviewer_one_label,
        interviewer_two_label: p.interviewer_two_label,
        mode: p.mode,
        status: p.status,
      })),
    )

    if (insertError) {
      console.error('run-interview-pairing: scholarship_interviews batch insert failed:', insertError.message)
      return json({ success: false, error: 'Something went wrong. Please try again.' }, 500)
    }
  }

  return json(
    {
      success: true,
      cycle_year: cycleYear,
      paired,
      unpaired,
      paired_count: pairedCount,
      unpaired_count: unpairedCount,
    },
    200,
  )
})
