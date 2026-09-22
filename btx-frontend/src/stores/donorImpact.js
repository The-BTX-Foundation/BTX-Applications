import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Single source of truth for every donor_impact metric. ProgramImpact.vue's
// field display, chart tabs, and this store's column list/insert defaults
// are all derived from this array instead of being hand-duplicated in
// several separate places — add a metric here and it appears everywhere
// it needs to.
//
// - category: 'Reach' | 'Investment' | 'Engagement' | 'Outcomes' | 'Equity'
//   | 'Stewardship' — groups display fields into tabs.
// - format: 'currency' | 'percent' | 'number' — drives display formatting
//   (both the field value and, for the metric's chart tab, the bar label).
// - editable: true for real donor_impact columns (selected/inserted by
//   this store); false for values derived client-side from other columns.
//   Historically also meant "editable in the form" before ProgramImpact.vue
//   became read-only display -- the name is a holdover from that, but the
//   selected/inserted meaning below is still exactly what it drives.
// - computed: for non-editable metrics, a fn(cycle) deriving its value —
//   never persisted, so it's excluded from CYCLE_COLUMNS/inserts.
export const DONOR_IMPACT_METRICS = [
  // -- Reach --
  { key: 'students_reached', label: 'Students Reached', category: 'Reach', format: 'number', editable: true },
  { key: 'scholarships_awarded', label: 'Scholarships Awarded', category: 'Reach', format: 'number', editable: true },
  { key: 'applicants_count', label: 'Number of Applicants', category: 'Reach', format: 'number', editable: true },
  { key: 'geographic_spread_count', label: 'Geographic Spread', category: 'Reach', format: 'number', editable: true },

  // -- Investment --
  { key: 'funds_granted', label: 'Funds Granted', category: 'Investment', format: 'currency', editable: true },
  {
    key: 'scholarship_funds_awarded',
    label: 'Scholarship Funds Awarded',
    category: 'Investment',
    format: 'currency',
    editable: true,
  },
  {
    key: 'other_program_funds_awarded',
    label: 'Other Program Funds Awarded',
    category: 'Investment',
    format: 'currency',
    editable: true,
  },
  {
    key: 'avg_scholarship_size',
    label: 'Average Scholarship Size',
    category: 'Investment',
    format: 'currency',
    editable: false,
    // Guards divide-by-zero for draft cycles that start at 0 scholarships.
    computed: (cycle) =>
      cycle.scholarships_awarded > 0 ? cycle.scholarship_funds_awarded / cycle.scholarships_awarded : 0,
    // The columns this computed value derives from — see metricHasRealValue below.
    sourceKeys: ['scholarship_funds_awarded', 'scholarships_awarded'],
  },
  {
    key: 'cost_per_student',
    label: 'Cost Per Student Served',
    category: 'Investment',
    format: 'currency',
    editable: false,
    // Scholarship + other program funds only — funds_granted is a separate,
    // broader figure and is intentionally excluded from this ratio.
    computed: (cycle) =>
      cycle.students_reached > 0
        ? (cycle.scholarship_funds_awarded + cycle.other_program_funds_awarded) / cycle.students_reached
        : 0,
    // The columns this computed value derives from — see metricHasRealValue below.
    sourceKeys: ['scholarship_funds_awarded', 'other_program_funds_awarded', 'students_reached'],
  },

  // -- Engagement --
  { key: 'workshops_held', label: 'Number of Workshops/Events Held', category: 'Engagement', format: 'number', editable: true },
  { key: 'attendance_per_workshop', label: 'Attendance Per Workshop', category: 'Engagement', format: 'number', editable: true },
  { key: 'mentor_volunteer_hours', label: 'Mentor/Volunteer Hours', category: 'Engagement', format: 'number', editable: true },
  {
    key: 'repeat_engagement',
    label: 'Repeat Engagement (2+ Programs)',
    category: 'Engagement',
    format: 'number',
    editable: true,
  },
  {
    key: 'students_sponsored_travel',
    label: 'Students Sponsored for Travel',
    category: 'Engagement',
    format: 'number',
    editable: true,
  },
  {
    key: 'students_sponsored_certifications',
    label: 'Students Sponsored for Certifications',
    category: 'Engagement',
    format: 'number',
    editable: true,
  },

  // -- Outcomes --
  {
    key: 'retention_graduation_rate',
    label: 'Retention/Graduation Rate',
    category: 'Outcomes',
    format: 'percent',
    editable: true,
  },
  { key: 'gpa_improvement', label: 'GPA Improvement', category: 'Outcomes', format: 'number', editable: true },
  { key: 'internships_received', label: 'Internships Received', category: 'Outcomes', format: 'number', editable: true },
  {
    key: 'post_graduation_outcomes',
    label: 'Post-Graduation Outcomes',
    category: 'Outcomes',
    format: 'percent',
    editable: true,
  },

  // -- Equity --
  {
    key: 'pct_first_generation',
    label: '% First-Generation Students',
    category: 'Equity',
    format: 'percent',
    editable: true,
  },
  {
    key: 'pct_underrepresented_low_income',
    label: '% Underrepresented/Low-Income',
    category: 'Equity',
    format: 'percent',
    editable: true,
  },

  // -- Stewardship --
  {
    key: 'pct_donations_to_programs',
    label: '% of Donations to Programs vs. Overhead',
    category: 'Stewardship',
    format: 'percent',
    editable: true,
  },
]

// True when `cycle` carries a genuine (non-null) value for `metric` — for
// an editable metric, its own column must be non-null; for a computed
// metric, every column listed in its sourceKeys must be non-null. Cycles
// created via createCycle() below always zero out every editable column
// (a real recorded 0, not a gap), but cycles created before a column
// existed hold real `null` there and were never backfilled — this is what
// tells those two cases apart. Used by ProgramImpact.vue to decide which
// metrics get a by-year chart series pill and which cycles belong on the
// chart's x-axis at all.
export function metricHasRealValue(cycle, metric) {
  const keys = metric.editable ? [metric.key] : (metric.sourceKeys ?? [])
  return keys.length > 0 && keys.every((key) => cycle[key] !== null && cycle[key] !== undefined)
}

// True when `cycle` has a genuine value for at least one metric at all —
// used to keep a cycle whose columns are ALL still unset (never synced)
// off a by-year chart's x-axis, rather than drawing it as a phantom column
// of nothing-but-stubs.
export function cycleHasAnyData(cycle) {
  return DONOR_IMPACT_METRICS.some((metric) => metricHasRealValue(cycle, metric))
}

const EDITABLE_METRIC_KEYS = DONOR_IMPACT_METRICS.filter((m) => m.editable).map((m) => m.key)

// Shared column list so fetchCycles, createCycle, and saveAndPublish all
// return identically shaped rows — keeps rows patched into `cycles` after a
// write consistent with rows loaded from the initial fetch. Derived from
// DONOR_IMPACT_METRICS so a new editable metric is selected automatically.
const CYCLE_COLUMNS = ['metric_id', 'cycle_year', 'published', ...EDITABLE_METRIC_KEYS].join(', ')

// Pinia store for Donor Impact. Reads/writes go through
// Supabase's RLS policies on `donor_impact` (admin: view/create/edit;
// board and reviewer: view-only), so the rows/actions available here are
// already scoped to what the signed-in user is allowed to do — no
// client-side role filtering is needed on top of this.
export const useDonorImpactStore = defineStore('donorImpact', () => {
  const cycles = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Total funds granted across every donor_impact row currently loaded
  // (i.e. everything visible to this user under RLS — admin/board see all
  // cycles). Derived from fetchCycles()'s data rather than a separate
  // query, since PostgREST has no SUM() aggregate without a DB-side RPC.
  const totalRaised = computed(() => cycles.value.reduce((sum, cycle) => sum + cycle.funds_granted, 0))

  // Loads every reporting cycle visible under RLS, most recent year first.
  async function fetchCycles() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('donor_impact')
      .select(CYCLE_COLUMNS)
      .order('cycle_year', { ascending: false })

    if (fetchError) {
      error.value = fetchError.message
    } else {
      cycles.value = data
    }
    loading.value = false
  }

  // Creates a new reporting cycle as an unpublished draft. RLS restricts
  // this insert to admins, so it will fail with an insert error for board
  // (view-only) or any other role.
  async function createCycle(cycleYear) {
    error.value = null

    // Zero out every editable metric so a fresh draft always has the full
    // set of columns present, regardless of how many metrics exist.
    const zeroedMetrics = Object.fromEntries(EDITABLE_METRIC_KEYS.map((key) => [key, 0]))

    const { data, error: insertError } = await supabase
      .from('donor_impact')
      .insert({
        cycle_year: cycleYear,
        ...zeroedMetrics,
        published: false,
      })
      .select(CYCLE_COLUMNS)
      .single()

    if (insertError) {
      error.value = insertError.message
      return null
    }

    // Keep the list sorted most-recent-year-first, same order fetchCycles loads.
    cycles.value = [...cycles.value, data].sort((a, b) => b.cycle_year - a.cycle_year)
    return data
  }

  // Saves a cycle's metrics and marks it published. RLS restricts this
  // update to admins, so it will fail with an update error for board
  // (view-only) or any other role.
  async function saveAndPublish(metricId, metrics) {
    error.value = null

    const { data, error: updateError } = await supabase
      .from('donor_impact')
      .update({ ...metrics, published: true })
      .eq('metric_id', metricId)
      .select(CYCLE_COLUMNS)
      .single()

    if (updateError) {
      error.value = updateError.message
      return
    }

    // Patch the single row in place rather than refetching the whole list.
    const index = cycles.value.findIndex((cycle) => cycle.metric_id === metricId)
    if (index !== -1) {
      cycles.value[index] = data
    }
  }

  return { cycles, loading, error, totalRaised, fetchCycles, createCycle, saveAndPublish }
})
