<script setup>
import { ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'

const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const errorMessage = ref(null)
const loading = ref(false)
const showPassword = ref(false)

// Clear any previous sign-in error as soon as the user starts correcting
// their input, rather than leaving a stale error box on screen.
watch([email, password], () => {
  errorMessage.value = null
})

// Signs the user in with Supabase; on success, sends them to the route they
// were originally trying to reach (carried via ?redirect from the router
// guard), or /tasks by default.
async function handleSignIn() {
  loading.value = true
  errorMessage.value = null

  const { error } = await supabase.auth.signInWithPassword({
    email: email.value,
    password: password.value,
  })

  if (error) {
    // Show a generic message rather than Supabase's raw error text, which
    // can leak details like whether an account exists for the given email.
    errorMessage.value = 'Incorrect email or password'
    loading.value = false
    return
  }

  const redirectPath = typeof route.query.redirect === 'string' ? route.query.redirect : '/tasks'
  router.push(redirectPath)
  loading.value = false
}

// Toggles the password field between masked and plain text.
function togglePasswordVisibility() {
  showPassword.value = !showPassword.value
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <div class="logo-mark">BTX</div>
      <h1 class="heading">BTX Ops Hub</h1>
      <p class="subtext">Sign in to continue</p>

      <form @submit.prevent="handleSignIn">
        <label class="field">
          <span class="field-label">Email</span>
          <input v-model="email" type="email" placeholder="you@example.com" required autocomplete="username" />
        </label>
        <label class="field">
          <span class="field-label">Password</span>
          <div class="password-wrapper">
            <input
              v-model="password"
              :type="showPassword ? 'text' : 'password'"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
            <button
              type="button"
              class="toggle-password-btn"
              :aria-label="showPassword ? 'Hide password' : 'Show password'"
              @click="togglePasswordVisibility"
            >
              <svg
                v-if="showPassword"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path
                  d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a18.6 18.6 0 0 1 5.06-5.94M9.9 4.24A10.4 10.4 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"
                />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <svg
                v-else
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              >
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
        </label>

        <p v-if="errorMessage" class="error">{{ errorMessage }}</p>

        <button type="submit" class="sign-in-btn" :disabled="loading">
          {{ loading ? 'Signing in…' : 'Sign In' }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #1a1a1a;
  padding: 24px;
}

.login-card {
  width: 100%;
  max-width: 380px;
  background: #fff;
  border-radius: 16px;
  padding: 40px 32px;
  box-shadow: 0 20px 40px rgba(0, 0, 0, 0.35);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.logo-mark {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  background: #c9932a;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.02em;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.heading {
  color: #1a1a1a;
  font-size: 20px;
  font-weight: 700;
  margin: 0 0 4px;
}

.subtext {
  color: #6b6b6b;
  font-size: 14px;
  margin: 0 0 28px;
}

form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  text-align: left;
}

.field-label {
  color: #4a4a4a;
  font-size: 12px;
  font-weight: 600;
}

.field input {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 14px;
  color: #1a1a1a;
}

.field input:focus {
  outline: none;
  border-color: #c9932a;
  box-shadow: 0 0 0 3px rgba(201, 147, 42, 0.15);
}

.password-wrapper {
  position: relative;
  display: flex;
}

.password-wrapper input {
  flex: 1;
  padding-right: 40px;
}

.toggle-password-btn {
  position: absolute;
  right: 4px;
  top: 50%;
  transform: translateY(-50%);
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  color: #8a8a8a;
  cursor: pointer;
}

.toggle-password-btn:hover {
  color: #4a4a4a;
}

.sign-in-btn {
  margin-top: 8px;
  background: #c9932a;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 12px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}

.sign-in-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.error {
  background: rgba(179, 38, 30, 0.08);
  border: 1px solid rgba(179, 38, 30, 0.25);
  color: #b3261e;
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
  margin: 0;
}
</style>
