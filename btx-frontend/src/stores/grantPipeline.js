import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Pinia store for Grant Pipeline. Reads go through Supabase's RLS SELECT
// policy on `grant_pipeline` (admin, board, and reviewer), matching
// BudgetTracking.vue's own canView gate (Grant Pipeline is a tab on that
// page, not a separate route). Read-only: the only writer is the
// sync-grant-pipeline edge function (an external Apps Script sync), not
// this app.
export const useGrantPipelineStore = defineStore('grantPipeline', () => {
  const grants = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Loads every grant visible under RLS. No ordering requirement from the
  // table itself (unlike the year/month tables), so this reads in
  // whatever order Postgres returns rows.
  async function fetchAll() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase.from('grant_pipeline').select('id, grant_name, funder, amount, status')

    if (fetchError) {
      error.value = fetchError.message
    } else {
      grants.value = data
    }
    loading.value = false
  }

  return { grants, loading, error, fetchAll }
})
