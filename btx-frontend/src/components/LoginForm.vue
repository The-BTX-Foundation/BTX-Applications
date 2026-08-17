<script setup>
import { onMounted, ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/lib/supabaseClient'

const authStore = useAuthStore()
const email = ref('')
const password = ref('')
const errorMessage = ref(null)
const loading = ref(false)

onMounted(() => {
  authStore.init()
})

async function handleSignIn() {
  loading.value = true
  errorMessage.value = null

  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  if (error) {
    errorMessage.value = error.message
  }
  loading.value = false
}

async function handleSignOut() {
  await supabase.auth.signOut()
}
</script>

<template>
  <div class="login-form">
    <template v-if="authStore.session">
      <p>
        Signed in as {{ authStore.session.user.email }} (role:
        {{ authStore.role ?? 'none' }})
      </p>
      <button type="button" @click="handleSignOut">Sign Out</button>
    </template>
    <template v-else>
      <form @submit.prevent="handleSignIn">
        <input v-model="email" type="email" placeholder="Email" required autocomplete="username" />
        <input
          v-model="password"
          type="password"
          placeholder="Password"
          required
          autocomplete="current-password"
        />
        <button type="submit" :disabled="loading">Sign In</button>
      </form>
      <p v-if="errorMessage" class="error">{{ errorMessage }}</p>
    </template>
  </div>
</template>

<style scoped>
.login-form {
  /* Explicit dark text rather than inheriting var(--color-text), which
     flips to a light color under prefers-color-scheme: dark and becomes
     unreadable against this component's white background. */
  color: #2d3142;
  margin-bottom: 1.5rem;
}

form {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.error {
  color: #b3261e;
}
</style>
