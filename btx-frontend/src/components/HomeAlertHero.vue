<script setup>
// Home's top-of-page overdue callout. A fixed-dark brand surface like the
// sidebar/topbar (see base.css's header comment) -- always #1a1a1a/gold/
// white regardless of the light/dark toggle, so its colors are hardcoded
// here rather than reading the themed page/surface variables.
defineProps({
  loading: { type: Boolean, required: true },
  error: { type: String, default: null },
  count: { type: Number, required: true },
  oldestTitle: { type: String, default: null },
  oldestDaysLabel: { type: String, default: null },
})
</script>

<template>
  <div class="hero">
    <p class="eyebrow">Alert Center</p>

    <p v-if="loading" class="body">Loading…</p>
    <p v-else-if="error" class="body">Couldn't load overdue items right now.</p>
    <template v-else>
      <p class="count">{{ count }}</p>

      <p v-if="count === 0" class="body">Nothing is overdue right now.</p>
      <p v-else-if="count === 1" class="body">1 item is overdue right now. It has been waiting {{ oldestDaysLabel }}.</p>
      <p v-else class="body">
        {{ count }} items are overdue right now. The oldest — <strong>{{ oldestTitle }}</strong> — has been waiting
        <strong>{{ oldestDaysLabel }}</strong>.
      </p>

      <RouterLink v-if="count > 0" to="/alerts" class="hero-btn">Review overdue items&nbsp;→</RouterLink>
    </template>
  </div>
</template>

<style scoped>
.hero {
  background: #1a1a1a;
  border-radius: 14px;
  padding: 20px;
}

.eyebrow {
  margin: 0 0 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #d4a24e;
}

.count {
  margin: 0 0 8px;
  font-size: 40px;
  font-weight: 700;
  color: #d4a24e;
  line-height: 1;
}

.body {
  margin: 0;
  color: #fff;
  font-size: 14px;
  line-height: 1.5;
}

.hero-btn {
  display: inline-block;
  margin-top: 14px;
  background: #fff;
  color: #1a1a1a;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 16px;
  border-radius: 999px;
  text-decoration: none;
}
</style>
