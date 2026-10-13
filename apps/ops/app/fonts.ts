// The two fonts (Dominick, 2026-10-08): Google Sans Flex for all text, Google Sans Code for the small capital
// labels and dates. Both are SIL Open Font License.
//  - Flex is self-hosted from packages/ui/fonts (a Latin subset of the variable font, with every axis kept, so the
//    browser's automatic optical sizing works).
//  - Code comes from next/font/google, which downloads it at build time and serves it from the app's own domain.
import localFont from 'next/font/local';
import { Google_Sans_Code } from 'next/font/google';

export const googleSansFlex = localFont({
  src: '../../../packages/ui/fonts/GoogleSansFlex-Variable.woff2',
  variable: '--font-gsf',
  weight: '1 1000',
  display: 'swap',
});

export const googleSansCode = Google_Sans_Code({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-gsc',
  display: 'swap',
});
