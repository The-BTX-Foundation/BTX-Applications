<script setup>
import { defineAsyncComponent } from 'vue'
import { RouterView } from 'vue-router'

// Dev-only test navigation panel -- lets every page be clicked through
// without entering real data. Gated on a literal `import.meta.env.DEV` /
// `import.meta.env.VITE_ENABLE_TEST_NAV` check so Vite can statically
// replace both with constants at build time: in a production build without
// VITE_ENABLE_TEST_NAV=true, this whole branch folds to `false` and the
// dynamic import() is dropped, so TestNavPanel.vue is never bundled.
let TestNavPanel = null
if (import.meta.env.DEV || import.meta.env.VITE_ENABLE_TEST_NAV === 'true') {
  TestNavPanel = defineAsyncComponent(() => import('./components/TestNavPanel.vue'))
}
</script>

<template>
  <RouterView />
  <component :is="TestNavPanel" v-if="TestNavPanel" />
</template>
