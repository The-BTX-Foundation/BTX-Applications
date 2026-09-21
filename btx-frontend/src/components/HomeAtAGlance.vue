<script setup>
// Three equal stat tiles under Home's alert hero. Values arrive
// pre-formatted (including the "—" em-dash on a failed source) from
// useHomeSummary, so this component only lays them out.
defineProps({
  runway: { type: String, required: true },
  goalPercent: { type: String, required: true },
  milestonesValue: { type: String, required: true },
  milestonesLabel: { type: String, required: true },
})
</script>

<template>
  <div class="glance">
    <div class="tile">
      <p class="label">Runway</p>
      <p class="value">{{ runway }}</p>
    </div>
    <div class="tile">
      <p class="label">Fundraising goal</p>
      <p class="value value--serif">{{ goalPercent }}</p>
    </div>
    <div class="tile">
      <p class="label">{{ milestonesLabel }}</p>
      <p class="value">{{ milestonesValue }}</p>
    </div>
  </div>
</template>

<style scoped>
.glance {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}

.tile {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 14px 10px;
  text-align: center;
}

.label {
  margin: 0 0 6px;
  font-size: 11px;
  color: var(--color-text-secondary);
}

.value {
  margin: 0;
  font-size: 18px;
  font-weight: 700;
  color: var(--color-accent);
}

/* Fundraising goal's own value only (same var(--font-serif) as the
   mission card's "13"). Extending this to Runway/2026 milestones later is
   just adding this same class to their own <p class="value">; color stays
   governed by .value regardless. lining-nums matches the mission card's
   own numerals -- see HomeMissionHero.vue's identical pair for why both
   properties are set. font-size: 20px matches HomeMissionHero.vue's
   .stat-value (the "70" applicants-engaged stat) exactly, and font-weight:
   700 is deliberately bolder than that same .stat-value's 600 -- both
   comparisons are against that stat, not against Runway/2026 milestones'
   plain .value anymore, so this overrides .value's own size as well as its
   weight. The "%" shares this same element/weight since it's part of the
   same interpolated string, not a separate span. */
.value--serif {
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 700;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}
</style>
