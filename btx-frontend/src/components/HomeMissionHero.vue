<script setup>
// Home's top-of-page mission card -- a fixed-dark brand surface like the
// sidebar/topbar (see base.css's header comment) -- always dark/gold/white
// regardless of the light/dark toggle, so its colors are hardcoded here
// rather than reading the themed page/surface variables.
import HomeSectionIcon from '@/components/HomeSectionIcon.vue'

defineProps({
  scholarsDisplay: { type: String, required: true },
  directAidDisplay: { type: String, required: true },
  applicantsDisplay: { type: String, required: true },
  studentsDisplay: { type: String, required: true },
  // Route name of the first Scholarship sub-item in Home.vue's SECTIONS
  // array -- passed in rather than looked up here, since SECTIONS lives in
  // Home.vue.
  ctaRouteName: { type: String, required: true },
})
</script>

<template>
  <div class="hero">
    <p class="label">
      <HomeSectionIcon name="graduation-cap" class="label-icon" />
      OUR CORE MISSION
    </p>

    <div class="headline-row">
      <p class="headline">{{ scholarsDisplay }}</p>
      <p class="headline-caption">scholars funded to date</p>
    </div>

    <p class="quote">Empower. Engineer. Exceed.</p>

    <div class="stats-row">
      <div class="stat">
        <p class="stat-value">{{ directAidDisplay }}</p>
        <p class="stat-label">Direct academic aid</p>
      </div>
      <div class="stat">
        <p class="stat-value">{{ applicantsDisplay }}</p>
        <p class="stat-label">Applicants engaged</p>
      </div>
      <div class="stat">
        <p class="stat-value">{{ studentsDisplay }}</p>
        <p class="stat-label">Students reached</p>
      </div>
    </div>

    <RouterLink :to="{ name: ctaRouteName }" class="cta">Open Scholarship&nbsp;→</RouterLink>
  </div>
</template>

<style scoped>
.hero {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  padding: 22px;
  background:
    radial-gradient(circle at 88% 18%, rgba(212, 162, 78, 0.22) 0%, rgba(212, 162, 78, 0) 45%),
    linear-gradient(170deg, #2a2118 0%, #3b2a17 100%);
}

.label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 0;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: #d4a24e;
}

.label-icon {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
}

.headline-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 12px 0 0;
}

.headline {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 54px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
}

.headline-caption {
  margin: 0;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.75);
}

.quote {
  margin: 14px 0 0;
  font-family: var(--font-serif);
  font-style: italic;
  font-size: 18px;
  line-height: 1.4;
  color: rgba(255, 255, 255, 0.9);
}

/* nowrap keeps all three columns on one row at 390-428px (the app's own
   Home-route side margins are now tight enough, see HomeView.vue's
   .page--home, that they fit unwrapped at 428px) -- combined with each
   .stat's min-width: 0 below, a too-narrow viewport (e.g. 390px) shrinks
   the columns and wraps their labels onto two lines instead of breaking
   the row itself. */
.stats-row {
  display: flex;
  flex-wrap: nowrap;
  gap: 21px;
  margin: 18px 0 0;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.stat-value {
  margin: 0;
  font-family: var(--font-serif);
  font-size: 20px;
  font-weight: 600;
  color: #d4a24e;
}

.stat-label {
  margin: 0;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
}

.cta {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin: 19px 0 0;
  height: 38px;
  padding: 0 17px;
  border-radius: 12px;
  background: #e3b569;
  color: #1a1a1a;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
}
</style>
