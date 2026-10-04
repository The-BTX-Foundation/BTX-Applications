<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useApplicationStore } from '../../stores/application'
import TextField from '../../components/TextField.vue'
import SelectField from '../../components/SelectField.vue'
import SegmentedControl from '../../components/SegmentedControl.vue'
import { isStepValid } from '../../lib/stepValidation'

const router = useRouter()
const store = useApplicationStore()

const GENDER_OPTIONS = ['Female', 'Male', 'Prefer not to say']
const ATTENDS_UMD_OPTIONS = ['Yes', 'No']
const EDUCATION_STATUS_OPTIONS = ['Freshman', 'Sophomore', 'Junior', 'Senior']

// PLACEHOLDER: standard IPEDS-style race/ethnicity categories, pending the
// BTX Foundation's actual required list for this field.
const RACE_OPTIONS = [
  'American Indian or Alaska Native',
  'Asian',
  'Black or African American',
  'Hispanic or Latino',
  'Native Hawaiian or Other Pacific Islander',
  'White',
  'Two or more races',
  'Prefer not to say',
]

// PLACEHOLDER: Clark School of Engineering undergraduate majors, pending
// the real, authoritative list for this field.
const MAJOR_OPTIONS = [
  'Aerospace Engineering',
  'Bioengineering',
  'Chemical Engineering',
  'Civil Engineering',
  'Computer Engineering',
  'Electrical Engineering',
  'Environmental Engineering',
  'Fire Protection Engineering',
  'Materials Science and Engineering',
  'Mechanical Engineering',
  'Robotics Engineering',
  'Undecided / Other',
]

// Only shows the email format error after the field has been visited once,
// so it doesn't appear before the applicant has had a chance to type.
const emailTouched = ref(false)

// A plausible address AND the school's Terpmail domain are both required;
// the domain check is case-insensitive since email domains aren't
// case-sensitive.
const emailIsValid = computed(() => {
  const value = store.email.trim()
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  return looksLikeEmail && value.toLowerCase().endsWith('@terpmail.umd.edu')
})

const emailError = computed(() => {
  if (!emailTouched.value || !store.email) return ''
  return emailIsValid.value ? '' : 'Enter a valid @terpmail.umd.edu address.'
})

// Strips everything but digits and re-applies the (XXX) XXX-XXXX mask on
// every keystroke, rather than validating a free-typed format afterward.
function formatPhone(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 10)
  if (digits.length > 6) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  if (digits.length > 3) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`
  if (digits.length > 0) return `(${digits}`
  return ''
}

// Applies the phone mask to user input and stores the formatted result.
function onPhoneInput(value) {
  store.phone = formatPhone(value)
}

const phoneDigitCount = computed(() => store.phone.replace(/\D/g, '').length)

// Credits left only accepts digits -- stripped on every keystroke, same
// approach as the phone mask above.
function onCreditsInput(value) {
  store.creditsLeft = value.replace(/\D/g, '')
}

const isValid = computed(() => isStepValid(1, store))

// Advances to Step 2. currentStep is set here (in addition to
// ApplyStepView's route watcher) so the draft reflects "completed step 1"
// the instant Continue is clicked, not only once navigation resolves.
function onContinue() {
  if (!isValid.value) return
  store.currentStep = 2
  router.push('/apply/2')
}
</script>

<template>
  <div>
    <h1 class="step-heading">Basic information</h1>
    <p class="step-subline">Tell us a bit about yourself. Use your Terpmail email address below.</p>

    <div class="fields">
      <TextField v-model="store.fullName" label="Full name" placeholder="First and last name" required />

      <TextField
        v-model="store.email"
        label="Terpmail email address"
        placeholder="yourname@terpmail.umd.edu"
        type="email"
        required
        :error="emailError"
        @blur="emailTouched = true"
      />

      <TextField
        :model-value="store.phone"
        label="Phone number"
        placeholder="(___) ___-____"
        type="tel"
        inputmode="numeric"
        required
        @update:modelValue="onPhoneInput"
      />

      <SegmentedControl v-model="store.gender" label="Gender" required :options="GENDER_OPTIONS" />

      <SelectField v-model="store.race" label="Race" placeholder="Select one" required :options="RACE_OPTIONS" />

      <SegmentedControl
        v-model="store.attendsUMD"
        label="Do you currently attend the University of Maryland, College Park?"
        required
        :options="ATTENDS_UMD_OPTIONS"
      />

      <SegmentedControl
        v-model="store.educationStatus"
        label="Education status"
        required
        :options="EDUCATION_STATUS_OPTIONS"
      />

      <TextField
        :model-value="store.creditsLeft"
        label="Credits left to finish your undergraduate curriculum"
        placeholder="e.g. 34"
        inputmode="numeric"
        required
        @update:modelValue="onCreditsInput"
      />

      <SelectField
        v-model="store.major"
        label="Major"
        placeholder="Select your major"
        required
        :options="MAJOR_OPTIONS"
      />
    </div>

    <button type="button" class="continue-btn" :disabled="!isValid" @click="onContinue">Continue</button>
  </div>
</template>

<style scoped>
.step-heading {
  margin-top: 20px;
  font-family: var(--font-serif);
  font-weight: 800;
  font-size: 32px;
  color: var(--color-header-strong);
}

.step-subline {
  margin-top: 8px;
  font-size: 15px;
  color: var(--color-text-secondary);
}

.fields {
  margin-top: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.continue-btn {
  margin-top: 28px;
  width: 100%;
  padding: 16px;
  border: none;
  border-radius: 10px;
  background: var(--color-header-strong);
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  cursor: pointer;
}

.continue-btn:hover:not(:disabled) {
  opacity: 0.92;
}

.continue-btn:disabled {
  background: var(--color-border-strong);
  color: var(--color-text-secondary);
  cursor: not-allowed;
}
</style>
