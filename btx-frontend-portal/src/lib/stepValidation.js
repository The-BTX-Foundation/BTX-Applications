// Single source of truth for "is this step complete" -- previously Steps 1,
// 2, 5, and 6 each computed their own Continue-button `isValid`. Centralized
// here so Step 7's "what's still missing" summary can never drift from what
// actually gates each step's own Continue button.

const STEP_TITLES = {
  1: 'Basic information',
  2: 'How you found us',
  3: 'Programs & awards',
  4: 'Optional essay',
  5: 'Interview availability',
  6: 'Upload documents',
}

// Same rule Step 1's own inline email hint uses: a plausible address AND
// the school's Terpmail domain (case-insensitive).
function isValidEmail(email) {
  const value = email.trim()
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
  return looksLikeEmail && value.toLowerCase().endsWith('@terpmail.umd.edu')
}

const MIN_INTERVIEW_SLOTS = 4

// Returns whether the given step (1-6) is complete, using the exact same
// field checks each step's own component uses for its Continue button.
// Steps 3 and 4 are always valid -- every field on them is optional.
export function isStepValid(step, store) {
  switch (step) {
    case 1:
      return (
        store.fullName.trim().length > 0 &&
        isValidEmail(store.email) &&
        store.phone.replace(/\D/g, '').length === 10 &&
        store.gender.length > 0 &&
        store.race.length > 0 &&
        store.attendsUMD.length > 0 &&
        store.educationStatus.length > 0 &&
        store.creditsLeft.length > 0 &&
        store.major.length > 0
      )
    case 2:
      return store.howHeard.length > 0
    case 3:
    case 4:
      return true
    case 5:
      return store.selectedSlots.length >= MIN_INTERVIEW_SLOTS
    case 6:
      return store.hasResumeFile && store.hasTranscriptFile
    default:
      return true
  }
}

// Returns [{ step, title }] for every required step (1-6) that isn't valid
// yet -- used by Step 7 to list what still needs attention before submit.
export function getIncompleteSteps(store) {
  const incomplete = []
  for (let step = 1; step <= 6; step++) {
    if (!isStepValid(step, store)) incomplete.push({ step, title: STEP_TITLES[step] })
  }
  return incomplete
}
