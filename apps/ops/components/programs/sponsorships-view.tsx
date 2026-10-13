'use client';

// Programs > Sponsorships (Figma "Programs > Sponsorships", laptop and phone, plus the "Log a sponsorship" form): this
// year's one-off sponsorships and how a sponsorship works. "Log a sponsorship" calls public.log_sponsorship() through
// lib/actions/programs.ts (in memory in mock mode), which also records the spending on Budget.
import { useState } from 'react';
import { logSponsorship } from '@/lib/actions/programs';
import type { SponsorshipRow, SponsorshipsData } from '@/mock/programs';
import { OIcon } from '../icons';
import { AreaHeader, Field, Glyph, Modal } from '../area/parts';
import './programs.css';

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const KIND: Record<SponsorshipRow['kind'], string> = { conference: 'Conference', travel: 'Travel', fee: 'Fee', other: 'Other' };

// "NSBE convention" -> conference, "bus travel" -> travel, "exam fee" -> fee; the draft's default is conference.
function kindOf(text: string): SponsorshipRow['kind'] {
  if (/travel/i.test(text)) return 'travel';
  if (/\bfees?\b/i.test(text)) return 'fee';
  return 'conference';
}

// A typed date ("Dec 5, 2026") becomes the spending date; a season or nothing becomes today.
function spentOn(text: string): string {
  const t = Date.parse(text);
  const d = Number.isNaN(t) || !/\d/.test(text) ? new Date() : new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function LogForm({ onClose, onSaved }: { onClose: () => void; onSaved: (row: SponsorshipRow) => void }) {
  const [what, setWhat] = useState('');
  const [students, setStudents] = useState('');
  const [amount, setAmount] = useState('');
  const [when, setWhen] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    const title = what.trim();
    const dollars = Number(amount.replace(/[$,\s]/g, ''));
    const count = students.trim() === '' ? 0 : Number(students);
    if (!title) return setErr('Say what it was for.');
    if (amount.trim() === '' || !Number.isFinite(dollars) || dollars < 0) return setErr('Type the amount as a number, like 2750.');
    if (!Number.isInteger(count) || count < 0) return setErr('Students should be a whole number.');
    setBusy(true);
    setErr(null);
    const kind = kindOf(title);
    const label = when.trim();
    const r = await logSponsorship({ title, kind, students: count, amountCents: Math.round(dollars * 100), whenLabel: label, spentOn: spentOn(label) });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    onSaved({ id: r.id, title, kind, students: count, amount: dollars, when: label || 'Date not set', state: 'Done', phoneWhen: `${label || 'Date not set'} · also on Budget` });
    onClose();
  }

  return (
    <Modal title="Log a sponsorship" onClose={onClose}>
      <form onSubmit={go} noValidate>
        <Field label="What it was for">
          <input value={what} onChange={(e) => setWhat(e.target.value)} placeholder="Conference, travel or fee" maxLength={200} />
        </Field>
        <Field label="Students">
          <input value={students} onChange={(e) => setStudents(e.target.value)} placeholder="How many" inputMode="numeric" />
        </Field>
        <Field label="Amount">
          <span className="ar-money">
            <i>$</i>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
          </span>
        </Field>
        <Field label="When">
          <input value={when} onChange={(e) => setWhen(e.target.value)} placeholder="Date or season" maxLength={60} />
        </Field>
        <p className="ar-hint">Saving also records the amount on Budget, under Sponsorships.</p>
        {err ? (
          <p className="ar-err" role="alert">
            {err}
          </p>
        ) : null}
        <div className="ar-btns">
          <button type="submit" className="o-btn p" disabled={busy}>
            Log sponsorship
          </button>
          <button type="button" className="o-btn s" onClick={onClose}>
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function SponsorshipsView({ data }: { data: SponsorshipsData }) {
  const [rows, setRows] = useState<SponsorshipRow[]>(data.rows);
  const [open, setOpen] = useState(false);
  const n = rows.length;

  return (
    <>
      <AreaHeader
        title="Sponsorships"
        sub="One-off support for students: conferences, travel, fees"
        phoneSub={`Programs · one-off support · ${n} in ${data.year}`}
        phoneAction={
          <button type="button" className="o-sq" aria-label="Log a sponsorship" onClick={() => setOpen(true)}>
            <OIcon name="plus" size={22} />
          </button>
        }
      >
        <button type="button" className="o-btn s lg pg-log" onClick={() => setOpen(true)}>
          <OIcon name="plus" size={16} />
          Log a sponsorship
        </button>
      </AreaHeader>

      <div className="pg-sp">
        <section className="ar-panel" aria-labelledby="sp-year">
          <div className="ar-ph">
            <h2 id="sp-year">{data.year}</h2>
            <span className="o-lg">{plural(n, 'sponsorship', 'sponsorships')}</span>
          </div>
          <p className="pg-sp-cnt o-ph">{plural(n, 'sponsorship', 'sponsorships')}</p>
          <div className="pg-sp-th o-lg" aria-hidden="true">
            <span>Sponsorship</span>
            <span>Students</span>
            <span className="r">Spent</span>
            <span>When</span>
            <span>State</span>
          </div>
          {rows.map((r) => (
            <div key={r.id} className="pg-sp-row">
              <span className="pg-sp-t">
                <b title={r.title}>{r.title}</b>
                <span className="o-lg">
                  <OIcon name="scholarships" size={14} />
                  {KIND[r.kind]} · also on Budget
                </span>
                <span className="o-ph">
                  {KIND[r.kind]} · {plural(r.students, 'student', 'students')} · {money(r.amount)}
                </span>
                <span className="o-ph">{r.phoneWhen}</span>
              </span>
              <span className="o-lg">{plural(r.students, 'student', 'students')}</span>
              <b className="r o-lg">{money(r.amount)}</b>
              <span className="o-lg">{r.when}</span>
              <span className="o-lg">
                <span className="ar-pill soft">
                  <Glyph name="tick" size={12} />
                  {r.state}
                </span>
              </span>
              <span className={`ar-pill pg-sp-ph o-ph${r.state === 'Done' ? ' ink' : ''}`}>{r.state}</span>
            </div>
          ))}
          <p className="pg-sp-note o-lg">{data.note}</p>
        </section>

        <section className="ar-panel pg-how" aria-labelledby="sp-how">
          <div className="ar-ph">
            <h2 id="sp-how">How a sponsorship works</h2>
          </div>
          <p className="pg-how-sub o-ph">{data.note.replace('.', '')}</p>
          <ol>
            {data.steps.map((s, i) => (
              <li key={s.title}>
                <span className="pg-num">{i + 1}</span>
                <span>
                  <b>
                    <span className="o-lg">{s.title}</span>
                    <span className="o-ph">{s.phoneTitle ?? s.title}</span>
                  </b>
                  <span className="o-lg">{s.body}</span>
                  <span className="o-ph">{s.phoneBody}</span>
                </span>
              </li>
            ))}
          </ol>
        </section>
      </div>

      {open ? <LogForm onClose={() => setOpen(false)} onSaved={(row) => setRows((l) => [...l, row])} /> : null}
    </>
  );
}
