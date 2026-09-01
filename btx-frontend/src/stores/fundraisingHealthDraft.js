import { computed, ref } from 'vue'
import { defineStore } from 'pinia'

// Shared, in-memory-only draft of Revenue & Fundraising Health's fields.
// Nothing here persists (no Supabase table backs it yet) -- it exists as a
// Pinia store rather than local component state purely so BudgetTracking's
// Cost to Raise a Dollar can read totalRevenue live, from a separate page,
// without a reload. Same non-persisting placeholder pattern as
// BudgetTracking.vue's own draft.
export const useFundraisingHealthDraft = defineStore('fundraisingHealthDraft', () => {
  const individual_donors = ref(0)
  const corporate_partnerships = ref(0)
  const grants_revenue = ref(0)
  const events_revenue = ref(0)
  const annual_goal = ref(0)
  const donor_retention_rate = ref(0)
  const average_gift_size = ref(0)
  const median_gift_size = ref(0)
  const new_donors = ref(0)
  const recurring_donors = ref(0)

  // Single source of truth for total revenue, exposed so any consumer
  // (this page's own Goal Progress, Budget Tracking's Cost to Raise a
  // Dollar) reads the same live sum instead of each recomputing it.
  const totalRevenue = computed(
    () => individual_donors.value + corporate_partnerships.value + grants_revenue.value + events_revenue.value,
  )

  return {
    individual_donors,
    corporate_partnerships,
    grants_revenue,
    events_revenue,
    annual_goal,
    donor_retention_rate,
    average_gift_size,
    median_gift_size,
    new_donors,
    recurring_donors,
    totalRevenue,
  }
})
