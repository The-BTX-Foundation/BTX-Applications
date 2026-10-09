import type { Metadata, Viewport } from 'next';
import '@btx/ui/tokens.css';
import '@btx/ui/components.css';
import { googleSansCode, googleSansFlex } from './fonts';

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

// The root layout: loads the fonts and the shared styles. Each page draws its own top bar, because the bar's
// variant (signed out, sign-in, signed in) and the wizard's progress change from screen to screen.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${googleSansFlex.variable} ${googleSansCode.variable}`}>
      <body>{children}</body>
    </html>
  );
}
