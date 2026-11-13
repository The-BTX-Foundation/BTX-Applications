// The one place that says where a single interview's page lives. An interview is keyed by its interview time (slot) id,
// the same id as IzBooking.id. Static routes (questions, availability) win over this dynamic segment in Next.js.
export function interviewHref(slotId: string): string {
  return `/scholarships/interviews/${encodeURIComponent(slotId)}`;
}
