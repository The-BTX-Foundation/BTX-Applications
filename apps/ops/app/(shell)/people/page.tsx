// Board members (route /people). Mock data until the Ops Hub tables exist (lib/people.ts). ?demo=stress / ?demo=error as on the
// Finance pages; in mock mode ?as=board shows the page as a board member (admins see "Give admin rights" / "Remove admin rights", others do not).
import type { Metadata } from 'next';
import { PeopleView } from '@/components/people/people-view';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { loadPeople } from '@/lib/people';
import { mockRole } from '@/lib/money-shared';
import { requireStaff } from '@/lib/user';
import '@/components/money/money.css';

export const metadata: Metadata = { title: 'Board members' };

export default async function PeoplePage({ searchParams }: { searchParams: Promise<{ demo?: string; as?: string }> }) {
  const { demo, as } = await searchParams;
  const user = await requireStaff();
  const role = user.mock ? mockRole(as, user.role) : user.role;
  const data = await loadPeople({ demo, me: user.id });
  if (data.failed) {
    return (
      <>
        <PageHeader title="Board members" />
        <div className="mn-errwrap">
          <LoadError what="Board members" />
        </div>
      </>
    );
  }
  return <PeopleView data={data} demo={demo} role={role} />;
}
