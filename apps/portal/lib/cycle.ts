// The cycle's settings as the Portal shows them today. Later these are read from the cycle record that the Ops Hub
// edits (BUILD-PLAN.md, "Facts that are cycle settings"). Until a setting is filled in, the screen shows its
// placeholder in square brackets, exactly as the signed-off Figma frames do.
export const cycle = {
  scholarshipName: 'Legacy Scholarship',
  /** Prize amount; a placeholder until the board sets it. */
  amount: '[amount]',
  applyBy: 'Mon Sep 14',
  /** Deadline hour (Eastern); a placeholder until the board sets it. */
  deadlineTime: '[time]',
  requirementsNote: '[Legacy requirements to confirm]',
  /** How long a sign-in code works; a placeholder until it is set. */
  codeLifetime: '[time]',
  /** The cycle name used in the rail title and the dates heading. */
  term: 'Fall 2026',
} as const;

/** Where "BTX board member? Go to the Ops Hub" points. */
export const OPS_HUB_URL = process.env.NEXT_PUBLIC_OPS_HUB_URL || '#';
