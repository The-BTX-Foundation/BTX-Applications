// The rules for an extra award, kept apart from the database so the server action (lib/actions/selection.ts), the form
// (components/selection-view.tsx) and the unit tests (tests/extra-awards.test.ts) all share them.
// The board adds as many extra awards as it wants, each with its own name and amount (owner, 2026-10-12), so nothing
// about an extra award is preset. The database allows any number of kind 'extra' rows per cycle (award_name 1 to 120
// characters, amount_cents 0 or more, one award per application); the dollar limits below are the app's own.

export const EXTRA_NAME_MAX = 120;
/** One dollar. */
export const EXTRA_MIN_CENTS = 100;
/** $100,000. */
export const EXTRA_MAX_CENTS = 10_000_000;

export const NAME_MESSAGE = 'Give the award a name.';
export const AMOUNT_MESSAGE = 'Enter an amount in dollars.';
export const RELEASED_MESSAGE = "Decisions have gone out, so awards can't be added here.";

export type ExtraCheck = { ok: true; awardName: string } | { ok: false; message: string };

/** Checks an extra award's name (trimmed, 1 to 120 characters) and amount (whole cents, $1 to $100,000). */
export function checkExtraAward(input: { awardName: string; amountCents: number }): ExtraCheck {
  const awardName = (input.awardName ?? '').trim();
  if (awardName.length < 1 || awardName.length > EXTRA_NAME_MAX) return { ok: false, message: NAME_MESSAGE };
  const c = input.amountCents;
  if (!Number.isInteger(c) || c < EXTRA_MIN_CENTS || c > EXTRA_MAX_CENTS) return { ok: false, message: AMOUNT_MESSAGE };
  return { ok: true, awardName };
}

/** Reads what was typed in the whole-dollar box ("1,500" or "1500") as cents, or NaN when it is not a whole number. */
export function dollarsToCents(text: string): number {
  const t = text.replace(/[,\s]/g, '');
  return /^\d{1,7}$/.test(t) ? Number(t) * 100 : NaN;
}

/** Extras can be added until decisions are released: the refusal to show, or null when adding is still open. */
export function addRefusal(releasedAt: string | null): string | null {
  return releasedAt ? RELEASED_MESSAGE : null;
}

/** Steps done on the Selection agenda: the main award, then the call (which has no tick yet). Extras never count. */
export function agendaDone(hasMain: boolean): number {
  return hasMain ? 1 : 0;
}
export const AGENDA_STEPS = 2;
