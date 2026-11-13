// The Sponsorships page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-12).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-sponsorships/index.html (the demo, source of truth
// for look and behaviour) and apps/design/ops-refresh/OPS-DNA.md (the finish rules).
//
// This file is the contract between the page (components/sponsorships/*) and the loaders (mock/sponsorships-view.ts in mock
// mode, lib/sponsorships-live.ts in live mode, picked by lib/sponsorships-view-loader.ts). Types only, no logic. Dates travel
// as ISO calendar days ("2026-11-10"); money travels in cents.

/** What a sponsorship paid for (the `sponsorships.kind` values). */
export type SponsorKind = 'conference' | 'travel' | 'fee' | 'other';

/** One sponsorship row under "<year>". */
export type SponsorRow = {
  id: string;
  title: string;
  kind: SponsorKind;
  students: number;
  /** The amount in cents. */
  cents: number;
  /** The words under the title: the stored label ("Spring 2026") or the date ("Thu Dec 31"), or "Date not set". */
  when: string;
  /** The spending date (`occurred_on`), or null for an old row without one. */
  on: string | null;
  /** "done" draws the Done mark and the "On Budget" link; "planned" draws "Not started". */
  state: 'done' | 'planned';
};

/** One step of "How a sponsorship works"; `here` marks the step this page is for (logging it). */
export type HowStep = { title: string; body: string; here?: boolean };

/**
 * What each control may do. Mock mode: all true (the page changes its own state, like the demo). Live mode: true only where
 * a real write exists behind the control; a false flag means the control is NOT drawn (no dead controls).
 */
export type SponsorCaps = {
  /** "Log a sponsorship": the parser, the money confirm and the gold "Log $X" (rpc log_sponsorship). */
  log: boolean;
  /** "Undo" after a log (there is no reverse write for log_sponsorship: mock only). */
  undo: boolean;
};

/**
 * Mock-only switch for the write path (never set in live mode): `failsave` makes the next log fail as a timeout would,
 * then the check finds it did NOT save (Try again works); `unsure` makes the check itself fail ("Check again").
 */
export type MockWrite = 'failsave' | 'unsure' | null;

/** Everything the Sponsorships page draws. */
export type SponsorsView = {
  /** Eastern-time calendar day the data was built for ("2026-11-10"). */
  today: string;
  /** The year shown (the current Eastern year). */
  year: number;
  /** This year's sponsorships (cancelled ones left out), oldest first. */
  rows: SponsorRow[];
  /** "How a sponsorship works", four steps. */
  how: HowStep[];
  /** True when the sponsorships could not be read: the title and the demo's "Sponsorships didn't load." card. */
  loadFailed: boolean;
  caps: SponsorCaps;
  mockWrite: MockWrite;
};

/** What the loader returns: the view, or a whole-page failure (the shared LoadError card, `?demo=failed`). */
export type SponsorsResult = (SponsorsView & { failed: false }) | { failed: true };
