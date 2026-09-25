<script setup>
// Stands in for Steps 2-7 until each is built in a later round.
defineProps({
  step: { type: Number, required: true },
})
</script>

<template>
  <div class="placeholder">
    <h1 class="placeholder-heading">Coming in a later round</h1>
    <p class="placeholder-text">Step {{ step }} of the application isn't built yet.</p>
  </div>
</template>

<style scoped>
.placeholder {
  margin-top: 40px;
  text-align: center;
}

.placeholder-heading {
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 22px;
  color: var(--color-header-strong);
}

.placeholder-text {
  margin-top: 10px;
  font-size: 14px;
  color: var(--color-text-secondary);
}
</style>
