// The Certifications page's data in the shape the refreshed page draws (Ops Hub refresh, 2026-11-12).
// Reference design: BTX Foundation/apps/design/ops-refresh/directions/p-certifications/index.html (the demo, source of truth
// for look and behaviour) and apps/design/ops-refresh/OPS-DNA.md (the finish rules).
//
// This file is the contract between the page (components/certifications/*) and the loaders (mock/cert-view.ts in mock
// mode, lib/cert-live.ts in live mode, picked by lib/cert-view-loader.ts). Types only, no logic. Dates travel as ISO
// calendar days ("2026-11-19").

/** A board member as the page names them. `id` is staff_profiles.user_id in live mode. */
export type CertPerson = { id: string; name: string; initials: string };

/** A step's owner as the row draws it ("You" when it is the viewer). */
export type CertOwner = { id: string | null; name: string; initials: string; mine: boolean };

/** The task statuses a checklist step can have (declined steps are not on the checklist). */
export type CertStatus = 'open' | 'in_progress' | 'done';

/** One step of the setup checklist (a task on the program's checklist). */
export type CertStep = {
  id: string;
  title: string;
  /** Who owns it, or null (nobody named, or a done step with nobody). */
  owner: CertOwner | null;
  /** True when an open step has nobody: the dashed "No owner" mark. */
  unassigned: boolean;
  /** Due day, or null. */
  due: string | null;
  /** A due line in words instead of a day ("From January"); mock only. */
  dueText: string | null;
  /** True when the step shows no due line at all (the demo's announce step); mock only. */
  noDue: boolean;
  /** The quiet line in the meta ("Teaser Sat Nov 14 · newsletter Fri Nov 27"); live mode: the task's note. */
  sub: string | null;
  /** "7:00 PM": the planning call on the step; mock only (no column). */
  call: string | null;
  /** True for the step that holds the certification ideas ("Pick the first certifications"). */
  ideas: boolean;
  status: CertStatus;
  /** A budget approval task: never ticked here; the row links to /finance/budget/approval instead. */
  approval: boolean;
  /** Order inside the checklist (a new step goes after the last). */
  position: number;
};

/** One certification idea. */
export type CertIdea = {
  id: string;
  name: string;
  /** Who suggested it ("You" for the viewer). */
  by: string;
  decision: 'open' | 'chosen' | 'dropped';
};

/** The plan strip: the pilot budget beside one square per student seat. */
export type CertPlan = {
  /** "$1,500" or "Not set". */
  budget: string;
  /** "Q4 2026", "not approved yet", or null. */
  note: string | null;
  /** How many seats to draw (0 = none). */
  seats: number;
  /** The seats' screen-reader name ("5 seats, none filled yet"). */
  seatsLabel: string;
  /** The second line ("BTX pays exam fees: about $300 each for up to five students"). */
  line: string;
};

/** One Programs chat message. */
export type CertMsg = { id: string; day: string; who: string; initials: string; bot: boolean; mine: boolean; time: string; text: string };

/** The Programs chat beside the checklist. */
export type CertChat = {
  title: string;
  /** How many staff members (the "7 people" line). */
  people: number;
  messages: CertMsg[];
  /** Live mode: the programs area channel's id (null when there is none). */
  channelId: string | null;
  /** True when the chat's read failed: the panel shows its own load error, the rest of the page still shows. */
  failed: boolean;
  /** True when only the newest messages were read (the cap was reached): "Older messages aren't shown here." */
  capped: boolean;
};

/**
 * What each control may do. Mock mode: all true (the page changes its own state, like the demo). Live mode: true only where
 * a real write exists behind the control; a false flag means the control is NOT drawn (no dead controls).
 */
export type CertCaps = {
  /** Tick or untick a step (tasks.status). */
  tick: boolean;
  /** "Add a task" (tasks insert, plus the checklist when the program has none). */
  addTask: boolean;
  /** Day words and first names in "Add a task" set the due date and owner (no live write takes them yet). */
  parse: boolean;
  /** "Add an idea" (certification_ideas insert). */
  addIdea: boolean;
  /** Choose, Drop and "Not decided" on an idea (no live write yet). */
  decide: boolean;
  /** Undo after a tick, an idea decision or an add (no live reverse write yet). */
  undo: boolean;
  /** The N key opens "Add a task". */
  nKey: boolean;
  /** The Programs chat composer (chat_messages insert). */
  chat: boolean;
};

/** Everything the Certifications page draws. */
export type CertView = {
  /** Eastern calendar day the data was built for ("2026-11-10"). */
  today: string;
  /** The viewer's staff id. */
  me: string;
  /** Live mode: the programs row id (needed to add an idea or a checklist). */
  programId: string | null;
  /** Live mode: the setup checklist's id (null when the program has none yet). */
  checklistId: string | null;
  /** The program's status beside the title ("In setup"). */
  status: string;
  plan: CertPlan;
  steps: CertStep[];
  ideas: CertIdea[];
  /** The board members the add parser knows by first name (mock only uses them). */
  people: CertPerson[];
  chat: CertChat;
  /** True when the page's core data could not be read: the header and the checklist's "didn't load" card only. */
  loadFailed: boolean;
  /** Live mode: there is no certification program row (a retry cannot fix it, so the card says so plainly). */
  noProgram?: boolean;
  caps: CertCaps;
};

/** What the loader returns: the view, or a whole-page failure (the shared LoadError card, `?demo=failed`). */
export type CertResult = (CertView & { failed: false }) | { failed: true };
