import { ref } from 'vue'
import { defineStore } from 'pinia'

// localStorage key holding the user's explicit theme choice. Absent entirely
// until the user first interacts with the toggle -- see init() below, which
// treats "no key" as "no preference yet" rather than defaulting the key
// itself to 'light'.
const STORAGE_KEY = 'btx-theme'

// Reads whichever theme is already applied to <html> by the synchronous
// boot-time script in main.js (see its own comment there for why that step
// has to run before Vue even mounts, not through this store). This function
// exists so the store's initial state matches the DOM instead of both
// independently re-deriving the same OS-preference fallback and risking a
// mismatch.
function currentDomTheme() {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

// Pinia store for the light/dark theme toggle, shared across every route --
// including /login and /about, which never mount HomeView.vue (see Phase 1
// of this feature's own findings), so this store's init() is called from
// App.vue rather than anywhere inside the HomeView shell.
export const useThemeStore = defineStore('theme', () => {
  const theme = ref(currentDomTheme())

  // Idempotent, same pattern as authStore.init() -- safe to call from
  // App.vue's onMounted even if something else already synced state.
  const initialized = ref(false)

  // Syncs reactive state to the DOM's already-applied theme; safe to call
  // more than once, only the first call has any effect.
  function init() {
    if (initialized.value) return
    initialized.value = true
    theme.value = currentDomTheme()
  }

  // Applies a theme: updates the DOM attribute every themed CSS rule keys
  // off (see base.css's :root[data-theme="dark"]), persists the user's
  // explicit choice so it survives reloads, and updates reactive state so
  // the sidebar toggle's label re-renders immediately.
  function setTheme(value) {
    theme.value = value
    document.documentElement.dataset.theme = value
    localStorage.setItem(STORAGE_KEY, value)
  }

  // Flips between light and dark theme.
  function toggle() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme, init, setTheme, toggle }
})
