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
