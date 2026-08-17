import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

// Pinia store holding the current Supabase auth session and role-derived
// permissions, shared across the app.
export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  // Guards against re-subscribing to onAuthStateChange if init() is called
  // more than once (e.g. from multiple components mounting).
  const initialized = ref(false)

  // Role is read from user_metadata, which is set server-side and enforced
  // by RLS policies — the UI only uses it to decide what to show/hide, the
  // database is the actual source of truth for what a role can do.
  const role = computed(() => session.value?.user?.user_metadata?.role ?? null)
  // Board members and admins share the same elevated UI permissions (e.g.
  // approving tasks); this mirrors the role checks in the RLS policies.
  const isBoardOrAdmin = computed(() => role.value === 'admin' || role.value === 'board')

  // Loads the current session and subscribes to future auth changes
  // (sign in, sign out, token refresh) so `session` always stays current.
  async function init() {
    if (initialized.value) return
    initialized.value = true

    const { data } = await supabase.auth.getSession()
    session.value = data.session

    supabase.auth.onAuthStateChange((_event, newSession) => {
      session.value = newSession
    })
  }

  return { session, role, isBoardOrAdmin, init }
})
