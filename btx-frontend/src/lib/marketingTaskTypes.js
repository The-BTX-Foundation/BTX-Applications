// Single source of truth for marketing_tasks' `type` taxonomy and its
// Calendar color-coding, so the New Marketing Task modal's dropdown and the
// Calendar's colored dots can never drift out of sync with each other. The
// values themselves are fixed by a database CHECK constraint — any value
// not in this list would be silently rejected by an insert/update.
export const MARKETING_TASK_TYPES = ['Marketing Event', 'Ad Publishment', 'Media Post']

// Colors settled on in mockup rounds — not a generic interpretation of the
// type names, so don't "simplify" these to nearest CSS color keywords.
export const MARKETING_TASK_TYPE_COLORS = {
  'Marketing Event': '#2C5282',
  'Ad Publishment': '#9C2B4E',
  'Media Post': '#2F6B45',
}
