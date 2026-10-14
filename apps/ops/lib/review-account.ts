// The signed-in staff member's kind, for the Rayken Review widget's context only. The Shell (which already receives the
// role text from the server) sets it; the review context reads it. It holds 'Admin' or 'Board member', never a name.
export type ReviewAccount = 'Admin' | 'Board member';

let current: ReviewAccount | undefined;

/** Turns the role text the Shell already has ("Admin rights" or "Board member") into the account kind. */
export function accountFromRoleText(roleText: string): ReviewAccount {
  return roleText === 'Admin rights' ? 'Admin' : 'Board member';
}

export function setReviewAccount(account: ReviewAccount | undefined): void {
  current = account;
}

export function getReviewAccount(): ReviewAccount | undefined {
  return current;
}
