import { computed, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { getIncompleteSteps } from '../lib/stepValidation'

// Single localStorage key for the whole draft -- namespaced so it can't
// collide with anything else a browser might store for this origin.
const STORAGE_KEY = 'btx-scholarship-application-draft'

// sessionStorage (not localStorage) key marking that a submission has
// happened THIS browser session -- sessionStorage clears itself when the
// tab closes, which is exactly the lifetime a "you just submitted" flag
// should have.
const SUBMITTED_SESSION_KEY = 'btx-scholarship-submitted'

// Reads a previously saved draft, if any. Wrapped in try/catch since
// localStorage can throw in private-browsing contexts, or hold JSON left
// over from an earlier, incompatible shape of this store.
function loadDraft() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function readSubmittedFlag() {
  try {
    return sessionStorage.getItem(SUBMITTED_SESSION_KEY) === '1'
  } catch {
    return false
  }
}

// Used by the router to decide where "/apply" resolves to, without needing
// an active Pinia instance (route resolution can run before one exists).
//
// Checks the submitted flag first: ApplyStepView's own route-sync watcher
// sets currentStep to match whatever /apply/:step URL is showing, even when
// that's just the browser Back button stepping through history after a
// submission wiped the underlying data (Step 7 uses router.replace so Back
// can't land there directly, but it CAN land one step earlier, on a now-
// empty Step 6) -- so a stale currentStep can persist even though there's
// no real in-progress application behind it. Once submitted, "/apply"
// should always start a genuinely fresh application at step 1.
export function getSavedStep() {
  if (isSubmitted()) return 1
  const step = Number(loadDraft().currentStep)
  return step >= 1 && step <= 7 ? step : 1
}

// Used by the router guard on /apply/confirmation to decide whether that
// page may be shown, without needing an active Pinia instance -- same
// reasoning as getSavedStep() above.
export function isSubmitted() {
  return readSubmittedFlag()
}

// Every field across all 7 wizard steps is declared here from day one --
// only Step 1 has real UI this round, but Steps 2-7's fields exist now
// (empty/false) so later rounds add UI without restructuring the store.
export const useApplicationStore = defineStore('application', () => {
  const draft = loadDraft()
  // Records each field's fallback value as it's declared below, so
  // resetDraft() can restore every field to its true default without
  // duplicating this list of fallbacks a second time.
  const defaults = {}
  const field = (key, fallback) => {
    defaults[key] = fallback
    return ref(key in draft ? draft[key] : fallback)
  }

  const currentStep = field('currentStep', 1)

  // Step 1 -- Basic information
  const fullName = field('fullName', '')
  const email = field('email', '')
  const phone = field('phone', '')
  const gender = field('gender', '')
  const race = field('race', '')
  const attendsUMD = field('attendsUMD', '')
  const educationStatus = field('educationStatus', '')
  const creditsLeft = field('creditsLeft', '')
  const major = field('major', '')

  // Step 2 -- how they heard about BTX (placeholder)
  const howHeard = field('howHeard', '')
  // Step 3 -- per-award opt-outs (placeholder)
  const awardOptOuts = field('awardOptOuts', [])
  // Step 4 -- certification program interest (placeholder)
  const certificationInterest = field('certificationInterest', false)
  // Step 5 -- essay (placeholder)
  const essayText = field('essayText', '')
  // Step 6 -- interview availability + uploads (placeholder)
  const selectedSlots = field('selectedSlots', [])
  const resumeFileName = field('resumeFileName', '')
  const transcriptFileName = field('transcriptFileName', '')

  const allFields = {
    currentStep,
    fullName,
    email,
    phone,
    gender,
    race,
    attendsUMD,
    educationStatus,
    creditsLeft,
    major,
    howHeard,
    awardOptOuts,
    certificationInterest,
    essayText,
    selectedSlots,
    resumeFileName,
    transcriptFileName,
  }

  // Saves the full draft to localStorage on any field change. deep:true so
  // in-place pushes into awardOptOuts/selectedSlots (arrays) are also
  // caught, not just top-level ref reassignments.
  watch(
    Object.values(allFields),
    () => {
      const snapshot = {}
      for (const [key, value] of Object.entries(allFields)) snapshot[key] = value.value
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
    },
    { deep: true },
  )

  // Step 6 -- the actual uploaded File objects. Deliberately kept OUTSIDE
  // `allFields`/the persistence watcher above: a File object can't survive
  // JSON.stringify (it serializes to "{}"), so only its name
  // (resumeFileName/transcriptFileName above) is ever persisted. This
  // object starts empty on every page load -- Step 6's "needs reselect"
  // state is what tells the applicant to re-pick a file after a reload.
  const files = reactive({
    resume: null,
    transcript: null,
  })

  // Stores an uploaded File in memory and mirrors its name into the
  // persisted draft. kind is 'resume' or 'transcript'.
  function setDocument(kind, file) {
    files[kind] = file
    if (kind === 'resume') resumeFileName.value = file.name
    else if (kind === 'transcript') transcriptFileName.value = file.name
  }

  // Clears both the in-memory File and the persisted filename for kind.
  function clearDocument(kind) {
    files[kind] = null
    if (kind === 'resume') resumeFileName.value = ''
    else if (kind === 'transcript') transcriptFileName.value = ''
  }

  // True only when an actual File object is held in memory -- a saved
  // filename alone (e.g. right after a reload) doesn't count, since Step 7
  // needs to know whether there are real bytes to submit, not just a name.
  const hasResumeFile = computed(() => files.resume instanceof File)
  const hasTranscriptFile = computed(() => files.transcript instanceof File)

  // Step 7 -- the three agreement checkboxes. Deliberately NOT part of
  // `allFields`/the persistence watcher above (same reasoning as `files`):
  // consent to submit is only meaningful in the same session as the actual
  // submission, so a stale "yes" from a previous visit must never survive
  // a reload -- these simply start false on every page load.
  const agreedAccurate = ref(false)
  const agreedTerms = ref(false)
  const agreedPrivacy = ref(false)

  // Whether a submission has happened this browser session -- read once
  // from sessionStorage at store creation (mirrors `draft` above) and
  // flipped by submitApplication() on success.
  const submitted = ref(readSubmittedFlag())
  // Guards submitApplication() against firing twice from a double-click --
  // there's no real async gap yet since submission is simulated, but this
  // is the flag a later real (network) implementation will actually need.
  const submitting = ref(false)

  // SIMULATED submission -- the single seam where a real submission (an
  // actual write to Supabase/the BTX Ops Hub) gets wired in later. Makes NO
  // network call today. Refuses (returns false) if any required step is
  // incomplete or any agreement is unchecked; otherwise wipes the draft,
  // marks the session as submitted, and returns true.
  async function submitApplication() {
    if (submitting.value) return false
    const store = useApplicationStore()
    const incomplete = getIncompleteSteps(store)
    const allAgreed = agreedAccurate.value && agreedTerms.value && agreedPrivacy.value
    if (incomplete.length > 0 || !allAgreed) return false

    submitting.value = true
    resetDraft()
    // Consent was for THIS submission -- clear it along with the rest of
    // the draft so a second application started in the same tab starts
    // from a clean slate rather than pre-agreed checkboxes.
    agreedAccurate.value = false
    agreedTerms.value = false
    agreedPrivacy.value = false
    try {
      sessionStorage.setItem(SUBMITTED_SESSION_KEY, '1')
    } catch {
      // sessionStorage can throw in private-browsing contexts -- the
      // submitted ref below still flips for this in-memory session either
      // way, it just won't survive a reload of the confirmation page.
    }
    submitted.value = true
    submitting.value = false
    return true
  }

  // Restores every field to its original default, clears the in-memory
  // files, and drops the persisted draft entirely -- used by the dev-only
  // test nav panel's "Reset draft" button to get back to a clean slate
  // without a full page reload. Arrays are reset to a fresh [] rather than
  // reusing the fallback stored in `defaults` so pushes into the "reset"
  // draft never mutate that shared default array.
  function resetDraft() {
    for (const [key, value] of Object.entries(allFields)) {
      const fallback = defaults[key]
      value.value = Array.isArray(fallback) ? [] : fallback
    }
    files.resume = null
    files.transcript = null
    localStorage.removeItem(STORAGE_KEY)
  }

  return {
    ...allFields,
    files,
    setDocument,
    clearDocument,
    hasResumeFile,
    hasTranscriptFile,
    agreedAccurate,
    agreedTerms,
    agreedPrivacy,
    submitted,
    submitting,
    submitApplication,
    resetDraft,
  }
})
