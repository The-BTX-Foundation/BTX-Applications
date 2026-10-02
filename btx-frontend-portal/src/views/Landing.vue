<script setup>
import { useRouter } from 'vue-router'
import Topbar from '../components/Topbar.vue'

// Static landing page: no props or fetched data, everything here is
// hardcoded copy for the scholarship application's entry screen.
const router = useRouter()

function startApplication() {
  router.push('/apply')
}

function checkStatus() {
  router.push('/sign-in')
}
</script>

<template>
  <div class="page">
    <Topbar />

    <main class="content">
      <span class="pill">BTX Foundation Scholarships</span>
      <h1 class="headline">Up to $4,000</h1>
      <p class="subline">One application is used to consider you for all BTX scholarships</p>
      <p class="body-text">
        The BTX Foundation provides financial and collaborative support to underrepresented
        minorities at the University of Maryland's Clark School of Engineering. This application
        takes about 10 minutes — you can save and come back if needed.
      </p>

      <section class="card">
        <p class="card-label">You're automatically considered for all three</p>
        <p class="card-text">
          Based on your interview, the committee will decide which award (if any) fits — you
          don't need to apply separately. You can opt out of a specific award later in this
          application if you'd prefer not to be considered for it.
        </p>
        <div class="award-list">
          <div class="award-row">
            <span>Amazon Think Big Scholarship</span>
            <span>$4,000</span>
          </div>
          <div class="award-row">
            <span>BTX Legacy Award</span>
            <span>$2,000</span>
          </div>
          <div class="award-row">
            <span>Empowerment Award</span>
            <span>$500</span>
          </div>
        </div>
      </section>

      <h2 class="section-heading">What you'll need</h2>
      <ol class="needs-list">
        <li class="needs-row">
          <span class="needs-num">1</span>
          <span>Your resume (PDF)</span>
        </li>
        <li class="needs-row">
          <span class="needs-num">2</span>
          <span>Unofficial transcript (PDF)</span>
        </li>
        <li class="needs-row">
          <span class="needs-num">3</span>
          <span>4+ interview time slots you're available</span>
        </li>
        <li class="needs-row">
          <span class="needs-num">4</span>
          <span>Your Terpmail email address</span>
        </li>
      </ol>

      <button type="button" class="start-btn" @click="startApplication">Start Application</button>
      <button type="button" class="check-status-btn" @click="checkStatus">Check status</button>
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
  max-width: 560px;
  margin: 0 auto;
  /* 40px top padding (up from the original 24px) -- with the progress row
     and track removed, this is what's left to give the topbar and the
     pill a comfortable gap; matches ConfirmationView's own
     Topbar-directly-into-content spacing for the same reason. */
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
}

.pill {
  align-self: flex-start;
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--color-track);
  color: var(--color-gold-strong);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.headline {
  margin-top: 16px;
  font-family: var(--font-serif);
  font-weight: 800;
  font-size: 36px;
  color: var(--color-header-strong);
}

.subline {
  margin-top: 8px;
  font-size: 15px;
  color: var(--color-text-primary);
}

.body-text {
  margin-top: 16px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.card {
  margin-top: 24px;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  padding: 20px;
}

.card-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-header-strong);
}

.card-text {
  margin-top: 10px;
  font-size: 13px;
  color: var(--color-text-secondary);
}

.award-list {
  margin-top: 16px;
}

.award-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
  font-weight: 700;
  font-size: 14px;
  color: var(--color-text-primary);
}

.award-row:first-child {
  border-top: none;
}

.section-heading {
  margin-top: 32px;
  font-family: var(--font-serif);
  font-weight: 700;
  font-size: 20px;
  color: var(--color-header-strong);
}

.needs-list {
  margin-top: 12px;
  list-style: none;
}

.needs-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--color-border);
  font-size: 14px;
  color: var(--color-text-primary);
}

.needs-row:first-child {
  border-top: none;
}

.needs-num {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--color-track);
  color: var(--color-gold-strong);
  font-weight: 700;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.start-btn {
  margin-top: 28px;
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 10px;
  background: var(--color-header-strong);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}

.start-btn:hover {
  opacity: 0.92;
}

/* Secondary/outline treatment -- same border/background/text pattern as
   the apply wizard's "Skip for now" button (Step4OptionalEssay.vue's
   .skip-btn), reused here rather than inventing a new button style. */
.check-status-btn {
  margin-top: 12px;
  width: 100%;
  padding: 16px;
  border: 1px solid var(--color-border-strong);
  border-radius: 10px;
  background: var(--color-surface);
  color: var(--color-text-primary);
  font-weight: 700;
  font-size: 15px;
  font-family: inherit;
  cursor: pointer;
}

.check-status-btn:hover {
  opacity: 0.92;
}

.footer {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
