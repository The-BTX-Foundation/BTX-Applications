// Shared scoring rubric: the 6 criteria (key, label, weight out of 100)
// and the 5 generic, criterion-agnostic rank descriptions. Scoring.vue and
// ScoreApplicant.vue both import from here instead of each hardcoding
// their own copy.
//
// save-score (the Edge Function that actually computes weighted_total)
// duplicates this exact same criteria/weight list rather than importing
// it -- this is a frontend module, not something an isolated Deno Edge
// Function can import, and every function in this project is already
// self-contained for that reason. If the rubric ever changes, this file
// and that function's own copy must be updated together, by hand.
export const RUBRIC_CRITERIA = [
  { key: 'community', label: 'Community Engagement and Values', weight: 20 },
  { key: 'resilience', label: 'Resilience and Problem-Solving', weight: 20 },
  { key: 'leadership', label: 'Leadership and Teamwork', weight: 20 },
  { key: 'financial', label: 'Financial Need and Impact', weight: 20 },
  { key: 'communication', label: 'Communication Skills', weight: 10 },
  { key: 'passion', label: 'Passion and Motivation', weight: 10 },
]

// PLACEHOLDER: five generic, criterion-agnostic rank descriptions -- no
// real per-criterion rubric language exists yet. Swap for the BTX
// Foundation's actual rubric language once it exists.
export const RANK_DESCRIPTIONS = [
  { score: 1, label: 'Needs improvement', detail: 'Response showed minimal evidence for this criterion.' },
  { score: 2, label: 'Developing', detail: 'Response showed some evidence, but was inconsistent or underdeveloped.' },
  { score: 3, label: 'Meets expectations', detail: 'Response showed solid, adequate evidence for this criterion.' },
  { score: 4, label: 'Strong', detail: 'Response showed clear, well-supported evidence for this criterion.' },
  { score: 5, label: 'Excellent', detail: 'Response showed exceptional, standout evidence for this criterion.' },
]
