<script setup>
import { onMounted } from 'vue'
import { RouterView } from 'vue-router'
import { useThemeStore } from '@/stores/theme'

// App.vue is the one component mounted for every route, including /login
// and /about (which never mount HomeView.vue's shell) -- so this is where
// the theme store's reactive state gets synced with whatever main.js's own
// boot-time script already applied to <html>, not inside HomeView, or the
// sidebar toggle would be the only thing that ever worked pre-login.
const themeStore = useThemeStore()
onMounted(() => {
  themeStore.init()
})
</script>

<template>
  <RouterView />
</template>
