<script setup>
import HomeSectionIcon from '@/components/HomeSectionIcon.vue'

// One stacked row in Home's section list, reused for all 8 sections.
// `flat` rows (Alert Center/Task & Approval/Event Calendar) are a direct
// RouterLink with a right chevron; the rest toggle their own sub-item list
// with a down/up chevron -- same two shapes Home.vue's old card grid had,
// just laid out as a row instead of a tile.
defineProps({
  icon: { type: String, required: true },
  // One of the four badge-pair roles in base.css (danger/amber/success/
  // neutral) -- picks which pale tile background + icon stroke color this
  // row's icon tile uses.
  color: { type: String, required: true },
  title: { type: String, required: true },
  subtitle: { type: String, default: null },
  subtitleVariant: { type: String, default: 'muted' }, // 'muted' | 'danger'
  pillCount: { type: Number, default: null },
  flat: { type: Boolean, default: false },
  routeName: { type: String, default: null },
  expanded: { type: Boolean, default: false },
})

defineEmits(['toggle'])
</script>

<template>
  <RouterLink v-if="flat" :to="{ name: routeName }" class="row">
    <span class="icon-tile" :class="`icon-tile--${color}`">
      <HomeSectionIcon :name="icon" />
    </span>
    <span class="row-text">
      <span class="row-title-line">
        <span class="title">{{ title }}</span>
        <span v-if="pillCount !== null && pillCount > 0" class="count-pill">{{ pillCount }}</span>
      </span>
      <span v-if="subtitle" class="subtitle" :class="{ 'subtitle--danger': subtitleVariant === 'danger' }">{{
        subtitle
      }}</span>
    </span>
    <svg class="chevron" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="9 6 15 12 9 18" />
    </svg>
  </RouterLink>

  <div v-else class="row-group">
    <button type="button" class="row row--button" @click="$emit('toggle')">
      <span class="icon-tile" :class="`icon-tile--${color}`">
        <HomeSectionIcon :name="icon" />
      </span>
      <span class="row-text">
        <span class="row-title-line">
          <span class="title">{{ title }}</span>
        </span>
        <span v-if="subtitle" class="subtitle" :class="{ 'subtitle--danger': subtitleVariant === 'danger' }">{{
          subtitle
        }}</span>
      </span>
      <svg
        class="chevron"
        :class="{ 'chevron--expanded': expanded }"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>

    <ul v-if="expanded" class="sub-item-list">
      <slot />
    </ul>
  </div>
</template>

<style scoped>
.row,
.row-group {
  background: var(--color-surface);
  border-radius: 14px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding: 14px 16px;
  border: none;
  background: var(--color-surface);
  text-decoration: none;
  cursor: pointer;
  text-align: left;
  font: inherit;
  color: inherit;
}

.row--button {
  border-radius: 14px;
}

.icon-tile {
  flex-shrink: 0;
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
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

.row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.row-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}

.title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-primary);
}

.subtitle {
  font-size: 12px;
  color: var(--color-text-secondary);
}

.subtitle--danger {
  color: var(--color-danger-text);
}

/* Same solid urgency red as AlertCenter.vue's .overdue-count-badge --
   deliberately not the pale --color-danger-badge-bg/-text pair, so there's
   only one "urgency red" definition in the app, not two. Listed alongside
   that badge in base.css's intentional-exceptions comment. */
.count-pill {
  background: #b3261e;
  color: #fff;
  font-size: 11px;
  font-weight: 600;
  padding: 1px 8px;
  border-radius: 999px;
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
  padding: 0 16px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--color-border);
  padding-top: 12px;
}
</style>
