import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Shared column list so fetchTasks always returns identically shaped rows.
const TASK_COLUMNS = 'id, plan_year, milestone_code, milestone_name, task_name, status, due_date, sort_order'

// Pinia store for Program Plan Tasks (WBS deliverables). Reads go through
// Supabase's RLS SELECT policy on `program_plan_tasks` (admin, board, and
// reviewer), which matches ProgramPlanning.vue's own canView gate exactly
// -- so nothing client-side needs to filter further. Read-only: the only
// writer is the sync-program-plan-tasks Edge Function's
// replace_program_plan_tasks() RPC (service_role, bypasses RLS), same
// convention as programPlanProgress.js/programPlanMilestones.js.
export const useProgramPlanTasksStore = defineStore('programPlanTasks', () => {
  const tasks = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Loads every deliverable row visible under RLS, across all plan years
  // -- ProgramPlanning.vue filters this client-side down to the selected
  // plan year and matches each row to its milestone, the same way it
  // already does for programPlanMilestonesStore.milestones. Ordered by
  // plan_year then sort_order so a given plan's rows already arrive in
  // the WBS sheet's own row order, with no client-side re-sort needed.
  async function fetchTasks() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('program_plan_tasks')
      .select(TASK_COLUMNS)
      .order('plan_year', { ascending: true })
      .order('sort_order', { ascending: true })

    if (fetchError) {
      error.value = fetchError.message
    } else {
      tasks.value = data
    }
    loading.value = false
  }

  return { tasks, loading, error, fetchTasks }
})
