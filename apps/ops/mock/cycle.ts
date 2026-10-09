// MOCK: the parts of the Fall 2026 cycle page that the schema cannot supply yet: the checklist, the three schedule dates
// the `cycles` table has no column for (scores due, selection meeting, funds sent), and the Scholarships chat. The cycle's
// own dates (applications open and close, interviews, award date) are REAL in live mode (lib/cycle.ts); in mock mode
// they come from here too. Sample values are the Figma frames' (a Sunday, October 4).
import type { OpsIconName } from '@/components/icons';

export const MOCK_CYCLE = {
  title: 'Fall 2026 cycle',
  awardName: 'Legacy Scholarship',
  status: 'open',
  applicants: 18,
  applicationsOpen: '2026-08-17',
  applicationsClose: '2026-09-14',
  interviewStart: '2026-09-15',
  interviewEnd: '2026-10-09',
  decisionDate: '2026-10-23',
};

/** Schedule dates with no column in `cycles`: always mock until the Ops Hub schema has them. */
export const MOCK_SCHEDULE = { scoresDue: '2026-10-11', selectionMeeting: '2026-10-16', fundsSent: '2026-11-06' };

export type Owner = { kind: 'bot' | 'person' | 'group'; label: string; initials?: string };

export type ChecklistRow = {
  id: string;
  title: string;
  icon: OpsIconName;
  kind: string;
  sub: string;
  state: 'done' | 'late' | 'open';
  owner: Owner;
  due?: string;
  rel?: { text: string; late?: boolean };
  status?: string;
  action?: { label: string; kind: 'p' | 's' };
};

export type ChecklistGroup = {
  id: string;
  label: string;
  /** "3 steps done": the group folds away behind this line. */
  fold?: { note: string; steps: string[] };
  now?: boolean;
  rows: ChecklistRow[];
};

export const MOCK_CHECKLIST = {
  done: 5,
  total: 13,
  nowLabel: 'Interviews',
  groups: [
    { id: 'applications', label: 'Applications', fold: { note: '3 steps done', steps: ['Publish the cycle', 'Open applications', 'Close applications'] }, rows: [] },
    {
      id: 'interviews',
      label: 'Interviews',
      now: true,
      rows: [
        { id: 'c1', title: 'Collect board availability', icon: 'tasks', kind: 'Task', sub: 'Interviews', state: 'done', owner: { kind: 'bot', label: 'BTX' }, due: 'Mon Sep 14', status: 'Done' },
        { id: 'c2', title: 'Pair two board members per applicant', icon: 'tasks', kind: 'Task', sub: 'Interviews', state: 'done', owner: { kind: 'bot', label: 'BTX' }, due: 'Mon Sep 14', status: 'Done' },
        {
          id: 'c3',
          title: 'Send interview video links',
          icon: 'tasks',
          kind: 'Task',
          sub: 'Interviews',
          state: 'late',
          owner: { kind: 'person', label: 'Dania Morris', initials: 'DM' },
          due: 'Fri Oct 2',
          rel: { text: '2 days late', late: true },
          action: { label: 'Add links', kind: 'p' },
        },
        {
          id: 'c4',
          title: 'Give interview availability, Oct 5-9',
          icon: 'calendar',
          kind: 'Request',
          sub: 'Interviews',
          state: 'open',
          owner: { kind: 'person', label: 'Dania Morris', initials: 'DM' },
          due: 'Mon Oct 5',
          rel: { text: 'Tomorrow' },
          action: { label: 'Add times', kind: 's' },
        },
        { id: 'c5', title: 'Finish interviews, 14 of 18', icon: 'tasks', kind: 'Task', sub: 'Interviews', state: 'open', owner: { kind: 'group', label: '4 pairs' } },
      ],
    },
    {
      id: 'scoring',
      label: 'Scoring',
      rows: [
        {
          id: 'c6',
          title: 'Score every interview, 10 of 18 done',
          icon: 'scoring',
          kind: 'Scoring',
          sub: 'Fall 2026 cycle',
          state: 'open',
          owner: { kind: 'group', label: 'All board members' },
          action: { label: 'Score 3', kind: 's' },
        },
      ],
    },
    {
      id: 'selection',
      label: 'Selection',
      rows: [{ id: 'c7', title: 'Selection meeting', icon: 'meeting', kind: 'Meeting', sub: 'Selection', state: 'open', owner: { kind: 'group', label: 'Board' } }],
    },
    { id: 'award', label: 'Award', fold: { note: '3 steps', steps: ['Announce the award', 'Collect the photo and story', 'Send the funds'] }, rows: [] },
  ] as ChecklistGroup[],
};

export type ChatMsg = { id: string; day: 'Yesterday' | 'Today'; who: string; initials?: string; bot?: boolean; mine?: boolean; time: string; text: string };

export const MOCK_CHAT: { title: string; people: number; messages: ChatMsg[] } = {
  title: 'Scholarships chat',
  people: 7,
  messages: [
    { id: 'm1', day: 'Yesterday', who: 'BTX', bot: true, time: '6:00 PM', text: 'Interview done: APP-2026-00013 L.M., with Dania Morris and Chariah Ghee.' },
    { id: 'm2', day: 'Yesterday', who: 'Kelsey Davis', initials: 'KD', time: '7:40 PM', text: 'Tomi and I have 00015 tomorrow at 10.' },
    { id: 'm3', day: 'Today', who: 'You', mine: true, time: '8:14 AM', text: 'I’ll send the video links for this week’s interviews today.' },
    { id: 'm4', day: 'Today', who: 'BTX', bot: true, time: '9:00 AM', text: 'Score published: APP-2026-00012, by Chariah Ghee.' },
    { id: 'm5', day: 'Today', who: 'Marcus Davis', initials: 'MD', time: '9:12 AM', text: 'Publishing my score for APP-2026-00004 tonight.' },
  ],
};
