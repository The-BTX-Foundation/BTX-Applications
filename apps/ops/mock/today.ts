// MOCK: everything on the Today page. The Ops Hub tables (tasks, approvals, goals, chat) do not exist yet, so this is the
// Figma "Today" frames' sample data (a Sunday in October). When the tables arrive, replace these exports with loaders
// that return the same shapes and the page does not change.
import type { OpsIconName } from '@/components/icons';

export type OverviewArea = {
  id: string;
  name: string;
  /** Ring: how far along, 0 to 1, and its label ("5/13"). */
  ring: { frac: number; label: string; color: 'gold' | 'ink' };
  /** The phone card's ring counts differently (1/6, 65%). */
  big: string;
  label: string;
  /** The muted line; laptop and phone differ a little ("$9,800 of $15,000 raised"). */
  line: string;
  /** "3 for you" or null for the quiet "Nothing for you". */
  forYou: string | null;
  href: string;
};

export type TaskRow = {
  id: string;
  title: string;
  /** The title on a phone, where it is shorter. */
  phoneTitle?: string;
  /** Plain circle, or the task type's icon, in the first column. */
  lead: 'circle' | 'icon';
  typeIcon: OpsIconName;
  typeLabel: string;
  sub: string;
  /** Comment count shown in the sub line (laptop) instead of the comments column. */
  commentsInSub?: number;
  /** A third piece after the sub line ("Thu Dec 31" in the stress frame). */
  sub2?: string;
  comments?: number;
  area: string;
  due: string;
  rel?: { text: string; late?: boolean };
  action?: { label: string; kind: 'p' | 's' };
  phoneSub: string;
  phoneDue: string;
  phoneLate?: boolean;
  phoneActions?: { label: string; kind: 'p' | 's' }[];
  approval?: boolean;
};

export type TaskGroup = { label: string; rows: TaskRow[] };

export type TodayData = {
  headline: string;
  dateLine: string;
  counts: { mine: number; team: number; approvals: number };
  areas: OverviewArea[];
  groups: TaskGroup[];
};

export const TODAY: TodayData = {
  headline: 'Video links are 2 days late, Dania.',
  dateLine: 'Sunday, October 4',
  counts: { mine: 6, team: 7, approvals: 1 },
  areas: [
    {
      id: 'scholarships',
      name: 'Scholarships',
      ring: { frac: 5 / 13, label: '5/13', color: 'gold' },
      big: '10 / 18',
      label: 'scored',
      line: 'Interviews end Fri Oct 9',
      forYou: '3 for you',
      href: '/scholarships/cycle',
    },
    {
      id: 'money',
      name: 'Money',
      ring: { frac: 0.5, label: '2/4', color: 'gold' },
      big: '$18,600',
      label: 'on hand',
      line: '$9,800 of $15,000 raised',
      forYou: '2 for you',
      href: '/money/budget',
    },
    {
      id: 'programs',
      name: 'Programs',
      ring: { frac: 0.2, label: '1/5', color: 'ink' },
      big: 'Certifications',
      label: 'in setup',
      line: 'Planning call Thu Oct 22',
      forYou: null,
      href: '/programs/certifications',
    },
    {
      id: 'outreach',
      name: 'Outreach',
      ring: { frac: 0, label: '0/3', color: 'ink' },
      big: '3 posts',
      label: 'planned in October',
      line: 'Next post Wed Oct 7',
      forYou: '1 for you',
      href: '/outreach/plan',
    },
  ],
  groups: [
    {
      label: 'Late',
      rows: [
        {
          id: 't1',
          title: 'Send interview video links',
          lead: 'circle',
          typeIcon: 'tasks',
          typeLabel: 'Task',
          sub: 'Fall 2026 cycle',
          comments: 2,
          area: 'Scholarships',
          due: 'Fri Oct 2',
          rel: { text: '2 days late', late: true },
          action: { label: 'Add links', kind: 'p' },
          phoneSub: 'Scholarships',
          phoneDue: '2 days late',
          phoneLate: true,
          phoneActions: [
            { label: 'Add links', kind: 'p' },
            { label: 'Open', kind: 's' },
          ],
        },
      ],
    },
    {
      label: 'This week',
      rows: [
        {
          id: 't2',
          title: 'Give interview availability, Oct 5-9',
          phoneTitle: 'Give interview availability',
          lead: 'icon',
          typeIcon: 'calendar',
          typeLabel: 'Request',
          sub: 'Fall 2026 cycle',
          area: 'Scholarships',
          due: 'Mon Oct 5',
          rel: { text: 'Tomorrow' },
          action: { label: 'Add times', kind: 's' },
          phoneSub: 'Scholarships · request',
          phoneDue: 'Tomorrow',
        },
        {
          id: 't3',
          title: 'Approve Q4 budget',
          lead: 'icon',
          typeIcon: 'approval',
          typeLabel: 'Approval',
          sub: 'Q4 budget',
          commentsInSub: 1,
          area: 'Money',
          due: 'Tue Oct 6',
          action: { label: 'Approve $4,830 for Q4', kind: 's' },
          phoneSub: 'Money · approval',
          phoneDue: 'Tue',
          approval: true,
        },
        {
          id: 't4',
          title: 'Instagram post: Meet the board',
          lead: 'circle',
          typeIcon: 'outreach',
          typeLabel: 'Post',
          sub: 'Instagram',
          area: 'Outreach',
          due: 'Wed Oct 7',
          phoneSub: 'Outreach',
          phoneDue: 'Wed',
        },
        {
          id: 't5',
          title: 'Send Q3 donor thank-yous',
          lead: 'circle',
          typeIcon: 'tasks',
          typeLabel: 'Task',
          sub: 'Fundraising',
          area: 'Money',
          due: 'Fri Oct 9',
          phoneSub: 'Money',
          phoneDue: 'Fri',
        },
      ],
    },
    {
      label: 'Next week',
      rows: [
        {
          id: 't6',
          title: 'Score 3 applicants',
          lead: 'icon',
          typeIcon: 'scoring',
          typeLabel: 'Scoring',
          sub: '1 of 3 started',
          area: 'Scholarships',
          due: 'Sun Oct 11',
          action: { label: 'Score', kind: 's' },
          phoneSub: 'Scholarships · scoring',
          phoneDue: 'Sun',
        },
      ],
    },
  ],
};

// ?demo=stress: the Figma "Today, stress" frames (laptop 69:5955, phone 69:6278): a long late-task title, 120 team tasks,
// 120 applicants to score, $190,000 on hand and dates that have already passed.
export const TODAY_STRESS: TodayData = {
  headline: 'The Legacy Scholarship announcement is 12 days late, Dania.',
  dateLine: 'Sunday, October 4',
  counts: { mine: 6, team: 120, approvals: 1 },
  areas: [
    {
      id: 'scholarships',
      name: 'Scholarships',
      ring: { frac: 1 / 6, label: '1/6', color: 'gold' },
      big: '10 / 120',
      label: 'scored',
      line: 'Interviews end Fri Oct 9',
      forYou: '120 for you',
      href: '/scholarships/cycle',
    },
    {
      id: 'money',
      name: 'Money',
      ring: { frac: 0.65, label: '65%', color: 'gold' },
      big: '$190,000',
      label: 'on hand',
      line: '$9,800 of $15,000 raised',
      forYou: '2 for you',
      href: '/money/budget',
    },
    {
      id: 'programs',
      name: 'Programs',
      ring: { frac: 0.2, label: '1/5', color: 'ink' },
      big: 'Certifications',
      label: 'in setup',
      line: 'Planning call Thu Oct 22',
      forYou: null,
      href: '/programs/certifications',
    },
    {
      id: 'outreach',
      name: 'Outreach',
      ring: { frac: 0, label: '0/3', color: 'ink' },
      big: '0 posts',
      label: 'planned in October',
      line: 'Next post Wed Sep 30',
      forYou: '1 for you',
      href: '/outreach/plan',
    },
  ],
  groups: [
    {
      label: 'Late',
      rows: [
        {
          id: 's1',
          title: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour',
          lead: 'circle',
          typeIcon: 'tasks',
          typeLabel: 'Task',
          sub: 'Fall 2026 cycle',
          comments: 2,
          area: 'Scholarships',
          due: 'Tue Sep 22',
          rel: { text: '12 days late', late: true },
          action: { label: 'Mark done', kind: 'p' },
          phoneSub: 'Scholarships',
          phoneDue: '12 days late',
          phoneLate: true,
          phoneActions: [
            { label: 'Mark done', kind: 'p' },
            { label: 'Open', kind: 's' },
          ],
        },
      ],
    },
    {
      label: 'This week',
      rows: [
        {
          id: 's2',
          title: 'Give interview availability, Oct 5-9',
          phoneTitle: 'Give interview availability',
          lead: 'icon',
          typeIcon: 'calendar',
          typeLabel: 'Request',
          sub: 'Fall 2026 cycle',
          area: 'Scholarships',
          due: 'Mon Oct 5',
          rel: { text: 'Tomorrow' },
          action: { label: 'Add times', kind: 's' },
          phoneSub: 'Scholarships · request',
          phoneDue: 'Tomorrow',
        },
        {
          id: 's3',
          title: 'Approve Q4 budget',
          lead: 'icon',
          typeIcon: 'approval',
          typeLabel: 'Approval',
          sub: 'Q4 budget',
          commentsInSub: 1,
          area: 'Money',
          due: 'Tue Oct 6',
          action: { label: 'Approve $4,580 for Q4', kind: 's' },
          phoneSub: 'Money · approval',
          phoneDue: 'Tue',
          approval: true,
        },
        {
          id: 's4',
          title: 'Instagram post: Meet the board',
          lead: 'circle',
          typeIcon: 'outreach',
          typeLabel: 'Post',
          sub: 'Unassigned',
          area: 'Outreach',
          due: 'Wed Sep 30',
          phoneSub: 'Unassigned',
          phoneDue: 'Wed',
        },
        {
          id: 's5',
          title: 'Send Q3 donor thank-yous',
          lead: 'circle',
          typeIcon: 'tasks',
          typeLabel: 'Task',
          sub: 'Fundraising',
          sub2: 'Thu Dec 31',
          area: 'Money',
          due: 'Thu Dec 31',
          phoneSub: 'Fundraising',
          phoneDue: 'Thu',
        },
      ],
    },
    {
      label: 'Next week',
      rows: [
        {
          id: 's6',
          title: 'Score 3 applicants',
          lead: 'icon',
          typeIcon: 'scoring',
          typeLabel: 'Scoring',
          sub: '1 of 3 started',
          area: 'Scholarships',
          due: 'Sun Oct 11',
          action: { label: 'Score', kind: 's' },
          phoneSub: 'Scholarships · scoring',
          phoneDue: 'Sun',
        },
      ],
    },
  ],
};
