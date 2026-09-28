<script setup>
// Post-submission confirmation screen. Deliberately built from Topbar +
// its own footer directly rather than WizardShell -- this page has no
// progress bar and no Back link (there's nothing left to go back to; the
// draft was just cleared), so reusing WizardShell would mean adding a
// prop just to suppress most of what it renders.
//
// PLACEHOLDER: everything below the heading (the "YOUR STATUS"/"NEXT
// STEPS" copy, the BTX Ops Hub status marking, the interview-eligible
// badge, the two-interviewer/Google Meet/recording details) describes
// behavior that doesn't exist yet anywhere in this system -- it's the
// mockup's copy, shown as static text, not a reflection of any real
// backend state.
import Topbar from '../../components/Topbar.vue'
</script>

<template>
  <div class="page">
    <Topbar />

    <main class="content">
      <div class="check-circle" aria-hidden="true">
        <span class="check-mark">✓</span>
      </div>

      <h1 class="confirm-heading">Application submitted</h1>
      <p class="confirm-subline">
        Thanks for applying to the BTX Foundation. Here's what happens next.
      </p>

      <section class="info-card">
        <p class="info-label">Your status</p>
        <p class="info-text">
          Your application is now marked <strong>Application completed</strong> in the BTX Ops Hub
          and is eligible for an interview. You remain in consideration for the Think Big
          Scholarship, BTX Legacy Award, and Empowerment Award, based on any awards you opted out
          of.
        </p>
        <div class="status-badge">
          <span class="status-dot" aria-hidden="true"></span>
          <span class="status-badge-text">Interview eligible</span>
        </div>
      </section>

      <section class="info-card">
        <p class="info-label">Next steps</p>
        <p class="info-text">
          We'll match you with two interviewers from the slots you selected and email a calendar
          invite with a Google Meet link. Interviews are recorded for scoring.
        </p>
      </section>

      <section class="info-card">
        <p class="info-label">Questions</p>
        <p class="info-text">
          Reach the BTX Foundation directly at
          <strong><a href="mailto:info@thebtxfoundation.org" class="info-link">info@thebtxfoundation.org</a></strong
          >.
        </p>
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
  max-width: 560px;
  margin: 0 auto;
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.check-circle {
  width: 96px;
  height: 96px;
  border-radius: 50%;
  background: var(--color-success-bg);
  display: flex;
  align-items: center;
  justify-content: center;
}

.check-mark {
  font-size: 40px;
  font-weight: 700;
  color: var(--color-success-text);
}

.confirm-heading {
  margin-top: 24px;
  font-family: var(--font-serif);
  font-weight: 800;
  font-size: 30px;
  color: var(--color-header-strong);
}

.confirm-subline {
  margin-top: 10px;
  font-size: 15px;
  color: var(--color-text-secondary);
  max-width: 380px;
}

.info-card {
  margin-top: 20px;
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  padding: 20px;
  text-align: left;
}

.info-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: var(--color-text-secondary);
}

.info-text {
  margin-top: 10px;
  font-size: 14px;
  line-height: 1.6;
  color: var(--color-text-primary);
}

.info-link {
  color: inherit;
  text-decoration: none;
}

.status-badge {
  margin-top: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-success-text);
}

.status-badge-text {
  font-weight: 700;
  font-size: 14px;
  color: var(--color-success-text);
}

.footer {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
