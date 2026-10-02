import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Shared column list so fetchDirectory always returns identically shaped rows.
const DIRECTORY_COLUMNS = 'applicant_id, applicant_code, cycle_year, initials, submitted_at'

// Pinia store for the Scholarship applicant directory. Reads go through
// scholarship_applicant_directory
// (20261002140000_scholarship_applicant_directory.sql), a view gated on
// the caller's own role (admin/board/reviewer) rather than RLS on the
// underlying scholarship_applicants table directly -- see that
// migration's own comment on why. A caller whose role doesn't match gets
// a successful, empty result back, not an error, by that view's own
// design -- so this store (and ApplicantRecords.vue, which gates page
// access the same way every other Program/Finance/Scholarship page
// does) never needs to special-case "wrong role" as a fetch error.
// Read-only: this view has no corresponding write path from this app.
export const useScholarshipApplicantDirectoryStore = defineStore('scholarshipApplicantDirectory', () => {
  const applicants = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Loads every directory row visible under the view's own role gate,
  // most recently submitted first. ApplicantRecords.vue filters this
  // client-side by search text and cycle year, rather than this store
  // taking filter arguments and re-fetching per interaction.
  async function fetchDirectory() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('scholarship_applicant_directory')
      .select(DIRECTORY_COLUMNS)
      .order('submitted_at', { ascending: false })

    if (fetchError) {
      error.value = fetchError.message
    } else {
      applicants.value = data
    }
    loading.value = false
  }

  return { applicants, loading, error, fetchDirectory }
})
