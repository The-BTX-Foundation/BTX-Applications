// PLACEHOLDER SAMPLE DATA -- Interviews preview page ONLY.
//
// Every value in this file is hand-authored, front-end-only sample data,
// same pattern as awardeeWorkflowSampleData.js (a sibling, non-reactive
// module -- not a Pinia store). Nothing on the Interviews page is fetched
// from Supabase -- there is no interview/availability table backing any of
// this yet.

// Your availability grid: three days, each with its own set of 1-hour
// slots and which ones start out selected.
export const AVAILABILITY_DAYS = [
  {
    key: 'thu-sep-17',
    label: 'Thursday, Sep 17',
    slots: [
      { key: '9-10', label: '9-10 AM', selected: false },
      { key: '10-11', label: '10-11 AM', selected: true },
      { key: '1-2', label: '1-2 PM', selected: true },
      { key: '2-3', label: '2-3 PM', selected: false },
    ],
  },
  {
    key: 'fri-sep-19',
    label: 'Friday, Sep 19',
    slots: [
      { key: '9-10', label: '9-10 AM', selected: true },
      { key: '10-11', label: '10-11 AM', selected: false },
      { key: '11-12', label: '11-12 PM', selected: false },
      { key: '2-3', label: '2-3 PM', selected: true },
      { key: '3-4', label: '3-4 PM', selected: false },
    ],
  },
  {
    key: 'mon-sep-22',
    label: 'Monday, Sep 22',
    slots: [
      { key: '9-10', label: '9-10 AM', selected: false },
      { key: '10-11', label: '10-11 AM', selected: false },
      { key: '1-2', label: '1-2 PM', selected: false },
    ],
  },
]

// The three summary tiles above "Upcoming" -- value + tone (drives which
// existing color token the tile's number renders in).
export const SUMMARY_TILES = [
  { key: 'upcoming', label: 'Upcoming', value: 6, tone: 'gold' },
  { key: 'completed', label: 'Completed', value: 18, tone: 'green' },
  { key: 'no-shows', label: 'No-shows', value: 2, tone: 'rust' },
]

// Upcoming interviews, grouped by day header (TODAY · SEP 17, FRIDAY · SEP
// 19, ...) -- each interview's own link label/icon matches its tag
// ('Video' -> Join Google Meet, 'In person' -> Calendar invite).
export const UPCOMING_GROUPS = [
  {
    key: 'today',
    dayLabel: 'Today · Sep 17',
    interviews: [
      {
        id: 'APP-052',
        time: '2:00',
        period: 'PM',
        coInterviewer: 'reviewer',
        tag: 'Video',
        pill: 'Scheduled',
        linkLabel: 'Join Google Meet',
      },
    ],
  },
  {
    key: 'friday',
    dayLabel: 'Friday · Sep 19',
    interviews: [
      {
        id: 'APP-061',
        time: '10:00',
        period: 'AM',
        coInterviewer: 'board',
        tag: 'In person',
        pill: 'Scheduled',
        linkLabel: 'Calendar invite',
      },
      {
        id: 'APP-063',
        time: '11:30',
        period: 'AM',
        coInterviewer: 'board',
        tag: 'In person',
        pill: 'Scheduled',
        linkLabel: 'Calendar invite',
      },
    ],
  },
]

// Recently completed interviews -- flat list (no day grouping), each row
// carries its own date instead of belonging to a day-header group. No
// link line for any of these (interview's already happened).
export const RECENTLY_COMPLETED = [
  { id: 'APP-027', date: 'Sep 12', coInterviewer: 'reviewer', tag: 'Video', pill: 'Completed' },
  { id: 'APP-041', date: 'Sep 12', coInterviewer: 'reviewer', tag: 'Video', pill: 'Completed' },
  { id: 'APP-036', date: 'Sep 10', coInterviewer: 'board', tag: 'In person', pill: 'No-show' },
]
