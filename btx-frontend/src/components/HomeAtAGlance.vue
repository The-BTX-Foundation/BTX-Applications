<script setup>
// Three equal stat tiles under Home's alert hero. Values arrive
// pre-formatted (including the "—" em-dash on a failed source) from
// useHomeSummary, so this component only lays them out.
// runwayAsOf/goalPercentAsOf are blank strings (not shown) outside the
// fallback case -- see useHomeSummary.js's own runwayAsOfLabel/
// goalAsOfLabel comments.
defineProps({
  runway: { type: String, required: true },
  runwayAsOf: { type: String, default: '' },
  goalPercent: { type: String, required: true },
  goalPercentAsOf: { type: String, default: '' },
  milestonesValue: { type: String, required: true },
  milestonesLabel: { type: String, required: true },
})
</script>

<template>
  <div class="glance">
    <div class="tile">
      <p class="label">Runway</p>
      <p class="value value--gold">{{ runway }}</p>
      <p v-if="runwayAsOf" class="as-of">{{ runwayAsOf }}</p>
    </div>
    <div class="tile">
      <p class="label">Fundraising goal</p>
      <p class="value value--gold">{{ goalPercent }}</p>
      <p v-if="goalPercentAsOf" class="as-of">{{ goalPercentAsOf }}</p>
    </div>
    <div class="tile">
      <p class="label">{{ milestonesLabel }}</p>
      <p class="value value--green">{{ milestonesValue }}</p>
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
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 14px;
  padding: 11px 13px;
  text-align: left;
}

.label {
  margin: 0 0 3px;
  font-size: 11px;
  line-height: 1.2;
  color: var(--color-header-muted);
}

/* margin-top: auto pushes every tile's value to the bottom of the tile
   regardless of whether its own label wraps to a second line at narrow
   widths (e.g. 360px) -- since all three tiles share one row height, this
   keeps the three values aligned on the same baseline instead of each
   value sitting directly under its own label. The label's own 3px
   margin-bottom above is the minimum gap when there's no wrap to push
   against. lining-nums matches the mission card's own numerals -- see
   HomeMissionHero.vue's identical pair for why both properties are set.
   Color is deliberately left to the .value--gold/.value--green modifiers
   below, not set here, since all three tiles now use the same
   serif/weight/size but two different colors. */
.value {
  margin: auto 0 0;
  font-family: var(--font-serif);
  font-size: 21px;
  line-height: 1.15;
  font-weight: 800;
  font-variant-numeric: lining-nums;
  font-feature-settings: 'lnum' 1;
}

.value--gold {
  color: var(--color-gold-strong);
}

.value--green {
  color: var(--color-green-strong);
}

/* Compact fallback sub-label ("as of Sep") -- only ever rendered when the
   tile's value actually came from a fallback month (see
   useHomeSummary.js's runwayAsOfLabel/goalAsOfLabel), so it never costs
   vertical space in the common case. white-space: nowrap keeps the short
   "as of {mon}" phrase from wrapping at this tile's narrowest widths. */
.as-of {
  margin: 2px 0 0;
  font-size: 9.5px;
  line-height: 1.2;
  color: var(--color-header-muted);
  white-space: nowrap;
}
</style>
