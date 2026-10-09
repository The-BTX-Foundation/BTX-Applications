// Only Terpmail addresses can sign in to the Portal.
export const TERPMAIL_DOMAIN = '@terpmail.umd.edu';

// Returns an error message for the sign-in field, or null when the address is a valid Terpmail address.
export function terpmailError(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email) return 'Enter your Terpmail address.';
  if (!/^[^\s@]+@terpmail\.umd\.edu$/.test(email)) {
    return `Use your Terpmail address, like yourname${TERPMAIL_DOMAIN}.`;
  }
  return null;
}
