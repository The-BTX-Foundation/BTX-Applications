// The shape the refreshed Interviews page draws (route /scholarships/interviews, demo p-interviews). Types only: the mock
// sample is in mock/interviews-view.ts, the live mapping in lib/interviews-map.ts, the loader in lib/interviews-view-loader.ts.
// Days are Eastern calendar days as "YYYY-MM-DD" strings (never parsed as UTC instants); times of day are minutes after
// midnight Eastern (18:30 = 1110).

/** One board member on a booked interview (the two interviewers). */
export type IzInterviewer = { id: string; name: string; initials: string };

/** One proposed interview time. `booking` is the id of the booked interview that holds it (null when open). */
export type IzTime = {
  id: string;
  day: string;
  minute: number;
  /** Board members free for the whole time. */
  free: number;
  /** Offered to students in the Portal. */
  opened: boolean;
  booking: string | null;
  /** The student's name when a student holds the time but the booking is not in the list (a past interview). */
  heldBy: string | null;
};

/** One booked interview ahead. */
export type IzBooking = {
  /** The interview time's id (the slot). */
  id: string;
  /** The Eastern day; null only when the time could not be matched (then `whenText` is drawn instead). */
  day: string | null;
  minute: number;
  /** "Thu Nov 12, 7:00 PM" from the server, used when `day` is null. */
  whenText: string;
  name: string;
  code: string;
  /** The two interviewers; empty when nobody is paired yet. */
  pair: IzInterviewer[];
  /** The Teams link, or null. Live, a board member without admin rights gets only their own interviews' links. */
  link: string | null;
  /** Live only: the interview has a link this viewer may not see (another pair's interview); drawn as "has a link". */
  linkHidden?: boolean;
  /** An interviewer's free hours no longer cover the time and nobody took it over yet: drawn "Needs cover". */
  needsCover?: boolean;
};

/** An applicant who submitted and has not booked a time (admins see the list). */
export type IzWaiting = {
  /** The application's id (what Remind sends to). */
  id: string;
  name: string;
  code: string;
  /** When the booking email or a reminder last went (an instant), or null. */
  emailed: string | null;
  /** A reminder already went today (Eastern): Remind waits until tomorrow. */
  remindedToday: boolean;
};

/** One board member on the Board panel. */
export type IzPerson = {
  id: string;
  name: string;
  initials: string;
  /** Free hours sent for the interview dates. */
  hours: number;
  /** Their own limit on interviews, or null. */
  most: number | null;
  /** They sent their free hours. */
  sent: boolean;
  /** Mock only: sent this week only (the demo's "Next week missing"). */
  weekOnly: boolean;
  /** Interviews they hold this cycle. */
  interviews: number;
};

/**
 * What the page may offer. Live, each true cap calls an existing server action in lib/actions/interviews.ts exactly as the
 * old page did; a cap with no existing action is false live and drawn only in mock mode (the demo's story).
 */
export type IzCaps = {
  /** "Make Teams links": previewTeamsLinksAction, then makeTeamsLinksAction (Teams meetings from meetings@ + emails). */
  makeLinks: boolean;
  /** Paste or change one interview's Teams link: saveVideoLinks (emails the student and both interviewers). */
  pasteLink: boolean;
  /** "Rebuild from availability": rebuildTimes. */
  rebuild: boolean;
  /** Add a time on a day: addProposedTime. */
  addTime: boolean;
  /** Remove an open time: removeProposedTime. */
  removeTime: boolean;
  /** Undo after adding or removing a time (mock only: no undo action exists). */
  undoTime: boolean;
  /** Open the times and email applicants: sendTimes. */
  sendTimes: boolean;
  /** Email board members who have not sent free hours: remindBoard. */
  remindBoard: boolean;
  /** "Remind" one student who has not booked, or all of them: remindStudentsAction (at most once a day each). */
  remindStudents: boolean;
  /** The names of students who have not booked (admins). */
  seeWho: boolean;
  /** "Nudge Miles" in Board chat (mock only: no existing action on this page). */
  nudge: boolean;
  /** Rebalance: previewRebalanceAction, then rebalanceAction (emails the people affected). */
  rebalance: boolean;
  /** Re-run pairing: previewPairing, then rerunPairing. */
  pairing: boolean;
};

/** Everything the page draws. */
export type InterviewsView = {
  source: 'mock' | 'live';
  /** The whole page failed (the plain "didn't load" card). */
  failed: boolean;
  /** Mock only (?demo=error): the demo's load-error state, the header and one error line with Try again. */
  loadError: boolean;
  /** Today's Eastern day. */
  today: string;
  /** The interview dates (first and last day), or null when the cycle has none. */
  first: string | null;
  last: string | null;
  /** The signed-in person's id. */
  me: string | null;
  isAdmin: boolean;
  cycleId: string | null;
  times: IzTime[];
  bookings: IzBooking[];
  people: IzPerson[];
  /** Applicants who submitted (the ones who book a time). */
  applicants: number;
  /** Applicants with a booking (past ones included). */
  booked: number;
  /** "Sent to all 21 today, 8:01 AM", "Times opened Mon Nov 9, 9:02 AM" or "Not sent yet". */
  sentLine: string;
  /** The even share of interviews each, or 0 when nobody is booked yet. */
  target: number;
  /** Who has not booked, by name (admins; null when not read). */
  unbooked: IzWaiting[] | null;
  /** Mock only: the day booking is due ("Due Thu"). */
  dueDay: string | null;
  caps: IzCaps;
};
