'use client';

// Outreach > Newsletter (Figma "Outreach > Newsletter", laptop and phone): the next issue as a checklist of sections,
// the email preview, and a strip of facts. Ticking a section writes newsletter_sections.status (in memory in mock
// mode). Subscriber numbers, the last issue and the email tool are not stored yet (README-ops-hub.md), so they show the
// design's [placeholders] unless the newsletter channel has an audience_count. "Past issues" is not connected yet.
import { useState } from 'react';
import { setSectionDone, showPastIssues } from '@/lib/actions/outreach';
import type { NewsletterData, Section } from '@/mock/outreach';
import { Ring } from '../ring';
import { AreaHeader, Notice, OwnerChip, StepCheck } from '../area/parts';
import '../programs/programs.css';
import './outreach.css';

export function NewsletterView({ data }: { data: NewsletterData }) {
  const [sections, setSections] = useState<Section[]>(data.sections);
  const [note, setNote] = useState<string | null>(null);
  const done = sections.filter((s) => s.state === 'done').length;
  const total = sections.length;
  const next = sections.find((s) => s.state === 'next') ?? sections.find((s) => s.state !== 'done');

  async function toggle(id: string) {
    const s = sections.find((x) => x.id === id);
    if (!s) return;
    const nowDone = s.state !== 'done';
    const r = await setSectionDone(id, nowDone);
    if (!r.ok) return setNote(r.message);
    setNote(null);
    setSections((l) => {
      const flipped = l.map((x) => (x.id === id ? { ...x, state: nowDone ? ('done' as const) : ('todo' as const), sub: nowDone ? 'Done' : 'Not started', phoneLabel: nowDone ? 'Done' : 'Not started', phoneText: false, tag: undefined } : x));
      return flipped;
    });
  }

  async function past() {
    const r = await showPastIssues();
    setNote(r.ok ? null : `Past issues: ${r.message.charAt(0).toLowerCase()}${r.message.slice(1)}`);
  }

  const nowTitle = next?.short ?? next?.title;
  const line = `${done} of ${total} done${nowTitle ? `, now ${nowTitle}` : ''}`;

  return (
    <>
      <AreaHeader
        tall
        title="Newsletter"
        sub={data.subtitle}
        phoneSub={data.phoneSub}
      >
        <button type="button" className="o-btn s lg" onClick={past}>
          Past issues
        </button>
      </AreaHeader>
      <Notice text={note} />

      {/* phone: the facts as cards */}
      <div className="pg-stats ou-nstats o-ph">
        <div>
          <p>{data.issueTitle}</p>
          <b>{data.sendOn}</b>
          <span>Sends to subscribers</span>
        </div>
        <div>
          <p>Subscribers</p>
          <b>{data.subscribers}</b>
          <span>Monthly email</span>
        </div>
        <div className="wide">
          <p>Last issue</p>
          <b>{data.lastIssue}</b>
          <span>Sent from {data.tool}</span>
        </div>
      </div>

      <div className="ou-nl">
        <section className="ar-panel ou-issue" aria-labelledby="nl-issue">
          <div className="ou-ih">
            <Ring frac={done / total} label={`${done}/${total}`} color="gold" size={44} />
            <div>
              <h2 id="nl-issue">{data.issueTitle}</h2>
              <p>
                <span className="o-lg">{`${line} · sends ${data.sendOn}`}</span>
                <span className="o-ph">{line}</span>
              </p>
            </div>
            <span className="ou-iown o-lg">
              <OwnerChip o={data.owner} />
              <b>Owner: {data.owner.name}</b>
            </span>
          </div>
          {sections.map((s) => (
            <div key={s.id} className={`ou-sec ${s.state}`}>
              <StepCheck done={s.state === 'done'} label={s.title} onClick={() => toggle(s.id)} />
              <span className="ou-st">
                <b>{s.title}</b>
                <span className="o-lg">{s.sub}</span>
                <span className="o-ph">{s.phoneSub}</span>
              </span>
              <span className="ou-sr o-lg">
                {s.tag ? <i>{s.tag}</i> : null}
                <OwnerChip o={s.owner} />
              </span>
              <span className={`ou-sl o-ph${s.phoneText ? ' text' : ''}${s.state === 'done' ? ' ink' : ''}`}>{s.phoneLabel}</span>
            </div>
          ))}
        </section>

        <section className="ar-panel ou-prev o-lg" aria-labelledby="nl-prev">
          <div className="ar-ph">
            <h2 id="nl-prev">Email preview</h2>
            <span>How readers will see it</span>
          </div>
          <div className="ou-mail">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/btx-logo-on-light.png" alt="BTX Foundation" className="ou-logo" />
            <h3>{data.previewTitle}</h3>
            <p className="ou-intro">{data.intro}</p>
            <ul>
              {sections.map((s) => (
                <li key={s.id}>
                  <b>{s.title}</b>
                  <span>{s.blurb}</span>
                </li>
              ))}
            </ul>
            <p className="ou-unsub">
              You&apos;re receiving this because you support The BTX Foundation. <u>Unsubscribe</u>.
            </p>
          </div>
        </section>
      </div>

      <div className="ou-facts ar-panel o-lg">
        <span>
          Subscribers <b>{data.subscribers}</b>
        </span>
        <span>
          Last issue <b>{data.lastIssue}</b>
        </span>
        <span>
          Sent from <b>{data.tool}</b>
        </span>
      </div>
    </>
  );
}
