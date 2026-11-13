// The Outreach > Instagram page's data, in one shape for both modes (refreshed page, demo p-instagram). Mock mode fills it
// from mock/instagram-view.ts; live mode builds it from `posts` on the Instagram channel (lib/instagram-live.ts). Types only.

/** A board member as the page names them. `id` is staff_profiles.user_id in live mode. */
export type IgPerson = { id: string; name: string; initials: string };

/** One Instagram post. */
export type IgPost = {
  id: string;
  title: string;
  /** The day it goes out ("2026-11-11"), or null when no date is set. */
  date: string | null;
  owner: IgPerson | null;
  /** The five steps, in order: caption, photo, board approval, schedule, posted. */
  steps: boolean[];
  caption: string | null;
  /** The words in the photo box ("[Photo]" in the sample; "Photo added" or "No photo yet" live). */
  photo: string;
  /** Sent for board approval and not answered yet. */
  sent: boolean;
  /** "Sent ... 9:14 AM": only when this page sent it just now. */
  sentAt: string | null;
  /** Who approves (the sample names Keith); null live, where it reads "the board". */
  approver: IgPerson | null;
  /** Who is writing the caption (sample only; no column holds it). */
  captionBy: IgPerson | null;
  /** The short name a nudge uses ("interview-week"); the title when unset. */
  slug: string | null;
  /** A line in place of "Not started" ("Starts once the winner is announced"). */
  note: string | null;
};

/**
 * What the page may draw as a working control. Live mode draws only real writes: adding a post and sending it for board
 * approval. Everything else (ticking steps, the caption, owners, nudges, schedule, posted, undo) has no backing write yet.
 */
export type IgCaps = { add: boolean; send: boolean; tick: boolean; caption: boolean; owner: boolean; nudge: boolean; undo: boolean; next: boolean };

/** A mock-only failure for the next write: `failadd` (an add fails), `failsend` (a send fails). */
export type IgMockWrite = 'failadd' | 'failsend' | null;

export type IgView = {
  /** The Eastern calendar day the page is drawn for ("2026-11-10"). */
  today: string;
  /** Posts a month the channel aims for ("4 posts a month" -> 4), or null when not set. */
  target: number | null;
  /** The Instagram channel's id (new posts go on it); null when there is no channel. */
  channelId: string | null;
  posts: IgPost[];
  /** The board, for the owner pickers and the add line's names. */
  staff: IgPerson[];
  /** The signed-in person's user id. */
  me: string | null;
  caps: IgCaps;
  loadFailed: boolean;
  mockWrite: IgMockWrite;
};

export type IgResult = (IgView & { failed: false }) | { failed: true };
