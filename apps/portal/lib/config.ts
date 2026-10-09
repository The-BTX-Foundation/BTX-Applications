// Public configuration read from NEXT_PUBLIC_ env vars (inlined into the browser bundle at build time).

/** Where "BTX board member? Go to the Ops Hub" points ("#" until the Ops Hub has an address). */
export const OPS_HUB_URL = process.env.NEXT_PUBLIC_OPS_HUB_URL || '#';

/** Addresses that may sign in without being Terpmail, for previews and testing (comma-separated, default empty). */
export const TEST_EMAILS: string[] = (process.env.NEXT_PUBLIC_PORTAL_TEST_EMAILS ?? '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
