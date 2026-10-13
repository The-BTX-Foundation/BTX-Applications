import type { Metadata, Viewport } from 'next';
import '@btx/ui/tokens.css';
import '@btx/ui/components.css';
import './ops.css';
import { googleSansCode, googleSansFlex } from './fonts';

export const metadata: Metadata = {
  title: { default: 'Ops Hub | The BTX Foundation', template: '%s | Ops Hub' },
  description: 'The BTX Foundation staff app: tasks, scholarships, money, programs and outreach.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

// The root layout: loads the fonts and the shared styles. The shell (sidebar, bars) is added by the (shell) group.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${googleSansFlex.variable} ${googleSansCode.variable}`}>
      <body>{children}</body>
    </html>
  );
}
