import './assets/main.css'

// The app's one serif face (var(--font-serif) in base.css) -- imported
// once here rather than per-component, so any component can use the
// variable without also needing its own @fontsource import. Light-mode
// only, so only the weights actually used are pulled in.
import '@fontsource/playfair-display/latin-600.css'
import '@fontsource/playfair-display/latin-700.css'
import '@fontsource/playfair-display/latin-800.css'

import { createApp } from 'vue'

import App from './App.vue'
import router from './router'

const app = createApp(App)

app.use(router)

app.mount('#app')
