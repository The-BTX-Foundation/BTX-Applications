// Who may use the Ops Hub. One staff role, board member. A board member with admin rights has app_metadata.role 'admin'.
// The database's public.app_role() reads auth.jwt() -> app_metadata -> role, so the app reads the same field from the
// session. Only these two values get in; anyone else is signed out.
export const STAFF_ROLES = ['admin', 'board'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

// True when the value is one of the two staff roles.
export function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === 'string' && (STAFF_ROLES as readonly string[]).includes(role);
}

// The role as it is shown on the user card: "Board member", or "Admin rights" for a board member with admin rights (short, to fit the sidebar card).
export function roleLabel(role: StaffRole): string {
  return role === 'admin' ? 'Admin rights' : 'Board member';
}

// How the staff invite email says it: "a board member", or "a board member with admin rights".
export function roleInEmail(role: StaffRole): string {
  return role === 'admin' ? 'a board member with admin rights' : 'a board member';
}

// What admin rights add, in plain words. Each item is admin-only in the database or the server actions (cycle settings,
// interview times, sending decisions, applicant export, deleting finance records, admin rights). Used by the People page.
export const ADMIN_RIGHTS_LIST = 'change cycle settings, open interview times, send decisions, export applicant lists, delete finance records, and give or remove admin rights';

/** The message shown when a signed-in account has no staff role. */
export const NO_ACCESS = "This account doesn't have Ops Hub access. Ask a board member with admin rights.";
