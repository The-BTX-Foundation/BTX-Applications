<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '../lib/supabaseClient'
import TextField from '../components/TextField.vue'
import Topbar from '../components/Topbar.vue'

const route = useRoute()
const router = useRouter()

// Which half of the card is showing -- not a tab, a single persistent
// card whose inner content swaps between the applicant and staff flows.
// The applicant flow is the default/primary view.
const mode = ref('applicant')

// Within the applicant flow: 'email' collects the Terpmail address and
// sends the one-time code, 'code' collects and verifies it.
const applicantStep = ref('email')

const STAFF_ROLES = ['admin', 'board', 'reviewer']
const RESEND_COOLDOWN_SECONDS = 30

// ---- Applicant flow: passwordless, email OTP code ----

const email = ref('')
const emailTouched = ref(false)
const sendingCode = ref(false)
const sendError = ref('')

const code = ref('')
const verifying = ref(false)
const verifyError = ref('')

const resendSecondsLeft = ref(0)
let resendTimer = null

// Same validation the apply flow's own Terpmail field uses
// (Step1BasicInfo.vue) -- a plausible email shape AND the
// @terpmail.umd.edu domain, checked case-insensitively since email
// domains aren't case-sensitive.
const emailIsValid = computed(() => {
  const value = email.value.trim()
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  return looksLikeEmail && value.toLowerCase().endsWith('@terpmail.umd.edu')
})

const emailError = computed(() => {
  if (!emailTouched.value || !email.value) return ''
  return emailIsValid.value ? '' : 'Enter a valid @terpmail.umd.edu address.'
})

// Starts (or restarts) the 30-second countdown that disables "Resend
// code". This is honest UI only -- Supabase rate-limits OTP sends on its
// own regardless of whether this countdown is showing.
function startResendCooldown() {
  resendSecondsLeft.value = RESEND_COOLDOWN_SECONDS
  clearInterval(resendTimer)
  resendTimer = setInterval(() => {
    resendSecondsLeft.value -= 1
    if (resendSecondsLeft.value <= 0) clearInterval(resendTimer)
  }, 1000)
}

// Sends the one-time code. shouldCreateUser: true means Supabase creates
// the auth.users row on a brand-new email's first sign-in here -- the
// role-safety trigger (see
// 20261002120000_scholarship_applicant_role_and_status_view.sql) forces
// that new row to role = 'applicant' regardless of anything supplied in
// this request, so this path can never be used to self-provision a
// staff account.
async function sendCode() {
  emailTouched.value = true
  if (!emailIsValid.value) return

  sendingCode.value = true
  sendError.value = ''

  const { error } = await supabase.auth.signInWithOtp({
    email: email.value.trim(),
    options: { shouldCreateUser: true },
  })

  sendingCode.value = false

  if (error) {
    sendError.value = error.message || 'Could not send a code. Try again.'
    return
  }

  applicantStep.value = 'code'
  startResendCooldown()
}

// Strips non-digits and caps at 6 on every keystroke -- same masking
// approach as the apply flow's phone/credits fields (Step1BasicInfo.vue).
function onCodeInput(value) {
  code.value = value.replace(/\D/g, '').slice(0, 6)
  verifyError.value = ''
}

// Verifies the 6-digit OTP against Supabase Auth and routes to /status on success.
async function verifyCode() {
  if (code.value.length < 6) {
    verifyError.value = 'Enter the 6-digit code.'
    return
  }

  verifying.value = true
  verifyError.value = ''

  const { error } = await supabase.auth.verifyOtp({
    email: email.value.trim(),
    token: code.value,
    type: 'email',
  })

  verifying.value = false

  if (error) {
    verifyError.value = error.message || "That code didn't work. Check it and try again."
    return
  }

  router.push('/status')
}

// Re-sends the OTP, if the resend cooldown has elapsed.
async function resendCode() {
  if (resendSecondsLeft.value > 0) return
  await sendCode()
}

// Back to Step 1 with a clean slate -- a mistyped email shouldn't carry
// forward into a retry.
function useDifferentEmail() {
  applicantStep.value = 'email'
  email.value = ''
  emailTouched.value = false
  code.value = ''
  verifyError.value = ''
  clearInterval(resendTimer)
  resendSecondsLeft.value = 0
}

// ---- Staff flow: password sign-in, same approach as btx-frontend's
// Login.vue (a different package -- its logic is reimplemented here
// rather than imported, since Vue apps in this monorepo don't share
// components across packages) ----

const staffEmail = ref('')
const staffPassword = ref('')
const staffSigningIn = ref(false)
const staffError = ref('')

// Signs in a staff member with password auth, then checks their role from
// user_metadata before allowing access to the staff preview.
async function staffSignIn() {
  staffSigningIn.value = true
  staffError.value = ''

  const { data, error } = await supabase.auth.signInWithPassword({
    email: staffEmail.value,
    password: staffPassword.value,
  })

  if (error) {
    // Generic message, same as Login.vue -- doesn't leak whether an
    // account exists for the given email.
    staffError.value = 'Incorrect email or password'
    staffSigningIn.value = false
    return
  }

  // Role lives in user_metadata -- see every
  // (auth.jwt() -> 'user_metadata' ->> 'role') policy check across
  // supabase/migrations. A correct password alone isn't enough here: an
  // applicant account (always role = 'applicant', forced by the
  // role-safety trigger) must not be able to reach the staff preview
  // just because it also happens to have a password set on it.
  const role = data.session?.user?.user_metadata?.role
  if (!STAFF_ROLES.includes(role)) {
    await supabase.auth.signOut()
    staffError.value = 'This sign-in is for BTX staff only.'
    staffSigningIn.value = false
    return
  }

  staffSigningIn.value = false
  router.push('/staff-preview')
}

// Switches this view into the staff password sign-in mode.
function showStaffSignIn() {
  mode.value = 'staff'
  sendError.value = ''
  verifyError.value = ''
}

// Switches this view back to the applicant OTP sign-in mode.
function backToApplicant() {
  mode.value = 'applicant'
  staffError.value = ''
}

// Entry point for Topbar's "Admin Login" button (/sign-in?staff=1) --
// opens directly on the staff flow instead of defaulting to the
// applicant view. Reuses showStaffSignIn() itself, the exact same state
// change as clicking "BTX staff sign in" below, rather than duplicating
// its logic here.
onMounted(() => {
  if (route.query.staff) showStaffSignIn()
})

onUnmounted(() => clearInterval(resendTimer))
</script>

<template>
  <div class="page">
    <Topbar />

    <main class="content">
      <div class="sign-in-wrap">
        <RouterLink to="/" class="back-link">‹ Back</RouterLink>

        <template v-if="mode === 'applicant'">
          <h1 class="heading">Check your application status</h1>
          <p class="subline">
            {{
              applicantStep === 'email'
                ? "We'll email a one-time code to your Terpmail address."
                : `Enter the 6-digit code we sent to ${email}.`
            }}
          </p>
        </template>
        <template v-else>
          <h1 class="heading">BTX staff sign in</h1>
          <p class="subline">For admin, board, and reviewer accounts.</p>
        </template>

        <section class="card">
          <!-- Applicant flow, Step 1: email -->
          <form v-if="mode === 'applicant' && applicantStep === 'email'" @submit.prevent="sendCode">
            <div class="fields">
              <TextField
                v-model="email"
                label="Terpmail email address"
                placeholder="yourname@terpmail.umd.edu"
                type="email"
                required
                :error="emailError"
                @blur="emailTouched = true"
              />
            </div>
            <p v-if="sendError" class="form-error">{{ sendError }}</p>
            <button type="submit" class="primary-btn" :disabled="sendingCode">
              {{ sendingCode ? 'Sending…' : 'Send code' }}
            </button>
          </form>

          <!-- Applicant flow, Step 2: verify code -->
          <form v-else-if="mode === 'applicant' && applicantStep === 'code'" @submit.prevent="verifyCode">
            <div class="fields">
              <TextField
                :model-value="code"
                label="6-digit code"
                placeholder="123456"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                required
                :error="verifyError"
                @update:modelValue="onCodeInput"
              />
            </div>
            <button type="submit" class="primary-btn" :disabled="verifying">
              {{ verifying ? 'Verifying…' : 'Verify' }}
            </button>

            <div class="code-links">
              <button type="button" class="text-link" :disabled="resendSecondsLeft > 0" @click="resendCode">
                {{ resendSecondsLeft > 0 ? `Resend code (${resendSecondsLeft}s)` : 'Resend code' }}
              </button>
              <button type="button" class="text-link" @click="useDifferentEmail">Use a different email</button>
            </div>
          </form>

          <!-- Staff flow -->
          <form v-else @submit.prevent="staffSignIn">
            <div class="fields">
              <TextField
                v-model="staffEmail"
                label="Email"
                type="email"
                required
                autocomplete="username"
              />
              <TextField
                v-model="staffPassword"
                label="Password"
                type="password"
                required
                autocomplete="current-password"
              />
            </div>
            <p v-if="staffError" class="form-error">{{ staffError }}</p>
            <button type="submit" class="primary-btn" :disabled="staffSigningIn">
              {{ staffSigningIn ? 'Signing in…' : 'Sign in' }}
            </button>
          </form>

          <div class="mode-switch">
            <button v-if="mode === 'applicant'" type="button" class="text-link muted" @click="showStaffSignIn">
              BTX staff sign in
            </button>
            <button v-else type="button" class="text-link muted" @click="backToApplicant">‹ Back</button>
          </div>
        </section>
      </div>
    </main>

    <footer class="footer">The BTX Foundation · Scholarship Application</footer>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.content {
  flex: 1;
  width: 100%;
  padding: 40px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.sign-in-wrap {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

/* Same markup/position/style as WizardShell.vue's own Back link (top-left,
   above the page title) -- this one always returns to the landing page,
   unlike .mode-switch's "‹ Back" below (which switches the applicant/staff
   flow in place, not the page). Kept visually distinct from that one on
   purpose: left-aligned at the top vs. centered under the card, and
   --color-header-strong/14px/700 vs. --color-text-secondary/13px/600. */
.back-link {
  align-self: flex-start;
  font-weight: 700;
  font-size: 14px;
  color: var(--color-header-strong);
  text-decoration: none;
  margin-bottom: 12px;
}

.heading {
  font-family: var(--font-serif);
  font-weight: 800;
  font-size: 28px;
  color: var(--color-header-strong);
}

.subline {
  margin-top: 8px;
  font-size: 14px;
  color: var(--color-text-secondary);
}

.card {
  margin-top: 24px;
  width: 100%;
  background: var(--color-surface);
  border: 1px solid var(--color-border-strong);
  border-radius: 12px;
  padding: 28px 24px;
  text-align: left;
}

.fields {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.primary-btn {
  margin-top: 24px;
  width: 100%;
  padding: 14px;
  border: none;
  border-radius: 10px;
  background: var(--color-header-strong);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}

.primary-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.primary-btn:disabled {
  background: var(--color-border-strong);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

/* Form-level error -- reuses the same danger token and visual treatment
   as btx-frontend's Login.vue (identical --color-danger-text hex, #b3261e,
   in both apps' base.css), for a failure that isn't tied to one field. */
.form-error {
  margin-top: 16px;
  background: rgba(179, 38, 30, 0.08);
  border: 1px solid rgba(179, 38, 30, 0.25);
  color: var(--color-danger-text);
  font-size: 13px;
  padding: 8px 12px;
  border-radius: 8px;
}

.code-links {
  margin-top: 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.text-link {
  background: none;
  border: none;
  padding: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--color-gold-strong);
  cursor: pointer;
}

.text-link:disabled {
  color: var(--color-text-secondary);
  cursor: not-allowed;
}

.mode-switch {
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--color-border);
  text-align: center;
}

.text-link.muted {
  color: var(--color-text-secondary);
}

.footer {
  padding: 20px;
  text-align: center;
  font-size: 12px;
  color: var(--color-text-secondary);
}
</style>
