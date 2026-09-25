// Single source of truth for the three BTX scholarships. Step 3 renders its
// award list and opt-out checkboxes from this, and a later round's Step 7
// summary will import it too -- names/amounts should only ever be edited
// here, never re-typed in a component.
export const AWARDS = [
  { id: 'think-big', label: 'Amazon Think Big Scholarship', shortLabel: 'Think Big', amount: 4000 },
  { id: 'legacy', label: 'BTX Legacy Award', shortLabel: 'Legacy', amount: 2000 },
  { id: 'empowerment', label: 'Empowerment Award', shortLabel: 'Empowerment', amount: 500 },
]

// Formats an award's dollar amount as "$X,XXX".
export function formatAwardAmount(amount) {
  return `$${amount.toLocaleString('en-US')}`
}
