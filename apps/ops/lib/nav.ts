// The Ops Hub's navigation: every route in the sidebar, the phone tabs and the phone menu. A route with no page built
// yet still exists here and renders the "Not built yet" page (see app/(shell)/[...slug]/page.tsx).
import type { OpsIconName } from '@/components/icons';

export type NavLeaf = { id: string; label: string; href: string };
export type NavGroup = { id: string; label: string; icon: OpsIconName; items: NavLeaf[] };

/** The five daily destinations at the top of the sidebar (and the phone tabs). */
export const TOP: (NavLeaf & { icon: OpsIconName })[] = [
  { id: 'today', label: 'Today', href: '/', icon: 'today' },
  { id: 'tasks', label: 'Tasks', href: '/tasks', icon: 'tasks' },
  { id: 'calendar', label: 'Calendar', href: '/calendar', icon: 'calendar' },
  { id: 'goals', label: 'Goals', href: '/goals', icon: 'goals' },
  { id: 'chat', label: 'Board chat', href: '/chat', icon: 'chat' },
];

/** The four folding areas. */
export const GROUPS: NavGroup[] = [
  {
    id: 'scholarships',
    label: 'Scholarships',
    icon: 'scholarships',
    items: [
      { id: 'cycle', label: 'Fall 2026 cycle', href: '/scholarships/cycle' },
      { id: 'applicants', label: 'Applicants', href: '/scholarships/applicants' },
      { id: 'interviews', label: 'Interviews', href: '/scholarships/interviews' },
      { id: 'scoring', label: 'Scoring', href: '/scholarships/scoring' },
      { id: 'selection', label: 'Selection', href: '/scholarships/selection' },
      { id: 'awardees', label: 'Awardees', href: '/scholarships/awardees' },
    ],
  },
  {
    id: 'money',
    label: 'Money',
    icon: 'money',
    items: [
      { id: 'budget', label: 'Budget', href: '/money/budget' },
      { id: 'fundraising', label: 'Fundraising', href: '/money/fundraising' },
      { id: 'grants', label: 'Grants', href: '/money/grants' },
    ],
  },
  {
    id: 'programs',
    label: 'Programs',
    icon: 'programs',
    items: [
      { id: 'certifications', label: 'Certifications', href: '/programs/certifications' },
      { id: 'sponsorships', label: 'Sponsorships', href: '/programs/sponsorships' },
      { id: 'mentorship', label: 'Mentorship', href: '/programs/mentorship' },
    ],
  },
  {
    id: 'outreach',
    label: 'Outreach',
    icon: 'outreach',
    items: [
      { id: 'plan', label: 'Plan', href: '/outreach/plan' },
      { id: 'instagram', label: 'Instagram', href: '/outreach/instagram' },
      { id: 'newsletter', label: 'Newsletter', href: '/outreach/newsletter' },
    ],
  },
];

/** The admin entry under the folding areas. */
export const PEOPLE: NavLeaf = { id: 'people', label: 'People and roles', href: '/people' };

/** Every route the sidebar knows, with its page title, for the "Not built yet" page and the page titles. */
export const ALL_ROUTES: NavLeaf[] = [...TOP, ...GROUPS.flatMap((g) => g.items), PEOPLE];

// Finds the nav entry for a path ("/scholarships/applicants/APP-1" matches the applicants entry), or undefined.
export function routeFor(pathname: string): NavLeaf | undefined {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return ALL_ROUTES.find((r) => (r.href === '/' ? clean === '/' : clean === r.href || clean.startsWith(`${r.href}/`)));
}
