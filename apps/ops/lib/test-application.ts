// Board test applications: the Portal only lets Terpmail addresses sign in (apps/portal/lib/terpmail.ts) unless the address
// is on a test allow-list, so an application whose email is not @terpmail.umd.edu is a test one (a board member trying
// the Portal). The Ops Hub labels these "Board test" so nobody scores or picks one by mistake. Label only: nothing is hidden.
// Pure, so it is unit tested (tests/test-application.test.ts).
const TERPMAIL = '@terpmail.umd.edu';

/** True when the email is present and not a Terpmail address (case and spaces ignored). A missing email is not a test. */
export function isTestApplication(email: string | null | undefined): boolean {
  const e = (email ?? '').trim().toLowerCase();
  return e !== '' && !e.endsWith(TERPMAIL);
}
