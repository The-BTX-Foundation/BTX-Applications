<script setup>
import Topbar from '../components/Topbar.vue'

// Placeholder only -- exists so the landing page's "Start Application"
// button has somewhere real to route to before the actual form is built.
</script>

<template>
  <div class="page">
    <Topbar />
    <main class="content">
      <div class="card">
        <h1 class="heading">Applications aren't open yet</h1>
        <p class="body-text">Check back here soon — we'll have the full application ready shortly.</p>
        <RouterLink to="/" class="back-link">Back to the scholarship overview</RouterLink>
      </div>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
}

.card {
  width: 100%;
  max-width: 480px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  padding: 28px 24px;
  text-align: center;
}

.heading {
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 22px;
  color: var(--color-header-strong);
}

.body-text {
  margin-top: 10px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.back-link {
  display: inline-block;
  margin-top: 20px;
  font-size: 13px;
  color: var(--color-accent);
}
</style>
