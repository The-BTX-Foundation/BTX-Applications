import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Shared column list so fetchMilestones always returns identically shaped rows.
const MILESTONE_COLUMNS = 'id, plan_year, milestone_name, is_complete'

// Pinia store for Program Plan Milestones. Reads go through Supabase's RLS
// SELECT policy on `program_plan_milestones` (admin, board, and reviewer),
// which matches ProgramPlanning.vue's own canView gate exactly -- so nothing
// client-side needs to filter further. Read-only: the only writer is the
// sync-program-plan-milestones edge function (an external Apps Script
// sync), not this app, same as programPlanProgress.js.
export const useProgramPlanMilestonesStore = defineStore('programPlanMilestones', () => {
  const milestones = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Loads every milestone row visible under RLS, across all plan years --
  // ProgramPlanning.vue filters this client-side down to the selected plan
  // year, the same way it already filters programPlanProgressStore.plans
  // down to a single selected row, rather than this store taking a
  // plan_year argument and re-fetching per selection.
  async function fetchMilestones() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('program_plan_milestones')
      .select(MILESTONE_COLUMNS)
      .order('milestone_name', { ascending: true })

    if (fetchError) {
      error.value = fetchError.message
    } else {
      milestones.value = data
    }
    loading.value = false
  }

  return { milestones, loading, error, fetchMilestones }
})
