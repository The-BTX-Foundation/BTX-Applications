// The Grants page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-12).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-grants/index.html (the demo, source of truth for
// look and behaviour) and apps/design/ops-refresh/OPS-DNA.md (the finish rules).
//
// This file is the contract between the page (components/grants/*) and the loaders (mock/grants-view.ts in mock mode,
// lib/grants-live.ts in live mode, picked by lib/grants-view-loader.ts). Types only, no logic. Dates travel as ISO strings;
// money travels in cents.

/** The four pipeline stages, in the track's order (grants.stage). */
export type GrantStageKey = 'researching' | 'writing' | 'submitted' | 'decided';

/** A person or a group on a grant or a checklist step. `me` marks the signed-in person (drawn as "You", gold). */
export type GrantWho = { kind: 'person'; id: string; name: string; first: string; initials: string; me: boolean } | { kind: 'group'; name: string };

/** One grant in the pipeline (a grants row). */
export type GrantItem = {
  id: string;
  name: string;
  /** null = "Funder not set". */
  funder: string | null;
  /** null = "Amount not set". */
  amountCents: number | null;
  /** "Up to $10,000". */
  upTo: boolean;
  stage: GrantStageKey;
  outcome: 'won' | 'declined' | null;
  deadlineOn: string | null;
  /** A free note in place of a deadline ("Opens in January"). */
  dateNote: string | null;
  submittedOn: string | null;
  decidedOn: string | null;
  /** null = "Unassigned". */
  owner: GrantWho | null;
};

/** One step of the "Getting started with grants" checklist (a tasks row with that checklist's id). */
export type GrantStep = {
  id: string;
  title: string;
  /** The small word in the eyebrow ("Decision", "List", "Document"): tasks.note. */
  kind: string;
  /** null = "Unassigned". */
  who: GrantWho | null;
  due: string | null;
  done: boolean;
};

/** The checklist panel. */
export type GrantsChecklist = { title: string; steps: GrantStep[] };

/**
 * What each control may do. Mock mode: all true (the page changes its own state, like the demo). Live mode: all false
 * today (owner decision 2026-10-12: money writes stay off, "Add a grant" is a disabled "Coming soon" control; the checklist
 * and the nudge have no live write on this page). A false flag means the control is not drawn (or drawn disabled for "add").
 */
export type GrantsCaps = {
  /** "Add a grant" in place (parser, chips, Add grant). False = the disabled "Coming soon" row. */
  add: boolean;
  /** "Undo" after an added grant. */
  addUndo: boolean;
  /** Ticking a checklist step done or open again, with Undo. False = the tick is drawn, not a button. */
  tick: boolean;
  /** "Nudge <name>" on the step waiting on someone (a drafted Board chat message). */
  nudge: boolean;
};

/** Everything the Grants page draws. */
export type GrantsView = {
  /** Eastern-time calendar day the data was built for ("2026-11-10"). */
  today: string;
  /** The instant the data was built (the "Added 9:14 AM" time in mock mode). */
  now: string;
  /** Grants listed under their stage, in order. */
  grants: GrantItem[];
  /** Grants per stage (can be more than the rows listed: the "118 more researching" line). */
  counts: Record<GrantStageKey, number>;
  /** The checklist, or null when its read failed (only that panel shows its error line). */
  checklist: GrantsChecklist | null;
  /** The gold count beside "Budget" in the phone's Finance tabs; null = no count drawn. */
  budgetCount: number | null;
  /** True when the grants could not be read: the title, then the "Grants didn't load." card with Try again. */
  loadFailed: boolean;
  caps: GrantsCaps;
};

/** What the loader returns: the view, or a whole-page failure (the shared LoadError card, `?demo=failed`). */
export type GrantsResult = (GrantsView & { failed: false }) | { failed: true };
