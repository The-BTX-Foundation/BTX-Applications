import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Shared column list so fetchCycles, createCycle, and saveAndPublish all
// return identically shaped rows — keeps rows patched into `cycles` after a
// write consistent with rows loaded from the initial fetch.
const CYCLE_COLUMNS =
  'metric_id, cycle_year, funds_granted, students_reached, scholarships_awarded, published'

// Pinia store for the Donor Impact Workflow. Reads/writes go through
// Supabase's RLS policies on `donor_impact` (admin: view/create/edit,
// board: view-only), so the rows/actions available here are already scoped
// to what the signed-in user is allowed to do — no client-side role
// filtering is needed on top of this.
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

    const { data, error: insertError } = await supabase
      .from('donor_impact')
      .insert({
        cycle_year: cycleYear,
        funds_granted: 0,
        students_reached: 0,
        scholarships_awarded: 0,
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
