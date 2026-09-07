import { ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Shared column list so fetchPlans always returns identically shaped rows.
const PLAN_COLUMNS =
  'id, plan_year, milestones_complete, milestones_total, tasks_complete, tasks_total, tasks_in_progress, tasks_not_started'

// Pinia store for Program Plan Progress. Reads go through Supabase's RLS
// SELECT policy on `program_plan_progress` (admin, board, and reviewer),
// which matches ProgressToGoal.vue's own canView gate exactly -- so nothing
// client-side needs to filter further. Read-only: the only writer is the
// sync-program-plan-progress edge function (an external Apps Script sync),
// not this app, so there's no create/update here the way donorImpact.js has.
export const useProgramPlanProgressStore = defineStore('programPlanProgress', () => {
  const plans = ref([])
  const loading = ref(false)
  const error = ref(null)

  // Loads every plan year visible under RLS, most recent year first.
  async function fetchPlans() {
    loading.value = true
    error.value = null

    const { data, error: fetchError } = await supabase
      .from('program_plan_progress')
      .select(PLAN_COLUMNS)
      .order('plan_year', { ascending: false })

    if (fetchError) {
      error.value = fetchError.message
    } else {
      plans.value = data
    }
    loading.value = false
  }

  return { plans, loading, error, fetchPlans }
})
