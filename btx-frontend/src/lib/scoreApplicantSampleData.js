// PLACEHOLDER SAMPLE DATA -- applicant scoring detail page ONLY.
//
// Sibling module to scoringSampleData.js, same non-reactive-module pattern
// (this data is read-only per applicant; nothing here needs to be shared
// or mutated the way YOUR_QUEUE/ALL_APPLICANTS are). Nothing on this page
// is fetched from Supabase -- there is no interview-transcript or
// scoring-detail table backing any of this yet.
//
// Only APP-058 matches verified mockup content. APP-062 and APP-066 are
// reachable from the same queue via the same "Score ->" flow but have no
// matching mockup -- both get the same page structure with an honest
// "no transcript available" fallback instead of fabricated quotes, rather
// than inventing content the mockup never specified.

const NO_TRANSCRIPT_CRITERION_NOTE =
  'No transcript is available for this applicant in this preview -- assess this criterion from your own conversation with the applicant.'

export const APPLICANT_DETAIL = {
  'APP-058': {
    statusPill: 'Not started',
    scholarshipLine: 'Amazon Think Big Scholarship - interviewed Sep 12',
    interviewerNote:
      "Interviewer #2 (reviewer) has not submitted their ranking yet. Rankings are independent -- they won't see yours until both are published.",
    // The whole transcript block below is FABRICATED preview content --
    // there is no real transcription/summarization pipeline behind this
    // page. It exists only to give the six rubric criteria below
    // something concrete to reference.
    transcript: {
      summary:
        "The applicant described tutoring on campus and volunteering with a local STEM outreach program, connecting both to their values around access and mentorship. On resilience, they described nearly withdrawing from a lab course while working part-time before restructuring their schedule with an advisor's help. They led a capstone team through a redesign after an initial approach failed, and explained that the scholarship would let them reduce work hours to take an unpaid research assistantship. Responses were clear and specific throughout, with direct follow-through on each question.",
      footer: 'Auto-generated summary - interview recorded Sep 12, 24 min',
    },
    criteria: {
      community: {
        type: 'quote',
        timestamp: '8:12',
        text: "I tutor other students on campus a couple times a week, and I also volunteer with a STEM outreach program back in my hometown. Both of those come from the same place for me -- I only got interested in engineering because someone made time to explain it to me, so I try to be that person for someone else now.",
      },
      resilience: {
        type: 'quote',
        timestamp: '13:34',
        text: "Last spring I almost withdrew from my lab course because I was working nights and couldn't keep up with the write-ups. I went to my advisor instead of just quietly failing, and we restructured my schedule around my shifts. I finished the course, and now I actually check in with her every few weeks instead of waiting until something's already a problem.",
      },
      leadership: {
        type: 'quote',
        timestamp: '16:05',
        text: "On my capstone team, our first sensor design didn't hold up in testing and we had about three weeks left. I ended up taking the lead on splitting us into two smaller groups so we could test two redesigns in parallel instead of debating one approach the whole time. That's the version we ended up submitting, and it actually worked better than our original plan.",
      },
      financial: {
        type: 'quote',
        timestamp: '19:47',
        text: "Right now I work about 25 hours a week to cover rent, which is most of why I haven't been able to take a research position -- they're all unpaid. If I had this scholarship I could cut back to maybe 10 hours and take the assistantship I've been offered in the robotics lab, which is the kind of experience I actually need for grad school applications.",
      },
      communication: {
        type: 'note',
        text: "No single response maps to this criterion -- assess it from clarity and delivery across all of the applicant's answers above.",
      },
      passion: {
        type: 'note',
        text: "No single response maps to this criterion -- assess it from enthusiasm and motivation across all of the applicant's answers above.",
      },
    },
  },

  // APP-062/APP-066: same structure, no mockup content -- transcript is
  // null (renders the "no transcript available" card) and every criterion
  // falls back to the same NO_TRANSCRIPT_CRITERION_NOTE rather than
  // reusing APP-058's criterion-specific notes, since those specifically
  // describe "no SINGLE quote fits" (a transcript exists, just nothing
  // maps cleanly), which isn't true here -- there's no transcript at all.
  'APP-062': {
    statusPill: 'Not started',
    scholarshipLine: 'Amazon Think Big Scholarship',
    interviewerNote:
      "Interviewer #2 (board) has not submitted their ranking yet. Rankings are independent -- they won't see yours until both are published.",
    transcript: null,
    criteria: {
      community: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      resilience: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      leadership: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      financial: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      communication: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      passion: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
    },
  },
  'APP-066': {
    statusPill: 'Not started',
    scholarshipLine: 'Amazon Think Big Scholarship',
    interviewerNote:
      "Interviewer #2 (reviewer) has not submitted their ranking yet. Rankings are independent -- they won't see yours until both are published.",
    transcript: null,
    criteria: {
      community: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      resilience: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      leadership: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      financial: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      communication: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
      passion: { type: 'note', text: NO_TRANSCRIPT_CRITERION_NOTE },
    },
  },
}

// PLACEHOLDER: five generic, criterion-agnostic rank descriptions, reused
// across all six criteria -- the mockup shows no selected-score example
// for any criterion, so there's no real per-criterion rubric language to
// reproduce yet. Swap these for the BTX Foundation's actual rubric
// language once it exists.
export const RANK_DESCRIPTIONS = [
  { score: 1, label: 'Needs improvement', detail: 'Response showed minimal evidence for this criterion.' },
  { score: 2, label: 'Developing', detail: 'Response showed some evidence, but was inconsistent or underdeveloped.' },
  { score: 3, label: 'Meets expectations', detail: 'Response showed solid, adequate evidence for this criterion.' },
  { score: 4, label: 'Strong', detail: 'Response showed clear, well-supported evidence for this criterion.' },
  { score: 5, label: 'Excellent', detail: 'Response showed exceptional, standout evidence for this criterion.' },
]
