import './assets/main.css'

// The app's one serif face (var(--font-serif) in base.css) -- imported
// once here rather than per-component, so any component can use the
// variable without also needing its own @fontsource import.
import '@fontsource/playfair-display/latin-600.css'
import '@fontsource/playfair-display/latin-700.css'
import '@fontsource/playfair-display/latin-800.css'
import '@fontsource/playfair-display/latin-400-italic.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import router from './router'

// Applies the theme to <html> synchronously, before Vue mounts anything --
// deliberately not left to the theme store's own init() (called later, from
// App.vue's onMounted) because that would paint one frame in the wrong
// theme first. A stored explicit choice always wins; with no stored value
// yet (first-ever visit), falls back to the OS preference so a first-time
// dark-mode user doesn't see a flash of light before anything reacts to
// their system setting.
const storedTheme = localStorage.getItem('btx-theme')
const theme = storedTheme ?? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
document.documentElement.dataset.theme = theme

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')
