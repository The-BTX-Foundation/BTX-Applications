// Who may use the Ops Hub. The database's public.app_role() reads auth.jwt() -> app_metadata -> role, so the app reads
// the same field from the session. Only these three roles get in; anyone else is signed out.
export const STAFF_ROLES = ['admin', 'board', 'reviewer'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// True when the value is one of the three staff roles.
export function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role);
}

// The role as it is shown on the user card: "Admin", "Board member", "Reviewer".
export function roleLabel(role: StaffRole): string {
  return role === 'admin' ? 'Admin' : role === 'board' ? 'Board member' : 'Reviewer';
}

/** The message shown when a signed-in account has no staff role. */
export const NO_ACCESS = "This account doesn't have Ops Hub access. Ask a BTX admin.";
