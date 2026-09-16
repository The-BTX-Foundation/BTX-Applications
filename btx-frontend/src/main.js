import './assets/main.css'

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
