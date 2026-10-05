import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'
import { RUBRIC_CRITERIA } from '@/lib/scoringRubric'

const CURRENT_CYCLE_YEAR = new Date().getFullYear()
const DIRECTORY_COLUMNS = 'applicant_id, applicant_code, cycle_year, initials, submitted_at'
const SCORE_COLUMNS = 'applicant_id, interviewer_label, status, weighted_total, criterion_scores'

// Every applicant is paired with exactly two interviewers by
// run-interview-pairing's own design (see that function's algorithm
// comment, 20261002130000_scholarship_interview_pairing.sql) -- exported
// only to phrase "X of 2 interviewers published" in Scoring.vue, not
// enforced or validated by this store.
export const EXPECTED_INTERVIEWERS = 2

// Pinia store for the Scoring page: every directory applicant for the
// current cycle, annotated with its own scholarship_scores rows, plus the
// cycle-wide tiles and rubric averages derived from that same data. A
// single fetch feeds "Your scoring queue", "All applicants this cycle",
// and both aggregate sections -- no page-specific re-fetching.
export const useScholarshipScoringStore = defineStore('scholarshipScoring', () => {
  const applicants = ref([])
  const scoresByApplicant = ref(new Map())
  const loading = ref(false)
  const error = ref(null)

  async function fetchCycle() {
    loading.value = true
    error.value = null

    try {
      const [directoryResult, scoresResult] = await Promise.all([
        supabase
          .from('scholarship_applicant_directory')
          .select(DIRECTORY_COLUMNS)
          .eq('cycle_year', CURRENT_CYCLE_YEAR)
          .order('submitted_at', { ascending: false }),
        supabase.from('scholarship_scores').select(SCORE_COLUMNS).eq('cycle_year', CURRENT_CYCLE_YEAR),
      ])

      if (directoryResult.error) throw directoryResult.error
      if (scoresResult.error) throw scoresResult.error

      applicants.value = directoryResult.data

      const map = new Map()
      for (const row of scoresResult.data) {
        const list = map.get(row.applicant_id) ?? []
        list.push(row)
        map.set(row.applicant_id, list)
      }
      scoresByApplicant.value = map
    } catch (fetchError) {
      error.value = fetchError.message
    } finally {
      loading.value = false
    }
  }

  // Every directory applicant for the current cycle, annotated with its
  // own score rows -- the single source of truth "Your scoring queue",
  // "All applicants this cycle", and the tiles below all derive from.
  // `combinedScore` averages only PUBLISHED rows (a draft score is this
  // interviewer's own working number, not something to blend into a
  // combined figure yet) -- null until at least one is published.
  const allApplicants = computed(() =>
    applicants.value.map((applicant) => {
      const scores = scoresByApplicant.value.get(applicant.applicant_id) ?? []
      const publishedScores = scores.filter((s) => s.status === 'published')
      const combinedScore =
        publishedScores.length > 0
          ? publishedScores.reduce((sum, s) => sum + s.weighted_total, 0) / publishedScores.length
          : null
      return { ...applicant, scores, publishedScores, combinedScore }
    }),
  )

  // "Your scoring queue" -- every applicant this cycle where `label` has
  // no PUBLISHED score row yet. A DRAFT by `label` still leaves the
  // applicant in the queue (it isn't done) -- ScoreApplicant.vue's own
  // "Draft saved" indicator is what surfaces that, not removal from this
  // list.
  function queueForLabel(label) {
    return allApplicants.value.filter(
      (applicant) => !applicant.publishedScores.some((s) => s.interviewer_label === label),
    )
  }

  // Cycle-wide tiles. "scored" = applicants with >= 1 published score
  // (not necessarily both interviewers); "pending" = the rest -- scored +
  // pending always equals the cycle's total applicant count. "average" is
  // a flat mean of weighted_total across every PUBLISHED score ROW this
  // cycle, not deduped per applicant (an applicant with two published
  // scores counts twice) -- the simplest honest definition available
  // without a combined/final-score concept, which doesn't exist yet
  // (scholarship_decisions.final_score is never written by this page).
  const tiles = computed(() => {
    const total = applicants.value.length
    const scored = allApplicants.value.filter((a) => a.publishedScores.length > 0).length
    const publishedRows = [...scoresByApplicant.value.values()].flat().filter((s) => s.status === 'published')
    const average =
      publishedRows.length > 0
        ? publishedRows.reduce((sum, s) => sum + s.weighted_total, 0) / publishedRows.length
        : null
    return { total, scored, pending: total - scored, average }
  })

  // Per-criterion average across every PUBLISHED score row this cycle --
  // same flat-average simplification as tiles.average above, applied per
  // rubric key instead of to weighted_total.
  const rubricAverages = computed(() => {
    const publishedRows = [...scoresByApplicant.value.values()].flat().filter((s) => s.status === 'published')
    const sums = {}
    const counts = {}
    for (const row of publishedRows) {
      for (const key of Object.keys(row.criterion_scores ?? {})) {
        sums[key] = (sums[key] ?? 0) + row.criterion_scores[key]
        counts[key] = (counts[key] ?? 0) + 1
      }
    }
    return RUBRIC_CRITERIA.map((criterion) => ({
      ...criterion,
      average: counts[criterion.key] ? sums[criterion.key] / counts[criterion.key] : null,
    }))
  })

  return { applicants, allApplicants, loading, error, tiles, rubricAverages, fetchCycle, queueForLabel }
})
