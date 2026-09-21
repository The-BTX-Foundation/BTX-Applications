<script setup>
// Red overdue-items callout directly beneath Home's mission card. Unlike
// the mission card above it, this is a themed surface (reads the danger
// badge variables), so it flips with the light/dark toggle same as every
// other themed surface in the app.
defineProps({
  loading: { type: Boolean, required: true },
  error: { type: String, default: null },
  count: { type: Number, required: true },
  oldestDaysLabel: { type: String, default: null },
})
</script>

<template>
  <RouterLink v-if="!loading && !error && count > 0" :to="{ name: 'alerts' }" class="banner">
    <span class="left">
      <span class="dot" />
      {{ count }} item{{ count === 1 ? '' : 's' }} overdue · oldest {{ oldestDaysLabel }}
    </span>
    <span class="review">Review&nbsp;→</span>
  </RouterLink>
</template>

<style scoped>
.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-top: 10px;
  height: 38px;
  padding: 0 14px;
  border-radius: 14px;
  background: var(--color-danger-badge-bg);
  color: var(--color-danger-badge-text);
  border: 1px solid color-mix(in srgb, var(--color-danger-badge-text) 25%, transparent);
  text-decoration: none;
}

.left {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 600;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.review {
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
}
</style>
