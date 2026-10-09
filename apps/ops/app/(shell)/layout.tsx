// Every signed-in page lives under this layout: it loads the staff member (or redirects) and draws the shell.
import { Shell } from '@/components/shell';
import { requireStaff } from '@/lib/user';

// The shell reads the session cookie, so every page under it is rendered per request, never prebuilt.
export const dynamic = 'force-dynamic';

// Wraps the page in the sidebar, phone bars and menu.
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const user = await requireStaff();
  return <Shell user={{ name: user.name, initials: user.initials, roleText: user.roleText }}>{children}</Shell>;
}
