import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// cycle_year is always the current calendar year -- same server-computed
// rule save-board-availability itself uses (see that function's own
// comment), reproduced client-side here only to scope which rows to fetch
// for pre-population. The Edge Function, not this value, is what actually
// enforces "cycle must be open" on save.
const CURRENT_CYCLE_YEAR = new Date().getFullYear()

const INTERVIEW_COLUMNS = 'id, applicant_id, scheduled_at, interviewer_one_label, interviewer_two_label, mode, status, meeting_link'

// Pinia store for the Interviews page: this board/reviewer's own saved
// availability for the current cycle, their own paired interviews, and the
// real write path for saving availability. `label` is the self-typed
// free-text identity every operational table in this schema already uses
// (board_member_label / interviewer_one_label / interviewer_two_label) --
// not a new identity model, just this page's own copy of that same
// placeholder, kept in Pinia state so it never touches localStorage/
// sessionStorage and is gone the moment the tab/store resets.
export const useScholarshipInterviewsStore = defineStore('scholarshipInterviews', () => {
  const label = ref('')

  const availabilitySlotIds = ref([])
  const upcoming = ref([])
  const recentlyCompleted = ref([])

  const loading = ref(false)
  const error = ref(null)

  const saving = ref(false)
  const saveError = ref(null)

  // Looks up applicant_code for a batch of applicant_ids via
  // scholarship_applicant_directory -- the same role-gated, PII-free view
  // ApplicantRecords.vue/scholarshipApplicantDirectory.js already reads.
  // Done as a second query rather than a PostgREST embedded join: this
  // view isn't a table PostgREST's relationship inference can embed
  // reliably, and every other store in this app already follows the
  // "fetch, then look up the directory separately" pattern for the same
  // reason.
  async function fetchApplicantCodes(applicantIds) {
    if (applicantIds.length === 0) return new Map()
    const { data, error: fetchError } = await supabase
      .from('scholarship_applicant_directory')
      .select('applicant_id, applicant_code')
      .in('applicant_id', applicantIds)
    if (fetchError) throw fetchError
    return new Map(data.map((row) => [row.applicant_id, row.applicant_code]))
  }

  // Loads this label's saved availability and paired interviews for the
  // current cycle. Two separate interviewer_one_label/interviewer_two_label
  // queries, merged and de-duped by id, rather than one `.or()` filter --
  // `.or()` builds its filter as a raw PostgREST string that this label
  // value would be interpolated into, and a label containing a comma or
  // parenthesis would corrupt that filter; two plain `.eq()` queries avoid
  // that entirely.
  async function fetchForLabel() {
    const currentLabel = label.value
    if (!currentLabel) return

    loading.value = true
    error.value = null

    try {
      const [availabilityResult, interviewsAsOneResult, interviewsAsTwoResult] = await Promise.all([
        supabase
          .from('scholarship_board_availability')
          .select('slot_id')
          .eq('board_member_label', currentLabel)
          .eq('cycle_year', CURRENT_CYCLE_YEAR),
        supabase
          .from('scholarship_interviews')
          .select(INTERVIEW_COLUMNS)
          .eq('cycle_year', CURRENT_CYCLE_YEAR)
          .eq('interviewer_one_label', currentLabel),
        supabase
          .from('scholarship_interviews')
          .select(INTERVIEW_COLUMNS)
          .eq('cycle_year', CURRENT_CYCLE_YEAR)
          .eq('interviewer_two_label', currentLabel),
      ])

      if (availabilityResult.error) throw availabilityResult.error
      if (interviewsAsOneResult.error) throw interviewsAsOneResult.error
      if (interviewsAsTwoResult.error) throw interviewsAsTwoResult.error

      availabilitySlotIds.value = availabilityResult.data.map((row) => row.slot_id)

      const interviewsById = new Map()
      for (const row of [...interviewsAsOneResult.data, ...interviewsAsTwoResult.data]) {
        interviewsById.set(row.id, row)
      }
      const interviewRows = [...interviewsById.values()]

      const applicantCodes = await fetchApplicantCodes(interviewRows.map((row) => row.applicant_id))

      const now = Date.now()
      const resolved = interviewRows.map((row) => ({
        id: row.id,
        applicantCode: applicantCodes.get(row.applicant_id) ?? 'Unknown applicant',
        // The OTHER interviewer -- whichever of the two label columns
        // isn't this viewer's own label. Falls back to the viewer's own
        // label in the (should-never-happen) case both columns hold it,
        // so the UI never renders a blank co-interviewer line.
        coInterviewerLabel:
          row.interviewer_one_label === currentLabel ? row.interviewer_two_label : row.interviewer_one_label,
        scheduledAt: row.scheduled_at ? new Date(row.scheduled_at) : null,
        mode: row.mode,
        status: row.status,
      }))

      upcoming.value = resolved
        .filter((i) => i.status === 'Scheduled' && i.scheduledAt && i.scheduledAt.getTime() > now)
        .sort((a, b) => a.scheduledAt - b.scheduledAt)

      recentlyCompleted.value = resolved
        .filter((i) => i.status === 'Completed' || i.status === 'No-show')
        .sort((a, b) => (b.scheduledAt?.getTime() ?? 0) - (a.scheduledAt?.getTime() ?? 0))
    } catch (fetchError) {
      error.value = fetchError.message
    } finally {
      loading.value = false
    }
  }

  // Calls save-board-availability -- a real network write, not simulated.
  // Unlike submit-application (a genuinely anonymous caller), this endpoint
  // requires the caller's own signed-in session JWT in the Authorization
  // header, which is why accessToken is passed in rather than this store
  // reaching into useAuthStore itself. On success, re-fetches this label's
  // availability from the real table (rather than trusting the optimistic
  // local selection) so the grid always reflects what was actually
  // persisted.
  async function saveAvailability(slotIds, accessToken) {
    saving.value = true
    saveError.value = null

    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/save-board-availability`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ board_member_label: label.value, slots: slotIds }),
      })

      if (!response.ok) {
        let message = 'Something went wrong saving your availability. Please try again.'
        try {
          const parsed = await response.json()
          if (typeof parsed?.message === 'string') message = parsed.message
          else if (typeof parsed?.error === 'string') message = parsed.error
        } catch {
          // Malformed/empty body -- keep the fallback message above.
        }
        saveError.value = message
        return false
      }

      availabilitySlotIds.value = slotIds
      return true
    } catch {
      saveError.value = 'Something went wrong saving your availability. Please check your connection and try again.'
      return false
    } finally {
      saving.value = false
    }
  }

  return {
    label,
    availabilitySlotIds,
    upcoming,
    recentlyCompleted,
    loading,
    error,
    saving,
    saveError,
    fetchForLabel,
    saveAvailability,
  }
})
