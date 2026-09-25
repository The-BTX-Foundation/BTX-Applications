<script setup>
import { computed } from 'vue'
import Topbar from './Topbar.vue'

const TOTAL_STEPS = 7

const props = defineProps({
  step: { type: Number, required: true },
})

// Rounded to match the landing page's own "14%" for step 1 (1/7 = 14.28%).
const percent = computed(() => Math.round((props.step / TOTAL_STEPS) * 100))

// Step 1's Back link returns to the landing page; every other step goes
// back one step in the wizard.
const backHref = computed(() => (props.step <= 1 ? '/' : `/apply/${props.step - 1}`))
</script>

<template>
  <div class="page">
    <Topbar />

    <div class="progress-row">
      <span class="progress-step">Step {{ step }} of {{ TOTAL_STEPS }}</span>
      <span class="progress-percent">{{ percent }}%</span>
    </div>
    <div class="progress-track">
      <div class="progress-fill" :style="{ width: percent + '%' }"></div>
    </div>
    <div class="section-divider"></div>

    <main class="content">
      <RouterLink :to="backHref" class="back-link">‹ Back</RouterLink>
      <slot />
    </main>

    <footer class="footer">The BTX Foundation · Scholarship Application</footer>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.progress-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  padding: 16px 20px 0;
}

.progress-step {
  font-weight: 700;
  font-size: 14px;
  color: var(--color-header-strong);
}

.progress-percent {
  font-size: 13px;
  color: var(--color-header-muted);
}

.progress-track {
  margin: 8px 20px 0;
  height: 4px;
  border-radius: 999px;
  background: var(--color-track);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 999px;
  background: var(--color-accent);
}

.section-divider {
  margin-top: 16px;
  border-top: 1px solid var(--color-border);
}

.content {
  flex: 1;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
  padding: 20px 20px 40px;
  display: flex;
  flex-direction: column;
}

.back-link {
  align-self: flex-start;
  font-weight: 700;
  font-size: 14px;
  color: var(--color-header-strong);
  text-decoration: none;
}

.footer {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
