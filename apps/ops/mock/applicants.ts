// MOCK: the 18 sample applicants of the Fall 2026 cycle (the Figma "Applicants" frames' codes and initials). Real
// applicants come from the `applications` table; this list is used only when the app runs without Supabase env vars.
// The names are made up, not real people. Board members and admins see applicants' names (no blind review, D2).
export type MockApplicant = {
  code: string;
  initials: string;
  /** Made-up full name (board members and admins see names, D2). */
  name: string;
  /** Submitted date and the interview start, as Eastern-time ISO strings. */
  appliedAt: string;
  interviewAt: string | null;
};

export const MOCK_CYCLE_LABEL = 'Fall 2026 cycle';

/** Today in the sample data (the frames are drawn on Sunday, October 4). */
export const MOCK_NOW = '2026-10-04T12:00:00-04:00';

export const MOCK_APPLICANTS: MockApplicant[] = [
  { code: 'APP-2026-00011', initials: 'A.O.', name: 'Ada Okafor', appliedAt: '2026-09-02T12:00:00-04:00', interviewAt: '2026-09-26T10:00:00-04:00' },
  { code: 'APP-2026-00012', initials: 'T.W.', name: 'Tariq Wells', appliedAt: '2026-09-04T12:00:00-04:00', interviewAt: '2026-09-23T10:00:00-04:00' },
  { code: 'APP-2026-00013', initials: 'L.M.', name: 'Lena Mensah', appliedAt: '2026-09-13T12:00:00-04:00', interviewAt: '2026-10-03T10:00:00-04:00' },
  { code: 'APP-2026-00004', initials: 'N.B.', name: 'Naomi Brooks', appliedAt: '2026-08-31T12:00:00-04:00', interviewAt: '2026-09-24T10:00:00-04:00' },
  { code: 'APP-2026-00015', initials: 'S.P.', name: 'Sade Price', appliedAt: '2026-09-12T12:00:00-04:00', interviewAt: '2026-10-05T10:00:00-04:00' },
  { code: 'APP-2026-00016', initials: 'E.C.', name: 'Elijah Carter', appliedAt: '2026-09-12T12:00:00-04:00', interviewAt: '2026-10-06T18:00:00-04:00' },
  { code: 'APP-2026-00017', initials: 'F.N.', name: 'Folake Nwosu', appliedAt: '2026-09-13T12:00:00-04:00', interviewAt: '2026-10-07T12:00:00-04:00' },
  { code: 'APP-2026-00018', initials: 'B.R.', name: 'Brianna Reid', appliedAt: '2026-09-14T12:00:00-04:00', interviewAt: '2026-10-08T19:00:00-04:00' },
  { code: 'APP-2026-00003', initials: 'J.T.', name: 'Jalen Thomas', appliedAt: '2026-08-18T12:00:00-04:00', interviewAt: '2026-09-16T10:00:00-04:00' },
  { code: 'APP-2026-00014', initials: 'R.S.', name: 'Renee Simmons', appliedAt: '2026-08-21T12:00:00-04:00', interviewAt: '2026-09-18T10:00:00-04:00' },
  { code: 'APP-2026-00002', initials: 'D.A.', name: 'Daniel Asante', appliedAt: '2026-08-25T12:00:00-04:00', interviewAt: '2026-09-20T10:00:00-04:00' },
  { code: 'APP-2026-00009', initials: 'M.K.', name: 'Maya King', appliedAt: '2026-08-20T12:00:00-04:00', interviewAt: '2026-09-17T10:00:00-04:00' },
  { code: 'APP-2026-00001', initials: 'G.H.', name: 'Gabriel Hayes', appliedAt: '2026-08-17T12:00:00-04:00', interviewAt: '2026-09-15T10:00:00-04:00' },
  { code: 'APP-2026-00005', initials: 'P.Z.', name: 'Priya Zaman', appliedAt: '2026-08-19T12:00:00-04:00', interviewAt: '2026-09-14T10:00:00-04:00' },
  { code: 'APP-2026-00006', initials: 'O.D.', name: 'Omar Diallo', appliedAt: '2026-08-22T12:00:00-04:00', interviewAt: '2026-09-19T10:00:00-04:00' },
  { code: 'APP-2026-00007', initials: 'W.K.', name: 'Whitney Kamara', appliedAt: '2026-08-24T12:00:00-04:00', interviewAt: '2026-09-21T10:00:00-04:00' },
  { code: 'APP-2026-00008', initials: 'V.S.', name: 'Victor Sesay', appliedAt: '2026-08-26T12:00:00-04:00', interviewAt: '2026-09-22T10:00:00-04:00' },
  { code: 'APP-2026-00010', initials: 'Y.B.', name: 'Yasmin Bello', appliedAt: '2026-08-27T12:00:00-04:00', interviewAt: '2026-09-25T10:00:00-04:00' },
];
