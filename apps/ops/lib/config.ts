// Public configuration read from NEXT_PUBLIC_ env vars (inlined into the browser bundle at build time).

/** Where "Applying for a scholarship? Go to the application portal" points ("#" until the Portal has an address). */
export const PORTAL_URL = process.env.NEXT_PUBLIC_PORTAL_URL || '#';
