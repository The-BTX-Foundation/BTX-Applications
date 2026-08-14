import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { supabase } from '@/lib/supabaseClient'

export const useAuthStore = defineStore('auth', () => {
  const session = ref(null)
  const initialized = ref(false)

  const role = computed(() => session.value?.user?.user_metadata?.role ?? null)
  const isBoardOrAdmin = computed(() => role.value === 'admin' || role.value === 'board')

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
