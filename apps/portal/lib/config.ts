// Public configuration read from NEXT_PUBLIC_ env vars (inlined into the browser bundle at build time).

/** Where "BTX board member? Go to the Ops Hub" points ("#" until the Ops Hub has an address). */
export const OPS_HUB_URL = process.env.NEXT_PUBLIC_OPS_HUB_URL || '#';

/** Addresses that may sign in without being Terpmail, for previews and testing (comma-separated, default empty). Exact
 *  addresses, or "+tag" entries (see parseTestEmails). */
export const TEST_EMAILS: string[] = parseTestEmails(process.env.NEXT_PUBLIC_PORTAL_TEST_EMAILS);

/** Splits the allow-list. An entry starting with "+" (like "+apply") is a tag: it allows any address whose part before
 *  the @ ends with it. Any other entry is an exact address. */
export function parseTestEmails(raw: string | undefined): string[] {
  return (raw ?? '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** The two guide pages. Empty until the pages exist; screens show each link only when its address is set. */
export const PREPARE_GUIDE_URL = process.env.NEXT_PUBLIC_PREPARE_GUIDE_URL || '';
export const OFFERS_URL = process.env.NEXT_PUBLIC_OFFERS_URL || '';
/** The certification program's page. Empty until it exists; the closed landing hides the link until then. */
export const CERTIFICATION_URL = process.env.NEXT_PUBLIC_CERTIFICATION_URL || '';

/** How long a sign-in code works, everywhere the Portal says so (the same for every cycle). */
export const CODE_LIFETIME_MINUTES = 10;

/** BTX's LinkedIn page. */
export const LINKEDIN_URL = 'https://www.linkedin.com/company/thebtxfoundation/';

/** Where "Read the guides" points (BTX's website until the guides have their own page). */
export const GUIDES_URL = process.env.NEXT_PUBLIC_GUIDES_URL || 'https://thebtxfoundation.org';
