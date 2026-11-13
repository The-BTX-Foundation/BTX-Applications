// The Fundraising page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-12).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-fundraising/index.html (the demo, source of truth
// for look and behaviour).
//
// This file is the contract between the page (components/fundraising/*) and the loaders (mock/fundraising-view.ts in mock
// mode, lib/fundraising-live.ts in live mode, picked by lib/fundraising-view-loader.ts). Types only, no logic. Dates travel
// as ISO calendar days ("2026-11-10"); money travels in cents.
import type { GiftSource } from './money-shared';

export type { GiftSource };

/** Who a checklist step belongs to: a person (initials and first name for "Waiting on Keith"), a group, or nobody. */
export type FrOwner =
  | { kind: 'person'; id: string; name: string; first: string; initials: string }
  | { kind: 'group'; name: string }
  | { kind: 'none' };

/** One step of the "Year-end giving" checklist (a tasks row with that checklist's id). */
export type FrStep = {
  id: string;
  title: string;
  /** The small word in the eyebrow ("Letter", "Newsletter"): tasks.note. */
  kind: string;
  owner: FrOwner;
  /** Due day, or null. */
  due: string | null;
  done: boolean;
};

/** The checklist under "Year-end giving". `steps` empty = nobody has made it yet. */
export type FrChecklist = { title: string; steps: FrStep[] };

/** One gift on "Recent gifts". `donor` null = anonymous. */
export type FrGift = { id: string; donor: string | null; source: GiftSource; monthly: boolean; amountCents: number; giftOn: string };

/** One line of "By source". */
export type FrSource = { key: GiftSource; label: string; cents: number };

/**
 * What each control may do. Mock mode: all true (the page changes its own state, like the demo). Live mode: all false,
 * because no write exists behind them (owner decision 2026-10-12: money writes stay off; checklist ticks and Board chat
 * nudges are not wired on this page). A false `logGift` draws the disabled "Coming soon" control; the others are not drawn.
 */
export type FrCaps = {
  /** "Log a gift": the typed line, its chips and the gold "Log gift" (and the `N` key). */
  logGift: boolean;
  /** "Undo" after a logged gift. */
  giftUndo: boolean;
  /** Ticking a checklist step done or open again, with Undo. */
  tick: boolean;
  /** "Nudge <name>" on the next step: a drafted Board chat message, sent in place. */
  nudge: boolean;
};

/** Everything the Fundraising page draws. */
export type FundraisingView = {
  /** Eastern calendar day the data was built for. */
  today: string;
  /** The year the figures count (the Eastern year of `today`). */
  year: number;
  /** The signed-in person's user id (their steps say "You"). */
  me: string;
  /** This year's money-raised goal in cents; null = no goal set. */
  goalCents: number | null;
  raisedCents: number;
  /** What July to September of this year brought in (the panel heading's aside). */
  q3Cents: number;
  donors: number;
  newDonors: number;
  monthlyDonors: number;
  /** The average gift, whole dollars in cents ("about $360"). */
  avgCents: number;
  sources: FrSource[];
  /** The newest gifts, newest first (at most five). */
  recent: FrGift[];
  /** null = the checklist could not be read (that panel shows its load-error line; the rest of the page still shows). */
  checklist: FrChecklist | null;
  /** The gold count beside "Budget" in the phone's Finance tabs; null = none drawn. */
  budgetCount: number | null;
  /** True when a core read failed: the header and the "Fundraising didn't load." card with Try again. */
  loadFailed: boolean;
  caps: FrCaps;
};

/** What the loader returns: the view, or a whole-page failure (the shared LoadError card, `?demo=failed`). */
export type FundraisingResult = (FundraisingView & { failed: false }) | { failed: true };
