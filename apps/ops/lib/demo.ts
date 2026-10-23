// App Review access. Apple's reviewer cannot receive a sign-in code, so the sign-in screen sends exactly one email address
// to a second copy of the Ops Hub (btx-ops-demo) that runs on sample data only. That copy has no database address, no keys
// and no real accounts: it is built with BTX_FORCE_MOCK=1 (see next.config.ts), so nothing in it can reach real information.
//
// The redirect target is fixed in code and the email match is exact, so the screen cannot be used to send anyone anywhere else.

export const REVIEW_EMAIL = 'appreview@thebtxfoundation.org';
export const DEMO_URL = 'https://demo-ops.thebtxfoundation.org/';

/** Where to send this typed email instead of asking for a code: the demo copy for the review email, otherwise nowhere. */
export function reviewRedirect(typed: string): string | null {
  return typed.trim().toLowerCase() === REVIEW_EMAIL ? DEMO_URL : null;
}

/** True in the sample-data copy only (built with BTX_FORCE_MOCK=1). Read as a literal so Next inlines it at build time. */
export const DEMO_COPY = process.env.NEXT_PUBLIC_BTX_FORCE_MOCK === '1';

export const DEMO_BANNER_TEXT = 'Sample data for App Review. No real information.';
