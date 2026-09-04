<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

// Fully local, in-memory-only campaign data -- same "no store, no Supabase"
// pattern as EventCalendar.vue's read-only data, except these fields are
// user-editable. Nothing here is ever fetched or written to the database,
// so page reloads or navigating away silently discards any edits.
const campaigns = ref([
  {
    id: '2026',
    name: '2026 Fundraising Goal',
    badge: 'live',
    totalRaised: 340000,
    goalAmount: 500000,
    partnershipsCurrent: 14,
    partnershipsGoal: 20,
    programsFundedCurrent: 6,
    programsFundedGoal: 8,
  },
  {
    id: '2025',
    name: '2025 Fundraising Goal',
    badge: 'archived',
    totalRaised: 280000,
    goalAmount: 450000,
    partnershipsCurrent: 20,
    partnershipsGoal: 20,
    programsFundedCurrent: 8,
    programsFundedGoal: 8,
  },
])

// 2026 (the Live campaign) is selected by default.
const selectedCampaignId = ref('2026')

// The right panel edits this object's properties directly (via v-model) --
// since it's a reference into the `campaigns` array above, not a copy,
// those edits are already exactly the "local state" the campaign card
// itself reads for its badge/name, with no separate draft/sync step needed.
const selectedCampaign = computed(() => campaigns.value.find((c) => c.id === selectedCampaignId.value))

// Same page-access gate as DonorImpact.vue/FundraisingHealth.vue: admin,
// board, and reviewer can view; applicant is blocked.
const canView = computed(() => authStore.isAdmin || authStore.isBoard || authStore.isReviewer)

onMounted(() => {
  authStore.init()
})

// Deliberately makes no network call and writes nothing -- this page has no
// backing table to save to yet, so "publishing" has nothing to persist.
// Kept as an explicit (empty) handler rather than an unwired button so the
// no-op is documented in code instead of just implied by its absence.
function handleSaveAndPublish() {
  // No-op: nothing to persist yet.
}
</script>

<template>
  <h2 v-if="!authStore.session">Sign in</h2>
  <p v-else-if="!canView" class="access-denied">Access Denied</p>

  <div v-else class="progress-to-goal">
    <div class="campaign-column">
      <div class="campaign-column-header">
        <h2>Goal Campaigns</h2>
        <p class="column-subtitle">Drives the homepage widget</p>
      </div>

      <ul class="campaign-list">
        <li v-for="campaign in campaigns" :key="campaign.id">
          <button
            type="button"
            class="campaign-card"
            :class="{ 'campaign-card--active': campaign.id === selectedCampaignId }"
            @click="selectedCampaignId = campaign.id"
          >
            <span class="campaign-name">{{ campaign.name }}</span>
            <span class="badge" :class="`badge--${campaign.badge === 'live' ? 'live' : 'default'}`">
              {{ campaign.badge === 'live' ? 'Live' : 'Archived' }}
            </span>
          </button>
        </li>
      </ul>
    </div>

    <div v-if="selectedCampaign" class="detail-column">
      <h2>Edit: {{ selectedCampaign.name }}</h2>

      <div class="fields-grid">
        <div class="field">
          <span class="field-label">Total Raised</span>
          <div class="currency-input">
            <span class="currency-prefix">$</span>
            <input v-model.number="selectedCampaign.totalRaised" type="number" min="0" />
          </div>
        </div>

        <div class="field">
          <span class="field-label">Goal Amount</span>
          <div class="currency-input">
            <span class="currency-prefix">$</span>
            <input v-model.number="selectedCampaign.goalAmount" type="number" min="0" />
          </div>
        </div>

        <div class="field">
          <span class="field-label">Partnerships (current / goal)</span>
          <div class="pair-input">
            <input v-model.number="selectedCampaign.partnershipsCurrent" type="number" min="0" class="small-input" />
            <span class="pair-separator">/</span>
            <input v-model.number="selectedCampaign.partnershipsGoal" type="number" min="0" class="small-input" />
          </div>
        </div>

        <div class="field">
          <span class="field-label">Programs Funded (current / goal)</span>
          <div class="pair-input">
            <input
              v-model.number="selectedCampaign.programsFundedCurrent"
              type="number"
              min="0"
              class="small-input"
            />
            <span class="pair-separator">/</span>
            <input v-model.number="selectedCampaign.programsFundedGoal" type="number" min="0" class="small-input" />
          </div>
        </div>
      </div>

      <p class="not-connected-note">Not yet connected to saved data — this won't persist.</p>

      <button type="button" class="btn btn--gold" @click="handleSaveAndPublish">Save &amp; Publish</button>
    </div>
  </div>
</template>

<style scoped>
.progress-to-goal {
  display: flex;
  gap: 24px;
  align-items: flex-start;
}

.campaign-column {
  flex-shrink: 0;
  width: 240px;
}

.campaign-column-header {
  margin-bottom: 12px;
}

.campaign-column-header h2 {
  margin: 0;
  font-size: 18px;
}

.column-subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8a8a85;
}

.campaign-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.campaign-card {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: #fff;
  border: 0.5px solid #e5e3dd;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  font: inherit;
  text-align: left;
}

.campaign-card--active {
  border: 1px solid #c9932a;
}

.campaign-name {
  font-size: 15px;
  font-weight: 500;
  color: #2d3142;
}

/* Same badge styling as DonorImpact.vue's Live/Archived cycle badges. */
.badge {
  flex-shrink: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.badge--live {
  background: #e3f1e1;
  color: #2e7d32;
}

.badge--default {
  background: #f1efe8;
  color: #5f5e5a;
}

.detail-column {
  flex: 1;
  min-width: 0;
}

.detail-column h2 {
  margin: 0 0 16px;
  font-size: 18px;
}

.fields-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 20px;
  margin-bottom: 20px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: #4a4a4a;
}

.currency-input {
  display: flex;
  align-items: center;
  gap: 4px;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  padding: 0 10px;
}

.currency-prefix {
  font-size: 14px;
  color: #8a8a85;
}

.currency-input input {
  flex: 1;
  min-width: 0;
  border: none;
  padding: 8px 0;
  font-size: 14px;
  color: #2d3142;
  font-family: inherit;
  outline: none;
}

.pair-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.small-input {
  width: 70px;
  border: 1px solid #d8d6cf;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 14px;
  color: #2d3142;
  font-family: inherit;
}

.pair-separator {
  color: #8a8a85;
  font-size: 14px;
}

.not-connected-note {
  margin: 0 0 20px;
  font-size: 12px;
  font-style: italic;
  color: #8a8a85;
}

.btn {
  font-size: 13px;
  font-weight: 500;
  padding: 8px 16px;
  border-radius: 8px;
  cursor: pointer;
}

.btn--gold {
  background: #c9932a;
  color: #fff;
  border: 1px solid #c9932a;
}

.access-denied {
  margin: 0;
  color: #b3261e;
  font-weight: 600;
}
</style>
