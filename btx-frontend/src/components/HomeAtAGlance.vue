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
      <p class="value">{{ goalPercent }}</p>
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
</style>
