// Only Terpmail addresses can sign in to the Portal (plus the env allow-list used for previews).
import { TEST_EMAILS } from './config';

export const TERPMAIL_DOMAIN = '@terpmail.umd.edu';

// Returns an error message for the sign-in field, or null when the address may sign in.
export function terpmailError(raw: string, allow: string[] = TEST_EMAILS): string | null {
  const email = raw.trim().toLowerCase();
  if (!email) return 'Enter your Terpmail address.';
  // allow-listed test addresses skip the Terpmail rule (they still have to look like an email)
  if (allow.includes(email) && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  if (!/^[^\s@]+@terpmail\.umd\.edu$/.test(email)) {
    return `Use your Terpmail address, like yourname${TERPMAIL_DOMAIN}.`;
  }
  return null;
}

/** The words shown when the database refuses a non-Terpmail applicant (same copy as the sign-in field). */
export const TERPMAIL_REFUSAL = `Use your Terpmail address, like yourname${TERPMAIL_DOMAIN}.`;

/** After the database refused starting a draft: true only when the signed-in address itself fails the Terpmail rule.
 *  The same refusal also happens when the cycle closed between page load and click, so a Terpmail address is never
 *  told to "use your Terpmail address". */
export function refusalIsTerpmail(email: string | null | undefined, allow: string[] = TEST_EMAILS): boolean {
  return Boolean(email) && terpmailError(email as string, allow) !== null;
}
