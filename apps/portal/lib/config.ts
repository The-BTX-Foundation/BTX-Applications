// Public configuration read from NEXT_PUBLIC_ env vars (inlined into the browser bundle at build time).

/** Where "BTX board member? Go to the Ops Hub" points ("#" until the Ops Hub has an address). */
export const OPS_HUB_URL = process.env.NEXT_PUBLIC_OPS_HUB_URL || '#';

/** Addresses that may sign in without being Terpmail, for previews and testing (comma-separated, default empty). */
export const TEST_EMAILS: string[] = (process.env.NEXT_PUBLIC_PORTAL_TEST_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** BTX's LinkedIn page. */
export const LINKEDIN_URL = 'https://www.linkedin.com/company/thebtxfoundation/';

/** The video-call link for interviews ("Join the video call"). The live schema has no per-interview link, so this is one
 *  address from the environment; when it is empty the button is left out. */
export const INTERVIEW_JOIN_URL = process.env.NEXT_PUBLIC_INTERVIEW_JOIN_URL || '';

/** Where "Read the guides" points (BTX's website until the guides have their own page). */
export const GUIDES_URL = process.env.NEXT_PUBLIC_GUIDES_URL || 'https://thebtxfoundation.org';
