<script setup>
import HomeSectionIcon from '@/components/HomeSectionIcon.vue'

// One card in Home's Sections grid (or the full-width featured Scholarship
// card above it). `flat` cards are a direct RouterLink with a right
// chevron; the rest toggle their own sub-item list with a down/up chevron
// -- same two shapes as before, just laid out as a card (icon+title row on
// top, pill+chevron row pinned to the bottom via margin-top: auto) instead
// of a single-line row.
defineProps({
  icon: { type: String, required: true },
  // One of the four badge-pair roles in base.css (danger/amber/success/
  // neutral) -- picks which pale tile background + icon stroke color this
  // card's icon tile uses. Ignored when `featured` is true (the featured
  // tile is always a solid accent tile instead).
  color: { type: String, required: true },
  title: { type: String, required: true },
  pillText: { type: String, required: true },
  pillTone: { type: String, required: true }, // 'danger' | 'amber' | 'success' | 'neutral'
  flat: { type: Boolean, default: false },
  routeName: { type: String, default: null },
  expanded: { type: Boolean, default: false },
  // Scholarship's full-width, higher-emphasis variant: solid accent icon
  // tile, gold glow background, and an optional tag next to the title.
  featured: { type: Boolean, default: false },
  tag: { type: String, default: null },
})

defineEmits(['toggle'])
</script>

<template>
  <RouterLink v-if="flat" :to="{ name: routeName }" class="card" :class="{ 'card--featured': featured }">
    <div class="top-row">
      <span class="icon-tile" :class="featured ? 'icon-tile--featured' : `icon-tile--${color}`">
        <HomeSectionIcon :name="icon" />
      </span>
      <span class="title-wrap">
        <span class="title">{{ title }}</span>
        <span v-if="featured && tag" class="tag">{{ tag }}</span>
      </span>
    </div>
    <div class="bottom-row">
      <span class="pill" :class="`pill--${pillTone}`">{{ pillText }}</span>
      <svg class="chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="9 6 15 12 9 18" />
      </svg>
    </div>
  </RouterLink>

  <div v-else class="card-group">
    <button
      type="button"
      class="card card--button"
      :class="{ 'card--featured': featured }"
      :aria-expanded="expanded"
      @click="$emit('toggle')"
    >
      <div class="top-row">
        <span class="icon-tile" :class="featured ? 'icon-tile--featured' : `icon-tile--${color}`">
          <HomeSectionIcon :name="icon" />
        </span>
        <span class="title-wrap">
          <span class="title">{{ title }}</span>
          <span v-if="featured && tag" class="tag">{{ tag }}</span>
        </span>
      </div>
      <div class="bottom-row">
        <span class="pill" :class="`pill--${pillTone}`">{{ pillText }}</span>
        <svg
          class="chevron"
          :class="{ 'chevron--expanded': expanded }"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
    </button>

    <ul v-if="expanded" class="sub-item-list">
      <slot />
    </ul>
  </div>
</template>

<style scoped>
.card,
.card-group {
  background: var(--color-surface);
  border-radius: 16px;
}

.card {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 104px;
  padding: 14px;
  border: 1px solid var(--color-border);
  border-radius: 16px;
  background: var(--color-surface);
  text-decoration: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

@media (min-width: 500px) {
  .card {
    padding: 16px;
  }
}

/* Fixed padding regardless of breakpoint (unlike the standard cards'
   14px -> 16px scaling above) -- the compound selector's equal specificity
   to the media-query rule above is broken by source order, so this stays
   last to guarantee it always wins. */
.card.card--featured {
  padding: 16px;
  border: 1px solid var(--color-accent);
  background:
    linear-gradient(180deg, rgba(201, 147, 42, 0.28) 0%, rgba(201, 147, 42, 0.08) 45%, rgba(201, 147, 42, 0) 70%),
    var(--color-surface);
}

.top-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.icon-tile {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (min-width: 500px) {
  .icon-tile {
    width: 42px;
    height: 42px;
  }
}

.icon-tile--danger {
  background: var(--color-danger-badge-bg);
  color: var(--color-danger-badge-text);
}

.icon-tile--amber {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.icon-tile--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
}

.icon-tile--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

/* Fixed 42px/radius 12px regardless of breakpoint -- Scholarship's tile is
   a one-off higher-emphasis treatment, not part of the four-color scaling
   set above. Solid accent (not a pale badge-bg) with a white icon. */
.icon-tile--featured {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--color-accent);
  color: #fff;
}

.title-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 2px;
}

.title {
  font-size: 15px;
  font-weight: 700;
  color: var(--color-text-primary);
}

@media (min-width: 500px) {
  .title {
    font-size: 16px;
  }
}

/* "CORE PROGRAM" -- wraps onto its own line below the title once
   .title-wrap's flex-wrap runs out of room (around 360px), rather than
   ever squeezing or truncating either piece of text. */
.tag {
  flex-shrink: 0;
  background: var(--color-accent);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 3px 7px;
  border-radius: 5px;
  white-space: nowrap;
}

.bottom-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: auto;
  padding-top: 12px;
}

.pill {
  font-size: 12px;
  font-weight: 600;
  padding: 3px 10px;
  border-radius: 999px;
  white-space: nowrap;
}

.pill--danger {
  background: var(--color-danger-badge-bg);
  color: var(--color-danger-badge-text);
}

.pill--amber {
  background: var(--color-amber-badge-bg);
  color: var(--color-amber-badge-text);
}

.pill--success {
  background: var(--color-success-badge-bg);
  color: var(--color-success-badge-text);
}

.pill--neutral {
  background: var(--color-neutral-badge-bg);
  color: var(--color-neutral-badge-text);
}

.chevron {
  flex-shrink: 0;
  color: var(--color-text-secondary);
  transition: transform 0.15s ease;
}

.chevron--expanded {
  transform: rotate(180deg);
}

.sub-item-list {
  list-style: none;
  margin: 0;
  padding: 12px 14px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--color-border);
}

@media (min-width: 500px) {
  .sub-item-list {
    padding: 12px 16px 16px;
  }
}
</style>
