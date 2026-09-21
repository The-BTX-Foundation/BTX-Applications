// Pure helpers behind Program Planning's quarterly roadmap -- kept out of
// the component so ProgramPlanning.vue stays a thin
// fetch/select/render shell. Every function here is a plain data
// transform: no store access, no Vue reactivity, easy to unit-test in
// isolation if that's ever added.

const MONTH_ABBREVIATIONS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

// Quarter metadata in display order -- both the label ("Jan–Mar") and the
// 1-indexed month range each quarter covers.
const QUARTERS = [
  { key: 'Q1', range: 'Jan–Mar', firstMonth: 1, lastMonth: 3 },
  { key: 'Q2', range: 'Apr–Jun', firstMonth: 4, lastMonth: 6 },
  { key: 'Q3', range: 'Jul–Sep', firstMonth: 7, lastMonth: 9 },
  { key: 'Q4', range: 'Oct–Dec', firstMonth: 10, lastMonth: 12 },
]

// Splits a 'YYYY-MM-DD' due_date into its parts via string indexing rather
// than `new Date(dueDate)`, which parses as UTC midnight and can then
// render as the previous calendar day once formatted back out in a
// negative-UTC-offset browser -- the same off-by-one ProgramPlanning.vue's
// old timeline code already worked around.
function parseDueDate(dueDate) {
  const [year, month, day] = dueDate.split('-').map(Number)
  return { year, month, day }
}

// Abbreviated month for a milestone's due_date chip, e.g. "Sep" -- null
// when there's no due_date at all (the caller shows no chip in that case).
export function monthAbbreviation(dueDate) {
  if (!dueDate) return null
  const { month } = parseDueDate(dueDate)
  return MONTH_ABBREVIATIONS[month - 1]
}

// "Sep 20, 2026" -- same string-split approach as monthAbbreviation, for
// the same timezone-safety reason. Used by the expanded milestone body,
// the one place the full date (not just the month chip) is shown.
export function formatFullDate(dueDate) {
  const { year, month, day } = parseDueDate(dueDate)
  return `${MONTH_ABBREVIATIONS[month - 1]} ${day}, ${year}`
}

// Which quarter a due_date's month falls in ('Q1'-'Q4'), or null for an
// undated milestone (the caller groups those into "Unscheduled" instead).
export function quarterForDueDate(dueDate) {
  if (!dueDate) return null
  const { month } = parseDueDate(dueDate)
  return QUARTERS.find((q) => month >= q.firstMonth && month <= q.lastMonth).key
}

// Splits "CBC Symposium Awardees (MS-010)" into { code: 'MS-010', title:
// 'CBC Symposium Awardees' } -- the actual program_plan_milestones naming
// convention observed in the data is a trailing "(CODE)" suffix, not the
// leading-prefix shape a first guess might assume. Requires the
// parenthetical to look like a real code (letters-dash-digits, e.g.
// "MS-010") so a milestone whose name just happens to end in parentheses
// for some other reason (2021's plan has several, e.g. "(TBD - Nov)")
// isn't mistaken for one. No code column exists in this schema, and no
// match here means no code -- never invented, per the milestone_name
// being the only source of truth for it.
const CODE_SUFFIX_PATTERN = /^(.+?)\s*\(([A-Z]{2,5}-\d{1,4})\)$/

export function splitMilestoneCode(milestoneName) {
  const match = milestoneName.match(CODE_SUFFIX_PATTERN)
  if (!match) return { code: null, title: milestoneName }
  return { code: match[2], title: match[1] }
}

// Complete/Not started only -- program_plan_milestones has no
// per-deliverable or progress column of any kind (schema: id, plan_year,
// milestone_name, is_complete, due_date, updated_at), so "In progress"
// can never be derived for an individual milestone today. This function
// is intentionally the one place that would change if such a column
// (e.g. a per-milestone task-completion fraction) is ever added -- every
// caller below already handles an 'in-progress' result correctly, it
// simply never occurs yet.
export function milestoneStatus(milestone) {
  return milestone.is_complete ? 'complete' : 'not-started'
}

// Groups a plan's milestones into quarter buckets (only quarters that
// actually have milestones, in Q1-Q4 order) plus a trailing "Unscheduled"
// bucket for milestones with no due_date -- omitted entirely when empty.
// Within a quarter, sorts by due_date first, then by code/title (an
// undated tiebreak that can't happen within a dated quarter bucket, but
// keeps the sort stable if two milestones share a due_date).
// Each bucket also carries its own summary (complete/total, whether any
// milestone in it is 'in-progress') and whether its timeline node should
// render filled -- used directly by the template, so it doesn't
// recompute this per render.
export function groupMilestonesByQuarter(milestones) {
  const buckets = new Map()

  function bucketFor(key, label) {
    if (!buckets.has(key)) {
      buckets.set(key, { key, label, milestones: [] })
    }
    return buckets.get(key)
  }

  for (const milestone of milestones) {
    const quarter = quarterForDueDate(milestone.due_date)
    const bucket = quarter
      ? bucketFor(quarter, `${quarter} · ${QUARTERS.find((q) => q.key === quarter).range}`)
      : bucketFor('unscheduled', 'Unscheduled')
    bucket.milestones.push(milestone)
  }

  const ordered = [
    ...QUARTERS.map((q) => q.key).filter((key) => buckets.has(key)),
    ...(buckets.has('unscheduled') ? ['unscheduled'] : []),
  ].map((key) => buckets.get(key))

  for (const bucket of ordered) {
    bucket.milestones.sort((a, b) => {
      if (a.due_date && b.due_date && a.due_date !== b.due_date) {
        return a.due_date < b.due_date ? -1 : 1
      }
      if (a.due_date !== b.due_date) return a.due_date ? -1 : 1
      const aCode = splitMilestoneCode(a.milestone_name).code ?? a.milestone_name
      const bCode = splitMilestoneCode(b.milestone_name).code ?? b.milestone_name
      return aCode < bCode ? -1 : aCode > bCode ? 1 : 0
    })

    const statuses = bucket.milestones.map(milestoneStatus)
    const completeCount = statuses.filter((s) => s === 'complete').length
    // Always 0 today (see milestoneStatus's own comment), kept as a real
    // count rather than a boolean so the quarter-header text ("N in
    // progress" vs. "X of Y complete") is already correct the moment a
    // real per-milestone progress source exists.
    bucket.inProgressCount = statuses.filter((s) => s === 'in-progress').length
    bucket.completeCount = completeCount
    bucket.totalCount = bucket.milestones.length
    // A hollow node has no rail-color meaning of its own, but Unscheduled
    // milestones were never plotted on a due_date axis in the first
    // place -- filling its node the same way a dated quarter's node fills
    // (by having a complete milestone) is still the right rule, it just
    // never lines up with an actual calendar position.
    bucket.nodeFilled = completeCount > 0
  }

  return ordered
}
