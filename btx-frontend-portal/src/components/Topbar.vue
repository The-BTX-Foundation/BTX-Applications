<script setup>
// Shared fixed-dark brand bar shown at the top of every route in this app --
// there's no theme toggle here, so unlike btx-frontend's own sidebar this
// is just a plain component, not a variable-driven themed surface.
</script>

<template>
  <header class="topbar">
    <span class="wordmark">BTX <span class="wordmark-accent">Think Big</span></span>
    <div class="topbar-right">
      <span class="topbar-label">Scholarship Application</span>
      <RouterLink to="/sign-in?staff=1" class="admin-login-btn">Admin Login</RouterLink>
    </div>
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

.topbar-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.topbar-label {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.62);
}

/* A genuine bordered-pill button, not text -- stays within the topbar's
   existing dark/muted/white palette rather than a loud new color; gold
   stays reserved for the "Think Big" wordmark accent. */
.admin-login-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 16px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  white-space: nowrap;
}

.admin-login-btn:hover {
  background: rgba(255, 255, 255, 0.16);
  border-color: rgba(255, 255, 255, 0.5);
}

/* Narrowest widths: the wordmark itself already wraps to two lines here,
   so the label + button need to shrink rather than wrap or overflow and
   crowd it. Padding/font come down; the label (not part of this change's
   scope) is left as-is since it already wraps on its own. */
@media (max-width: 400px) {
  .topbar {
    padding: 14px 16px;
    gap: 8px;
  }

  .topbar-right {
    gap: 8px;
  }

  .admin-login-btn {
    padding: 6px 10px;
    font-size: 12px;
  }
}
</style>
