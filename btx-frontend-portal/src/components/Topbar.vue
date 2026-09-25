<script setup>
// Shared fixed-dark brand bar shown at the top of every route in this app --
// there's no theme toggle here, so unlike btx-frontend's own sidebar this
// is just a plain component, not a variable-driven themed surface.
</script>

<template>
  <header class="topbar">
    <span class="wordmark">BTX <span class="wordmark-accent">Think Big</span></span>
    <span class="topbar-label">Scholarship Application</span>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #1c1a17;
  padding: 16px 20px;
}

.wordmark {
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 18px;
  color: #fff;
}

.wordmark-accent {
  color: var(--color-accent);
}

.topbar-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
}
</style>
