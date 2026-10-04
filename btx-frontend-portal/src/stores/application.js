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

// Reads whether this browser session already submitted an application.
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
  // Declares one draft field: records its fallback (for resetDraft) and
  // returns a ref seeded from the loaded draft, or the fallback if absent.
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
  // there's now a real async gap (the fetch below), so this is load-bearing
  // in a way it wasn't when submission was simulated.
  const submitting = ref(false)
  // Set by submitApplication() on a non-success response, cleared at the
  // start of every new attempt. { code: 'already_submitted' | 'cycle_not_open'
  // | 'generic', message } -- Step7ReviewSubmit.vue reads this to show
  // exactly one of three failure banners. null means no error to show.
  const submitError = ref(null)

  // Converts this store's own field shapes into submit-application's
  // expected request body shape. Two fields need an actual conversion, not
  // just a rename, because the store's UI-facing shape doesn't match the
  // database column type:
  //   - attendsUMD is the string 'Yes'/'No' (a SegmentedControl value) --
  //     attends_umd is a boolean column.
  //   - creditsLeft is a string of digits (a text input's raw value) --
  //     credits_left is an integer column.
  // Every other field is a straight rename (email -> terpmail_email,
  // resumeFileName -> resume_filename, etc.) -- see the Edge Function's own
  // parseApplication comment for the full mapping this mirrors.
  function buildSubmissionPayload() {
    return {
      full_name: fullName.value,
      terpmail_email: email.value,
      phone: phone.value,
      gender: gender.value,
      race: race.value,
      attends_umd: attendsUMD.value === 'Yes',
      education_status: educationStatus.value,
      credits_left: Number(creditsLeft.value),
      major: major.value,
      how_heard: howHeard.value,
      award_opt_outs: awardOptOuts.value,
      certification_interest: certificationInterest.value,
      essay_text: essayText.value,
      selected_slots: selectedSlots.value,
      resume_filename: resumeFileName.value,
      transcript_filename: transcriptFileName.value,
      agreed_accurate: agreedAccurate.value,
      agreed_terms: agreedTerms.value,
      agreed_privacy: agreedPrivacy.value,
    }
  }

  // The first real network call this store makes -- every submission
  // before this was simulated client-side. POSTs to the submit-application
  // Edge Function; the URL is built from VITE_SUPABASE_URL (this project's
  // existing env-var convention, see src/lib/supabaseClient.js) rather than
  // a hardcoded host. Refuses (returns false, no network call attempted) if
  // any required step is incomplete or any agreement is unchecked -- that's
  // just avoiding an obviously-futile request; the Edge Function's own
  // validation is the real defense regardless of what this check does.
  //
  // On 201: proceeds exactly as the old simulated path did -- wipes the
  // draft, marks the session as submitted, returns true so Step 7
  // navigates to the confirmation screen. On 409 (already_submitted) or
  // 403 (cycle_not_open): leaves the draft and agreements untouched and
  // sets submitError so Step 7 can show that specific message instead of
  // navigating. On anything else (other status codes, a thrown network
  // error): same "leave everything alone" handling, with a generic retry
  // message.
  async function submitApplication() {
    if (submitting.value) return false
    const store = useApplicationStore()
    const incomplete = getIncompleteSteps(store)
    const allAgreed = agreedAccurate.value && agreedTerms.value && agreedPrivacy.value
    if (incomplete.length > 0 || !allAgreed) return false

    submitting.value = true
    submitError.value = null

    let response
    try {
      response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/submit-application`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(buildSubmissionPayload()),
      })
    } catch {
      submitError.value = {
        code: 'generic',
        message: 'Something went wrong submitting your application. Please check your connection and try again.',
      }
      submitting.value = false
      return false
    }

    if (response.status === 201) {
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

    if (response.status === 409) {
      submitError.value = {
        code: 'already_submitted',
        message: 'An application already exists for this email this cycle.',
      }
    } else if (response.status === 403) {
      // The Edge Function supplies its own human-readable message for this
      // case (e.g. naming the specific cycle year) -- fall back to a
      // generic one only if the response body is somehow missing it.
      let message = 'Applications are not currently open.'
      try {
        const parsed = await response.json()
        if (typeof parsed?.message === 'string') message = parsed.message
      } catch {
        // Malformed/empty body -- keep the fallback message above.
      }
      submitError.value = { code: 'cycle_not_open', message }
    } else {
      submitError.value = {
        code: 'generic',
        message: 'Something went wrong submitting your application. Please try again.',
      }
    }

    submitting.value = false
    return false
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
    submitError,
    submitApplication,
    resetDraft,
  }
})
