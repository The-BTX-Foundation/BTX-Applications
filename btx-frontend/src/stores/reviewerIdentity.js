import { ref } from 'vue'
import { defineStore } from 'pinia'

// Shared self-typed reviewer/board-member identity -- the same free-text
// placeholder every operational table in this schema already uses
// (board_member_label / interviewer_one_label / interviewer_two_label /
// scholarship_scores.interviewer_label), not a new identity model, pending
// real per-reviewer accounts. In-memory only (this Pinia store's own
// state) -- never localStorage/sessionStorage -- so it's gone the moment
// this tab or store resets. Shared across Interviews.vue, Scoring.vue, and
// ScoreApplicant.vue (via ReviewerLabelPrompt.vue) so a reviewer only has
// to type their name once per session, not once per page.
export const useReviewerIdentityStore = defineStore('reviewerIdentity', () => {
  const label = ref('')

  // Normalizes (trims) and stores the self-typed label.
  function setLabel(newLabel) {
    label.value = newLabel.trim()
  }

  return { label, setLabel }
})
