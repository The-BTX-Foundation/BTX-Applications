// Plain-English screen names for the Rayken Review feedback widget (Preview deployments only).
// A pure mapping from a pathname to a screen name and a route key. It never reads names, emails, ids or codes.
export type ReviewScreen = { screen: string; routeKey: string };

const SCREENS: Record<string, string> = {
  '/': 'Landing page',
  '/sign-in': 'Sign in',
  '/sign-out': 'Signed out',
  '/apply/start': 'Application start',
  '/apply/scholarship': 'Application: the scholarship',
  '/apply/basic-info': 'Application: basic info',
  '/apply/documents': 'Application: documents',
  '/apply/essay': 'Application: essay',
  '/apply/short-answers': 'Application: short answers',
  '/apply/review': 'Application: review and submit',
  '/status': 'Application status',
  '/status/schedule': 'Pick interview time',
  '/status/change': 'Change interview time',
  '/status/no-time': 'No time works',
  '/status/story': 'Award story',
};

/** Maps a pathname to the screen name and route key. Unknown paths keep their static shape and are called "Other page". */
export function reviewScreen(pathname: string): ReviewScreen {
  const clean = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname || '/';
  return { screen: SCREENS[clean] ?? 'Other page', routeKey: SCREENS[clean] ? clean : '/[other]' };
}
