// sync-program-plan-tasks
//
// Receives one plan year's full WBS deliverable list from the Program
// Planning Apps Script and replaces public.program_plan_tasks' rows for
// that plan_year via the replace_program_plan_tasks() function (see its
// own migration comment for why this is a full replace, not an upsert --
// this table has no natural per-row unique key). Deployed with
// --no-verify-jwt for the same reason as every other sync function in
// this project: Apps Script's UrlFetchApp has no Supabase session to
// attach a JWT to, so the x-sync-secret header below is the real
// authentication here, not Supabase's own JWT check.
//
// No CORS handling -- matches every other sync function in this project
// (sync-donor-impact, sync-fundraising-health, sync-program-plan-progress,
// sync-program-plan-milestones): the caller is Apps Script's UrlFetchApp,
// a server-to-server request, not a browser fetch() a preflight would
// ever apply to.
//
// Runs with the service role key (see getServiceClient below), so it
// bypasses RLS entirely -- required here since there's no signed-in user
// for this request to act as, and program_plan_tasks has no INSERT/
// UPDATE/DELETE policy for any role (see its own migration comment on
// why that's a deliberate tightening, not an oversight).
//
// Self-contained by design, like every sync function here: each Edge
// Function deploys as an independent Deno module, so patterns (json(),
// getServiceClient(), isAuthorized(), the due-date parser) are copied
// from the reference functions rather than imported from them.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const MIN_PLAN_YEAR = 2000
const MAX_PLAN_YEAR = 2100
const MAX_TASKS = 500
const MAX_TASK_NAME_LENGTH = 300

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
// PROGRAM_PLAN_TASKS_SYNC_SECRET value set via `supabase secrets set` --
// a distinct secret from PROGRAM_PLAN_SYNC_SECRET/
// PROGRAM_PLAN_MILESTONES_SYNC_SECRET, so any one of the three can be
// rotated without affecting the others, even though the Apps Script
// currently happens to send the same secret value to all of them (one
// script, one Supabase project). Three distinct failure cases -- the
// secret isn't configured server-side, the header is missing, or the
// header doesn't match -- are all folded into the same generic result so
// an unauthenticated caller can't use the response to fingerprint which
// case occurred.
function isAuthorized(req: Request): boolean {
  const expected = Deno.env.get('PROGRAM_PLAN_TASKS_SYNC_SECRET')
  const provided = req.headers.get('x-sync-secret')
  return Boolean(expected) && Boolean(provided) && provided === expected
}

// Coerces a value into a finite whole number. undefined/null/'' all map
// to `null` (missing); anything else that isn't a clean whole number
// maps to `undefined` (invalid). Same shape as the reference functions'
// own parseInteger, duplicated rather than shared per this project's
// self-contained-function convention.
function parseInteger(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null
  const n = typeof value === 'string' ? Number(value) : value
  if (typeof n !== 'number' || !Number.isFinite(n)) return undefined
  return Number.isInteger(n) ? n : undefined
}

// Same UTC-safe YYYY-MM-DD extraction as sync-program-plan-milestones'
// own parseMilestoneDueDate (handles both a bare date string and the
// full ISO timestamp JSON.stringify(Date) produces from a Sheets date
// cell). undefined/null/'' map to `null` (a deliverable commonly has no
// due date of its own, distinct from its milestone's); anything else
// that isn't a real calendar date maps to `undefined` (invalid).
function parseDueDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return undefined
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return undefined
  const [, yearStr, monthStr, dayStr] = match
  const year = Number(yearStr)
  const month = Number(monthStr)
  const day = Number(dayStr)
  const check = new Date(Date.UTC(year, month - 1, day))
  const isValidCalendarDate =
    check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day
  if (!isValidCalendarDate) return undefined
  return `${yearStr}-${monthStr}-${dayStr}`
}

// Case- and whitespace-insensitive status normalization -- the WBS sheet's
// own status column is free text a human types into, not a fixed
// dropdown, so "In Progress", "in-progress", and "WIP" all need to land
// on the same canonical value the database CHECK constraint (and the
// frontend's status pill) actually expects. Collapses internal whitespace
// runs to a single space in addition to trimming/lowercasing, so e.g. a
// stray double space or tab still matches. Anything not in one of the
// three sets is genuinely unrecognized -- returns undefined so the caller
// rejects the whole request with a 400 naming the row and the raw value,
// rather than silently guessing.
function normalizeStatus(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const key = value.trim().toLowerCase().replace(/\s+/g, ' ')
  if (['not started', 'todo', 'to do', ''].includes(key)) return 'Not started'
  if (['in progress', 'in-progress', 'started', 'wip'].includes(key)) return 'In progress'
  if (['complete', 'completed', 'done'].includes(key)) return 'Complete'
  return undefined
}

// Trim + uppercase only -- e.g. " ms-005 " -> "MS-005". Deliberately does
// NOT reject a value that doesn't look like a real "MS-005"-shaped code:
// matching a deliverable to its milestone is the frontend's job
// (programRoadmap.js tries milestone_code first, then falls back to a
// normalized milestone_name match), and a deliverable whose code doesn't
// match anything just surfaces there as "unassigned" instead of being
// rejected here at sync time. Absent/null/empty all map to `null` --
// never invented.
function normalizeMilestoneCode(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') return undefined
  const code = value.trim().toUpperCase()
  return code === '' ? null : code
}

// One normalized, ready-to-insert deliverable row.
interface ParsedTask {
  milestone_code: string | null
  milestone_name: string | null
  task_name: string
  status: string
  due_date: string | null
  sort_order: number
}

// Validates and normalizes one raw task entry from the request body.
// Returns the cleaned row, or a string naming what was wrong with it --
// the caller turns that into a 400 identifying which array index failed,
// same convention as sync-program-plan-milestones' own
// parseMilestoneEntry. sort_order falls back to the entry's own index
// when omitted, preserving the sheet's natural row order by default
// rather than collapsing every omitted sort_order to the same value.
function parseTask(entry: unknown, index: number): ParsedTask | string {
  if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
    return `tasks[${index}] must be an object`
  }
  const record = entry as Record<string, unknown>

  const rawTaskName = record.task_name
  if (typeof rawTaskName !== 'string' || rawTaskName.trim() === '') {
    return `tasks[${index}].task_name is required and must be a non-empty string`
  }
  const taskName = rawTaskName.trim()
  if (taskName.length > MAX_TASK_NAME_LENGTH) {
    return `tasks[${index}].task_name must be ${MAX_TASK_NAME_LENGTH} characters or fewer`
  }

  const status = normalizeStatus(record.status)
  if (status === undefined) {
    return `tasks[${index}].status has an unrecognized value: ${JSON.stringify(record.status)}`
  }

  const milestoneCode = normalizeMilestoneCode(record.milestone_code)
  if (milestoneCode === undefined) {
    return `tasks[${index}].milestone_code must be a string, or omitted/null`
  }

  const rawMilestoneName = record.milestone_name
  let milestoneName: string | null = null
  if (rawMilestoneName !== undefined && rawMilestoneName !== null && rawMilestoneName !== '') {
    if (typeof rawMilestoneName !== 'string') {
      return `tasks[${index}].milestone_name must be a string`
    }
    milestoneName = rawMilestoneName.trim()
  }

  const dueDate = parseDueDate(record.due_date)
  if (dueDate === undefined) {
    return `tasks[${index}].due_date must be a valid YYYY-MM-DD date, or omitted/blank for no due date`
  }

  let sortOrder = index
  if (record.sort_order !== undefined && record.sort_order !== null) {
    const parsed = parseInteger(record.sort_order)
    if (parsed === null || parsed === undefined) {
      return `tasks[${index}].sort_order must be a whole number`
    }
    sortOrder = parsed
  }

  return {
    milestone_code: milestoneCode,
    milestone_name: milestoneName,
    task_name: taskName,
    status,
    due_date: dueDate,
    sort_order: sortOrder,
  }
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

  const planYear = parseInteger(body.plan_year)
  if (planYear === null || planYear === undefined) {
    return json({ success: false, error: 'plan_year is required and must be a valid whole number' }, 400)
  }
  if (planYear < MIN_PLAN_YEAR || planYear > MAX_PLAN_YEAR) {
    return json({ success: false, error: `plan_year must be between ${MIN_PLAN_YEAR} and ${MAX_PLAN_YEAR}` }, 400)
  }

  if (!Array.isArray(body.tasks)) {
    return json({ success: false, error: 'tasks is required and must be an array' }, 400)
  }
  if (body.tasks.length > MAX_TASKS) {
    return json({ success: false, error: `tasks must contain at most ${MAX_TASKS} entries` }, 400)
  }

  // dry_run/allow_empty both default to false when omitted -- Apps
  // Script's normal sync call omits both, so the common case is "write
  // for real, reject an empty list."
  const dryRun = body.dry_run === undefined ? false : body.dry_run
  if (typeof dryRun !== 'boolean') {
    return json({ success: false, error: 'dry_run must be a boolean' }, 400)
  }

  const allowEmpty = body.allow_empty === undefined ? false : body.allow_empty
  if (typeof allowEmpty !== 'boolean') {
    return json({ success: false, error: 'allow_empty must be a boolean' }, 400)
  }

  // A broken sheet read (e.g. a renamed tab, a script exception before
  // rows are collected) is far more likely to produce an accidentally
  // empty array than a genuinely-empty plan, so this is rejected by
  // default -- allow_empty: true is the explicit opt-in for the rare case
  // a plan year really has zero deliverables synced.
  if (body.tasks.length === 0 && !allowEmpty) {
    return json(
      { success: false, error: 'tasks is empty -- pass allow_empty: true to intentionally clear this plan year' },
      400,
    )
  }

  // All-or-nothing validation, same as sync-program-plan-milestones' own
  // milestones array: this list is one coherent snapshot of "every
  // deliverable this plan year currently has." Rejecting the whole
  // request on the first bad entry (rather than dropping just that one)
  // avoids a partially-synced plan year silently missing a row.
  const tasks: ParsedTask[] = []
  for (let i = 0; i < body.tasks.length; i++) {
    const parsed = parseTask(body.tasks[i], i)
    if (typeof parsed === 'string') {
      return json({ success: false, error: parsed }, 400)
    }
    tasks.push(parsed)
  }

  const byStatus: Record<string, number> = { 'Not started': 0, 'In progress': 0, Complete: 0 }
  for (const task of tasks) {
    byStatus[task.status] += 1
  }

  // dry_run never touches the database -- returns exactly what would be
  // written, so the Apps Script (or a human debugging a sync) can inspect
  // the normalized result before committing to it.
  if (dryRun) {
    return json({ success: true, dry_run: true, plan_year: planYear, tasks, by_status: byStatus }, 200)
  }

  const supabase = getServiceClient()
  const { data, error } = await supabase.rpc('replace_program_plan_tasks', {
    p_plan_year: planYear,
    p_tasks: tasks,
  })

  if (error) {
    return json({ success: false, error: error.message }, 500)
  }

  return json({ success: true, plan_year: planYear, inserted: data, by_status: byStatus }, 200)
})
