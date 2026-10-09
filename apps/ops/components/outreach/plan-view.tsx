'use client';

// Outreach > Plan (Figma "Outreach > Plan", laptop and phone): the four channels as cards, then the month's items in date
// order. "Add a channel" and "Plan November" (an item with a date, a channel and an owner) write through
// lib/actions/outreach.ts (in memory in mock mode). Channels with no target yet are drawn dashed.
import { useState } from 'react';
import { addChannel } from '@/lib/actions/outreach';
import type { ChannelCard, PlanData, PlanRow } from '@/mock/outreach';
import { OIcon } from '../icons';
import { Ring } from '../ring';
import { AreaHeader, Glyph, OwnerChip, TextForm, type GlyphName } from '../area/parts';
import { dayWord, PostForm } from './post-form';
import './outreach.css';

const KIND_ICON: Record<ChannelCard['kind'], GlyphName> = { instagram: 'image', newsletter: 'mail', linkedin: 'people', campus_events: 'flag', other: 'flag' };

export function PlanView({ data }: { data: PlanData }) {
  const [cards, setCards] = useState<ChannelCard[]>(data.cards);
  const [rows, setRows] = useState<PlanRow[]>(data.rows);
  const [form, setForm] = useState<'channel' | 'post' | null>(null);

  return (
    <>
      <AreaHeader
        tall
        title="Outreach plan"
        sub="Where BTX shows up, how often, and who owns it"
        phoneSub={`Outreach · ${cards.length} channels · who owns each`}
        phoneAction={
          <button type="button" className="o-sq" aria-label="Add a channel" onClick={() => setForm('channel')}>
            <OIcon name="plus" size={22} />
          </button>
        }
      >
        <button type="button" className="o-btn s lg ou-add" onClick={() => setForm('channel')}>
          <OIcon name="plus" size={16} />
          Add a channel
        </button>
      </AreaHeader>

      <div className="ou-cards">
        {cards.map((c) => (
          <section key={c.id} className={`ou-card${c.target ? '' : ' empty'}`} aria-label={c.name}>
            <h2 className="o-lg">
              <Glyph name={KIND_ICON[c.kind]} size={20} />
              {c.name}
            </h2>
            <h2 className="o-ph">{c.name}</h2>
            <div className="o-lg ou-card-lg">
              <p className="ou-k">Target</p>
              <p className="ou-v">{c.target ?? '[Not set]'}</p>
              {c.ring ? (
                <div className="ou-ringrow">
                  <Ring frac={c.ring.total ? c.ring.done / c.ring.total : 0} label={`${c.ring.done}/${c.ring.total}`} color="gold" size={44} />
                  <span>{c.ring.line}</span>
                </div>
              ) : (
                <p className="ou-st">{c.status}</p>
              )}
            </div>
            <div className="o-ph ou-card-ph">
              <b>{c.phoneBig}</b>
              {c.phoneLines.map((l) => (
                <span key={l}>{l}</span>
              ))}
            </div>
            <div className="ou-own">{c.owner ? <OwnerChip o={c.owner} /> : <span className="ou-none">No owner yet</span>}</div>
          </section>
        ))}
      </div>

      <section className="ar-panel ou-plan" aria-labelledby="pl-month">
        <div className="ar-ph ou-plan-h">
          <h2 id="pl-month">{data.month} outreach</h2>
          <span>{rows.length} items in date order</span>
        </div>
        <div className="ou-th o-lg" aria-hidden="true">
          <span>Date</span>
          <span>Channel</span>
          <span>What</span>
          <span>Owner</span>
          <span>State</span>
        </div>
        <div className="ou-rows">
          {rows.map((r) => (
            <div key={r.id} className="ou-row">
              <span className="ou-date o-lg">{r.date}</span>
              <span className="ou-ch o-lg">
                <Glyph name={r.channel === 'instagram' ? 'image' : 'mail'} size={16} />
                {r.channel === 'instagram' ? 'Instagram' : 'Newsletter'}
              </span>
              <span className="ou-what">
                <b title={r.what}>{r.what}</b>
                <span className="o-lg">{r.next}</span>
                <span className="o-ph">{r.phoneMeta}</span>
                <span className="o-ph">{r.phoneOwner}</span>
              </span>
              <span className="ou-ow o-lg">
                <OwnerChip o={r.owner} />
              </span>
              <span className={`ou-state ${r.state.kind}`}>{r.state.kind === 'pill' ? <span className="ar-pill">{r.state.label}</span> : r.state.label}</span>
            </div>
          ))}
        </div>
        <div className="ou-foot">
          <button type="button" className="o-btn s lg" onClick={() => setForm('post')}>
            Plan November
          </button>
          <span className="o-lg">Pick a date, a channel and an owner for each item.</span>
        </div>
      </section>

      {form === 'channel' ? (
        <TextForm
          title="Add a channel"
          label="Channel name"
          placeholder="For example, Campus events"
          submit="Add channel"
          onClose={() => setForm(null)}
          onSubmit={async (name) => {
            const r = await addChannel({ name });
            if (r.ok) setCards((l) => [...l, { id: r.id, kind: 'other', name, target: null, status: 'Not started', owner: null, phoneBig: 'Not started', phoneLines: ['Target [not set]'] }]);
            return r;
          }}
        />
      ) : null}
      {form === 'post' ? (
        <PostForm
          title="Plan November"
          staff={data.staff}
          channelId={data.instagramChannelId}
          onClose={() => setForm(null)}
          onSaved={(p) =>
            setRows((l) => [
              ...l,
              {
                id: p.id,
                date: dayWord(p.postOn),
                channel: 'instagram',
                what: p.title,
                next: p.owner ? 'Next: draft the caption' : 'Next: pick an owner',
                owner: p.owner ?? 'unassigned',
                state: { label: 'Not started', kind: 'muted' },
                phoneMeta: `${dayWord(p.postOn)} · Instagram`,
                phoneOwner: p.owner ? p.owner.name : 'Unassigned · pick an owner',
              },
            ])
          }
        />
      ) : null}
    </>
  );
}
