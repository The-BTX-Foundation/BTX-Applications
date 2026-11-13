// The Newsletter page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-12).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-newsletter/index.html (the demo, source of truth for
// look and behaviour) and apps/design/ops-refresh/OPS-DNA.md (the finish rules).
//
// This file is the contract between the page (components/newsletter/*) and the loaders (mock/newsletter-view.ts in mock
// mode, lib/newsletter-live.ts in live mode, picked by lib/newsletter-view-loader.ts). Types only, no logic. Dates travel
// as ISO calendar days ("2026-11-30").

/** A section's stored status (`newsletter_sections.status`). */
export type NlStatus = 'not_started' | 'writing' | 'done';

/** Who owns a section or the issue. `mine` marks the signed-in person (drawn gold). */
export type NlOwner = { name: string; initials: string; mine: boolean };

/** One section of the issue (the issue's checklist). */
export type NlSection = {
  id: string;
  title: string;
  /** The one line the email preview shows under the title. */
  blurb: string;
  status: NlStatus;
  /** Null = "No owner". */
  owner: NlOwner | null;
  /** The day it can be written from (`waits_until`), or null. */
  waits: string | null;
  /** What it waits on, without the date ("Can be written once the board picks"), or null. */
  waitNote: string | null;
  /** Mock only (the demo's sample): this section is the next one to write even if an earlier one reopens. */
  pinned?: boolean;
};

/** The issue being written (the next one not sent). */
export type NlIssue = {
  /** The panel heading: "November issue" (the send month), or the stored title when there is no send date. */
  heading: string;
  /** The month the issue goes out ("November"), or null with no send date. */
  month: string | null;
  /** The email's subject and preview title ("BTX news, November 2026"). */
  previewTitle: string;
  intro: string;
  /** The send day, or null when not set. */
  sendOn: string | null;
  /** The issue's owner (the issue's, else the Newsletter channel's), or null. */
  owner: NlOwner | null;
};

/** The facts strip under the sections. */
export type NlFacts = {
  /** Subscribers as stored (`audience_count`), "Not set", or null when the channel read failed ("Couldn't count"). */
  subscribers: string | null;
  /** "October 2026", or "None yet". */
  lastIssue: string;
  /** The email tool ("Not set" in live mode: not stored yet). */
  tool: string;
};

/**
 * What each control may do. Mock mode: all true (the page changes its own state, like the demo). Live mode: true only where
 * a real write exists behind the control; a false flag means the control is NOT drawn (no dead controls).
 */
export type NlCaps = {
  /** Tick, untick and "Mark done" on a section (newsletter_sections.status). */
  tick: boolean;
  /** Undo after a tick: the reverse status write. */
  undo: boolean;
  /** "Nudge <owner>" with a drafted Board chat message (mock only: owner rule 3b/4 keeps it off live). */
  nudge: boolean;
  /** "Send to N subscribers" and its confirm (mock only, NEVER live: nothing may send the newsletter). */
  send: boolean;
  /** "Past issues" beside the title (mock only: answers "not connected yet"). */
  pastIssues: boolean;
};

/** Everything the Newsletter page draws. */
export type NlView = {
  /** Eastern-time calendar day the data was built for ("2026-11-10"). */
  today: string;
  /** The next issue, or null when none is planned. */
  issue: NlIssue | null;
  /** The issue's sections in order. */
  sections: NlSection[];
  facts: NlFacts;
  /** True when the issue could not be read: the title and the demo's "Newsletter didn't load." card. */
  loadFailed: boolean;
  caps: NlCaps;
  /** Mock only (`?demo=failsave`): the first save of each section fails, to show "Couldn't save. Try again.". */
  failFirst?: boolean;
};

/** What the loader returns: the view, or a whole-page failure (the shared LoadError card, `?demo=failed`). */
export type NlResult = (NlView & { failed: false }) | { failed: true };
