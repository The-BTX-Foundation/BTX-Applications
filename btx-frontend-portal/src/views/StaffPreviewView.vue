<script setup>
// PLACEHOLDER: reachable and genuinely authenticated as staff
// (router/index.js's requireSession guard redirects here from /sign-in
// if there's no active session; SignInView's staff flow is the only
// thing that navigates here, and only after confirming
// user_metadata.role is admin/board/reviewer). Stage C -- the actual
// applicant status-lookup tool staff will use -- is future work. This
// page only confirms the staff sign-in and role check worked.
import Topbar from '../components/Topbar.vue'
</script>

<template>
  <div class="page">
    <Topbar />

    <main class="content">
      <section class="card">
        <h1 class="heading">Signed in as staff</h1>
        <p class="body-text">The applicant status-lookup preview is coming in the next round.</p>
      </section>
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

.content {
  flex: 1;
  width: 100%;
  max-width: 420px;
  margin: 0 auto;
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
}

.card {
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  padding: 28px 24px;
  text-align: center;
}

.heading {
  font-family: var(--font-serif);
  font-weight: 800;
  font-size: 22px;
  color: var(--color-header-strong);
}

.body-text {
  margin-top: 10px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.footer {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
