import { ref, watch } from 'vue'
import { defineStore } from 'pinia'

// Single localStorage key for the whole draft -- namespaced so it can't
// collide with anything else a browser might store for this origin.
const STORAGE_KEY = 'btx-scholarship-application-draft'

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

// Used by the router to decide where "/apply" resolves to, without needing
// an active Pinia instance (route resolution can run before one exists).
export function getSavedStep() {
  const step = Number(loadDraft().currentStep)
  return step >= 1 && step <= 7 ? step : 1
}

// Every field across all 7 wizard steps is declared here from day one --
// only Step 1 has real UI this round, but Steps 2-7's fields exist now
// (empty/false) so later rounds add UI without restructuring the store.
export const useApplicationStore = defineStore('application', () => {
  const draft = loadDraft()
  const field = (key, fallback) => ref(key in draft ? draft[key] : fallback)

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
  // Step 7 -- agreements + submission (placeholder)
  const agreeAccuracy = field('agreeAccuracy', false)
  const agreeCommunications = field('agreeCommunications', false)
  const agreeTerms = field('agreeTerms', false)
  const submitted = field('submitted', false)

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
    agreeAccuracy,
    agreeCommunications,
    agreeTerms,
    submitted,
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

  return { ...allFields }
})
