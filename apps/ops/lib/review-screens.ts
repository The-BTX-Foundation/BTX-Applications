// Plain-English screen names for the Rayken Review feedback widget (Preview deployments only).
// A pure mapping from a pathname to a screen name and a route key. Dynamic segments (an applicant code) are
// generalized and never leave this function.
export type ReviewScreen = { screen: string; routeKey: string };

const SCREENS: Record<string, string> = {
  '/': 'Today',
  '/sign-in': 'Sign in',
  '/tasks': 'Tasks',
  '/calendar': 'Calendar',
  '/goals': 'Goals',
  '/chat': 'Board chat',
  '/people': 'People',
  '/scholarships/cycle': 'Cycle',
  '/scholarships/cycle/settings': 'Cycle settings',
  '/scholarships/applicants': 'Applicants',
  '/scholarships/interviews': 'Interviews',
  '/scholarships/interviews/availability': 'Interview availability',
  '/scholarships/interviews/questions': 'Interview questions',
  '/scholarships/scoring': 'Scoring',
  '/scholarships/selection': 'Selection',
  '/scholarships/awardees': 'Awardees',
  '/finance/budget': 'Budget',
  '/finance/budget/approval': 'Budget approval',
  '/finance/fundraising': 'Fundraising',
  '/finance/grants': 'Grants',
  '/programs/certifications': 'Certifications',
  '/programs/sponsorships': 'Sponsorships',
  '/programs/mentorship': 'Mentorship',
  '/outreach/plan': 'Outreach plan',
  '/outreach/instagram': 'Instagram',
  '/outreach/newsletter': 'Newsletter',
};

/** Maps a pathname to the screen name and route key. */
export function reviewScreen(pathname: string): ReviewScreen {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname || '/';
  if (SCREENS[clean]) return { screen: SCREENS[clean], routeKey: clean };
  if (/^\/scholarships\/applicants\/[^/]+$/.test(clean)) {
    return { screen: 'Applicant detail', routeKey: '/scholarships/applicants/[code]' };
  }
  if (/^\/scholarships\/applicants\/[^/]+\/file\/[^/]+$/.test(clean)) {
    return { screen: 'Applicant file', routeKey: '/scholarships/applicants/[code]/file/[kind]' };
  }
  return { screen: 'Other page', routeKey: '/[other]' };
}
