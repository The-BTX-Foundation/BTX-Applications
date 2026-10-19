import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import '@btx/ui/tokens.css';
import '@btx/ui/components.css';
import { googleSansCode, googleSansFlex } from './fonts';
import RaykenReview from './RaykenReview';
import Analytics from './Analytics';
import { ReviewContext } from '@/components/review-context';
import { nonceFromPolicy } from '@/lib/csp';

export const metadata: Metadata = {
  title: {
    default: 'The Legacy Scholarship | The BTX Foundation',
    template: '%s | The BTX Foundation',
  },
  description: 'Apply for the BTX Foundation scholarship for Clark School engineering undergraduates.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
};

// The root layout: loads the fonts, the shared styles and analytics (app/Analytics.tsx). Each page draws its own top bar, because the bar's
// variant (signed out, sign-in, signed in) and the wizard's progress change from screen to screen.
// It reads this request's script nonce from the policy proxy.ts put on the request (lib/csp.ts; the request header is
// named content-security-policy, see proxy.ts), the same header and the same rule Next.js uses, so the review loader always carries the nonce Next stamps on its own scripts. Reading a request
// header makes every page render per request, which a nonce needs: a page built ahead of time can't carry a fresh one.
export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const nonce = nonceFromPolicy((await headers()).get('content-security-policy'));
  return (
    <html lang="en" className={`${googleSansFlex.variable} ${googleSansCode.variable}`}>
      <head>
        <RaykenReview nonce={nonce} />
      </head>
      <body>
        <Analytics />
        <ReviewContext />
        <a href="#main" className="skip">
          Skip to main content
        </a>
        {children}
      </body>
    </html>
  );
}
