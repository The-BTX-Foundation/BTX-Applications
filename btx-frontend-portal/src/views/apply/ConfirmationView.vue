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

// STATIC status bar: always renders with step 1 ("Scheduling interview") as
// the active step and steps 2-4 as not-yet-reached, regardless of who is
// viewing this page or their real application status. There is no fetch
// here tying this page to a specific applicant's row in
// scholarship_decisions or scholarship_interviews yet -- a real version
// needs to read that applicant's actual status once the confirmation page
// can be tied back to a specific submission.
const statusSteps = [
  { label: 'Scheduling interview', state: 'active' },
  { label: 'Interview scheduled', state: 'upcoming' },
  { label: 'Application review', state: 'upcoming' },
  { label: 'Decision made', state: 'upcoming' },
]
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

      <!--
        STATIC status bar -- always shows step 1 ("Scheduling interview") as
        active and steps 2-4 as not-yet-reached, no matter who is viewing
        this page or what their real application status is. There's no
        fetch tying this page to a specific applicant's row in
        scholarship_decisions or scholarship_interviews yet. A real version
        needs to read that applicant's actual status once the confirmation
        page can be tied back to a specific submission.
      -->
      <section class="info-card status-bar-card">
        <div class="status-steps-row">
          <template v-for="(step, index) in statusSteps" :key="step.label">
            <div class="status-step">
              <div class="status-circle-wrap">
                <div
                  class="status-circle"
                  :class="`status-circle--${step.state}`"
                >
                  <span v-if="step.state === 'done'" class="status-check" aria-hidden="true">✓</span>
                  <span v-else class="status-number">{{ index + 1 }}</span>
                </div>
              </div>
              <p class="status-label">{{ step.label }}</p>
            </div>
            <div
              v-if="index < statusSteps.length - 1"
              class="status-connector"
              :class="{ 'status-connector--reached': step.state === 'done' }"
            ></div>
          </template>
        </div>
      </section>

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

.status-bar-card {
  text-align: center;
}

.status-steps-row {
  display: flex;
  align-items: flex-start;
}

.status-step {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.status-circle-wrap {
  width: 40px;
  height: 40px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  flex-shrink: 0;
}

/* Done: solid filled circle, white checkmark. */
.status-circle--done {
  background: var(--color-success-text);
  color: #fff;
}

/* Active (step 1 only): filled circle with a halo ring in the same green,
   rendered via box-shadow so it doesn't change the circle's own size and
   throw off alignment with the other steps' circles. */
.status-circle--active {
  background: var(--color-success-text);
  color: #fff;
  box-shadow: 0 0 0 5px rgba(63, 107, 79, 0.18);
}

/* Not reached: outline only, card-colored fill, number in the outline color. */
.status-circle--upcoming {
  background: var(--color-surface);
  border: 2px solid var(--color-success-text);
  color: var(--color-success-text);
}

.status-connector {
  flex: 1 1 0;
  min-width: 8px;
  height: 2px;
  margin-top: 19px;
  /* Muted by default -- two not-yet-reached steps. */
  background: var(--color-success-bg);
}

/* Solid -- connector leads out of a completed step. */
.status-connector--reached {
  background: var(--color-success-text);
}

.status-label {
  margin-top: 8px;
  font-size: 11px;
  line-height: 1.3;
  color: var(--color-text-secondary);
  text-align: center;
  max-width: 78px;
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
