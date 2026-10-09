// Today: what needs the signed-in person (Figma "Today, laptop" and "Today, phone"). Built entirely on MOCK data for now
// (mock/today.ts): the Ops Hub tables do not exist yet.
import Link from 'next/link';
import { OIcon } from '@/components/icons';
import { Ring } from '@/components/ring';
import { TasksCard } from '@/components/tasks-card';
import { LoadError } from '@/components/load-error';
import { PageHeader } from '@/components/page-header';
import { TODAY, TODAY_STRESS } from '@/mock/today';

// The page.
export default async function TodayPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  // ?demo=error draws the "didn't load" state, ?demo=stress the stress frames' data.
  if (demo === 'error') {
    return (
      <>
        <PageHeader title="Today" />
        <div className="o-todayerr">
          <LoadError what="Today" />
        </div>
      </>
    );
  }
  const TODAY_DATA = demo === 'stress' ? TODAY_STRESS : TODAY;
  return (
    <>
      <div className="o-top o-hd">
        <div className="o-top-t">
          <h1>{TODAY_DATA.headline}</h1>
          <p>{TODAY_DATA.dateLine}</p>
        </div>
        <div className="o-search o-lg" role="search">
          <OIcon name="search" size={20} />
          <span>Search applicants, tasks, people</span>
        </div>
      </div>

      <section className="o-ov" aria-labelledby="ov-h">
        <div className="o-ovh">
          <h2 className="o-h2" id="ov-h">
            Overview
          </h2>
          <span className="o-note o-lg">Updated as the board logs work</span>
          <Link href="/goals" className="o-ul">
            <span className="o-lg">Year goals</span>
            <span className="o-ph">Goals</span>
          </Link>
        </div>
        <div className="o-ovg">
          {TODAY_DATA.areas.map((a) => (
            <Link key={a.id} href={a.href} className="o-oc">
              <span className="o-oct">
                <span className="o-lg">
                  <Ring {...a.ring} size={44} />
                </span>
                <span className="o-ph">
                  <Ring {...a.ring} size={32} />
                </span>
                <b>{a.name}</b>
              </span>
              <span className="o-big">{a.big}</span>
              <span className="o-lbl">{a.label}</span>
              <span className="o-sub">{a.line}</span>
              <span className={a.forYou ? 'o-pill' : 'o-pill quiet'}>{a.forYou ?? 'Nothing for you'}</span>
            </Link>
          ))}
        </div>
      </section>

      <TasksCard data={TODAY_DATA} />
    </>
  );
}
