import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

const DIRECTORY_COLUMNS = 'applicant_id, applicant_code, cycle_year, initials, submitted_at'
const SCORE_COLUMNS = 'interviewer_label, status, criterion_scores, notes, general_notes, weighted_total'

// Pinia store for the ScoreApplicant detail page: one applicant's real
// directory header, every existing scholarship_scores row for that
// applicant (split below into this session's own row and every other
// interviewer's row), and the real save-score write path.
export const useScholarshipScoreApplicantStore = defineStore('scholarshipScoreApplicant', () => {
  const applicant = ref(null)
  const existingScore = ref(null)
  const otherScores = ref([])
  const loading = ref(false)
  const error = ref(null)

  const saving = ref(false)
  const saveError = ref(null)

  // Loads this applicant's directory header AND every scholarship_scores
  // row for them in one pass, then splits that single result into
  // `existingScore` (this session's own label, if any -- used to resume a
  // draft and to know whether Publish is already blocked server-side) and
  // `otherScores` (every other interviewer's row -- used for the "has the
  // other interviewer started" note).
  async function fetchApplicant(applicantId, label) {
    loading.value = true
    error.value = null

    try {
      const [applicantResult, scoresResult] = await Promise.all([
        supabase
          .from('scholarship_applicant_directory')
          .select(DIRECTORY_COLUMNS)
          .eq('applicant_id', applicantId)
          .maybeSingle(),
        supabase.from('scholarship_scores').select(SCORE_COLUMNS).eq('applicant_id', applicantId),
      ])

      if (applicantResult.error) throw applicantResult.error
      if (scoresResult.error) throw scoresResult.error

      applicant.value = applicantResult.data
      existingScore.value = scoresResult.data.find((s) => s.interviewer_label === label) ?? null
      otherScores.value = scoresResult.data.filter((s) => s.interviewer_label !== label)
    } catch (fetchError) {
      error.value = fetchError.message
    } finally {
      loading.value = false
    }
  }

  // Calls save-score -- a real network write, not simulated. Takes the
  // caller's session JWT and self-typed label as explicit arguments
  // rather than reaching into useAuthStore/useReviewerIdentityStore
  // itself, same convention as scholarshipInterviews.js's
  // saveAvailability(). Returns the parsed response body on success (the
  // component uses parsed.status to decide what to do next), or null on
  // any failure -- saveError is set either way for display.
  async function saveScore({ applicantId, label, accessToken, criterionScores, notes, generalNotes, publish }) {
    saving.value = true
    saveError.value = null

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-score`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          applicant_id: applicantId,
          interviewer_label: label,
          criterion_scores: criterionScores,
          notes,
          general_notes: generalNotes,
          publish,
        }),
      })

      const parsed = await response.json().catch(() => null)

      if (!response.ok) {
        if (parsed?.error === 'already_published') {
          saveError.value = 'This score has already been published and can no longer be changed.'
        } else {
          saveError.value =
            typeof parsed?.message === 'string' ? parsed.message : 'Something went wrong saving this score. Please try again.'
        }
        return null
      }

      // Reflects the real saved row back into existingScore from what was
      // just sent + what the server returned, rather than re-fetching --
      // same "trust the response, don't re-request" pattern
      // scholarshipInterviews.js's saveAvailability() uses.
      existingScore.value = {
        interviewer_label: label,
        status: parsed.status,
        criterion_scores: criterionScores,
        notes,
        general_notes: generalNotes,
        weighted_total: parsed.weighted_total,
      }
      return parsed
    } catch {
      saveError.value = 'Something went wrong saving this score. Please check your connection and try again.'
      return null
    } finally {
      saving.value = false
    }
  }

  return { applicant, existingScore, otherScores, loading, error, saving, saveError, fetchApplicant, saveScore }
})
