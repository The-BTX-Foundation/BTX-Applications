'use client';

// Scholarships > Scoring (Figma "Scholarships > Scoring", laptop, and "Phone: scoring an applicant"): the scorer's queue,
// the rubric with a 1 to 5 pick per criterion, the interview notes and a private note. Picks save as a draft as you go;
// Publish needs all six and asks first. Saving goes through lib/actions/scoring.ts (in memory in mock mode).
import { useEffect, useRef, useState } from 'react';
import type { Criterion, ScoringData, Sheet } from '@/lib/scoring';
import { PICK_LABELS, weighted } from '@/mock/scores';
import { publishScore, saveDraft, savePrivateNote } from '@/lib/actions/scoring';
import { PageHeader } from './page-header';
import { Dialog, PhoneBar, ScoreRing, VideoMark } from './sch-parts';
import './scholarships.css';

type Picks = Record<string, Record<string, number>>;

const count = (p: Record<string, number>) => Object.keys(p).length;

// "20 points, cycle average 3.8" (laptop) or "20 points · cycle avg 3.8" (phone); the stress frame prints "20%".
function weightLine(c: Criterion, style: ScoringData['weightStyle'], phone: boolean): string {
  const w = style === 'percent' ? `${c.weight}%` : `${c.weight} points`;
  return phone ? `${w} · cycle avg ${c.avg}` : `${w}, cycle average ${c.avg}`;
}

// The five 1 to 5 buttons for one criterion.
function Scale({ crit, value, disabled, onPick, phone }: { crit: Criterion; value?: number; disabled: boolean; onPick: (n: number) => void; phone?: boolean }) {
  return (
    <div className={phone ? 's-sc p' : 's-sc'} role="group" aria-label={`Score for ${crit.name}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          className={value === n ? 'on' : undefined}
          aria-pressed={value === n}
          disabled={disabled}
          aria-label={`${crit.name}: score ${n}, ${PICK_LABELS[n - 1]}`}
          onClick={() => onPick(n)}
        >
          {n}
        </button>
      ))}
    </div>
  );
}

export function ScoringView({ data }: { data: ScoringData }) {
  const first = data.sheets.find((s) => !s.published) ?? data.sheets[0];
  const [code, setCode] = useState(first?.code ?? '');
  const [picks, setPicks] = useState<Picks>(() => Object.fromEntries(data.sheets.map((s) => [s.code, s.picks])));
  const [published, setPublished] = useState<Record<string, boolean>>(() => Object.fromEntries(data.sheets.map((s) => [s.code, s.published])));
  const [saved, setSaved] = useState<Record<string, string | null>>(() => Object.fromEntries(data.sheets.map((s) => [s.code, s.draftSavedAt])));
  const [notes, setNotes] = useState<Record<string, string>>(() => Object.fromEntries(data.sheets.map((s) => [s.code, s.privateNote])));
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  const sheet: Sheet | undefined = data.sheets.find((s) => s.code === code) ?? first;
  if (!sheet) {
    return (
      <div className="s-page">
        <PageHeader title="Scoring" sub={data.sub} />
        <section className="o-card s-panel">
          <p className="s-ln">Nothing to score yet.</p>
        </section>
      </div>
    );
  }
  const mine = picks[sheet.code] ?? {};
  const isPub = published[sheet.code] ?? false;
  const n = count(mine);
  const left = data.criteria.length - n;
  const current = data.criteria.find((c) => !mine[c.key])?.key;
  const wScore = weighted(mine);

  // The queue rows: still to score first, then those you published.
  const todo = data.sheets.filter((s) => !(published[s.code] ?? false));
  const done = data.sheets.filter((s) => published[s.code] ?? false);
  const lineFor = (s: Sheet): string => {
    // Stress and fixture rows carry their own wording until you change something.
    const picksNow = picks[s.code] ?? {};
    if (JSON.stringify(picksNow) === JSON.stringify(s.picks) && (published[s.code] ?? false) === s.published) return s.queueLine;
    const k = count(picksNow);
    if (published[s.code]) return `${(weighted(picksNow) ?? 0).toFixed(1)}, waiting on ${s.otherName}`;
    return k > 0 ? `Draft, ${k} of 6` : 'Not started';
  };

  // A pick: save the draft right after (a short pause so a quick run of taps is one save).
  function pick(key: string, v: number) {
    if (isPub) return;
    const next = { ...mine, [key]: v };
    setPicks((p) => ({ ...p, [sheet!.code]: next }));
    if (timer.current) clearTimeout(timer.current);
    const appId = sheet!.applicationId;
    const c = sheet!.code;
    timer.current = setTimeout(async () => {
      const res = await saveDraft(appId, next);
      if (res.ok) {
        setSaved((s) => ({ ...s, [c]: res.savedAt ?? null }));
        setError('');
      } else setError(res.message);
    }, 500);
  }

  async function publish() {
    const res = await publishScore(sheet!.applicationId, mine);
    setConfirm(false);
    if (res.ok) {
      setPublished((p) => ({ ...p, [sheet!.code]: true }));
      setError('');
    } else setError(res.message);
  }

  async function saveNote(text: string) {
    await savePrivateNote(sheet!.applicationId, text);
  }

  const status = isPub ? 'Published. Locked.' : saved[sheet.code] ? `Draft saved ${saved[sheet.code]}` : 'Not saved yet';

  return (
    <div className="s-page s-score">
      <PhoneBar title="Scoring" />

      <div className="o-lg">
        <PageHeader title="Scoring" sub={data.sub} />
      </div>

      <div className="s-cols">
        {/* queue (laptop) */}
        <section className="o-card s-panel s-q o-lg">
          <div className="s-ph s-qh">
            <h2>Your queue</h2>
            <span>{data.queueTotal}</span>
          </div>
          {todo.map((s) => (
            <button type="button" key={s.code} className={`s-qr${s.code === sheet.code ? ' pick' : ''}`} onClick={() => setCode(s.code)}>
              <ScoreRing n={count(picks[s.code] ?? {})} size={38} />
              <span className="s-qb">
                <b>
                  {s.code} {s.initials}
                </b>
                <span>{lineFor(s)}</span>
              </span>
            </button>
          ))}
          {data.queueTotal > todo.length ? (
            <div className="s-qa">
              <span className="o-ul">Show all {data.queueTotal}</span>
            </div>
          ) : null}
          {done.length > 0 ? (
            <p className="s-qg">
              <b>Published</b> <span>{done.length}</span>
            </p>
          ) : null}
          {done.map((s) => (
            <button type="button" key={s.code} className={`s-qr${s.code === sheet.code ? ' pick' : ''}`} onClick={() => setCode(s.code)}>
              <ScoreRing n={count(picks[s.code] ?? {})} size={38} />
              <span className="s-qb">
                <b>
                  {s.code} {s.initials}
                </b>
                <span>{lineFor(s)}</span>
              </span>
            </button>
          ))}
          <p className="s-qn">
            {sheet.initials}&apos;s other interviewer, {sheet.otherName}, {sheet.otherPublished ? "has published. You'll see both scores once you publish." : "has not published yet. You'll see both scores once you both publish."}
          </p>
        </section>

        {/* the rubric (laptop) */}
        <section className="o-card s-panel s-rub o-lg">
          <div className="s-rh">
            <h2>
              {sheet.code} · {sheet.initials}
            </h2>
            <p>{sheet.cycleLine}</p>
          </div>
          <p className="s-key">
            {PICK_LABELS.map((l, i) => (
              <span key={l}>
                {i + 1} {l}
              </span>
            ))}
          </p>
          {data.criteria.map((c) => (
            <div key={c.key} className={`s-cr${current === c.key && !isPub ? ' cur' : ''}`}>
              <div>
                <b>{c.name}</b>
                <span>{weightLine(c, data.weightStyle, false)}</span>
                {!mine[c.key] ? <em>{current === c.key && !isPub ? 'Not scored, up next' : 'Not scored'}</em> : null}
              </div>
              <Scale crit={c} value={mine[c.key]} disabled={isPub} onPick={(v) => pick(c.key, v)} />
            </div>
          ))}
          <div className="s-rf">
            <p className="s-sco">
              <b>
                {n} of {data.criteria.length}
              </b>
              <span>{n === data.criteria.length ? `scored. Your score is ${(wScore ?? 0).toFixed(1)}.` : 'scored. Your score shows once all six are in.'}</span>
            </p>
            <div className="s-fa">
              <span>
                {status}
                {isPub ? '' : ' · publishing needs all six'}
              </span>
              <button type="button" className={n === data.criteria.length && !isPub ? 'o-btn p lg' : 'o-btn lg s-dis'} disabled={n < data.criteria.length || isPub} onClick={() => setConfirm(true)}>
                Publish score
              </button>
            </div>
            {error ? (
              <p className="s-err" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </section>

        {/* interview notes (laptop) */}
        <aside className="o-card s-panel s-nts o-lg">
          <div className="s-ph">
            <h2>Interview notes</h2>
          </div>
          {sheet.summary ? <p className="s-nb">{sheet.summary}</p> : <p className="s-nb muted">Interview notes will show here once they are written.</p>}
          {sheet.quotes.map((q) => (
            <div className="s-nq" key={q.criterion}>
              <p>
                <VideoMark size={15} />
                <b>{q.criterion}</b>
                <span>{q.at}</span>
              </p>
              <blockquote>{q.text}</blockquote>
            </div>
          ))}
          <label className="s-pn" htmlFor="s-private">
            Your private notes
          </label>
          <textarea
            id="s-private"
            placeholder="Add a note only you can see"
            value={notes[sheet.code] ?? ''}
            onChange={(e) => setNotes((m) => ({ ...m, [sheet.code]: e.target.value }))}
            onBlur={(e) => void saveNote(e.target.value)}
          />
        </aside>

        {/* phone: the scorecard */}
        <div className="s-pcard o-ph">
          <section className="o-card s-pap">
            <div>
              <b>
                {sheet.code} · {sheet.initials}
              </b>
              <span>Fall 2026, Legacy cycle</span>
              <span>{sheet.phoneLine}</span>
            </div>
            <div className="s-prg">
              <ScoreRing n={n} size={52} />
              <b>
                {n} of {data.criteria.length} scored
              </b>
            </div>
          </section>
          <p className="s-pkey">
            {PICK_LABELS.map((l, i) => (
              <span key={l}>
                <b>{i + 1}</b> {l}{' '}
              </span>
            ))}
          </p>
          {data.criteria.map((c) => (
            <section key={c.key} className={`o-card s-pcr${current === c.key && !isPub ? ' cur' : ''}`}>
              <b>{c.name}</b>
              <p>
                <span>{weightLine(c, data.weightStyle, true)}</span>
                <strong>{mine[c.key] ? `${mine[c.key]} · ${PICK_LABELS[mine[c.key] - 1]}` : 'Not scored'}</strong>
              </p>
              <Scale crit={c} value={mine[c.key]} disabled={isPub} onPick={(v) => pick(c.key, v)} phone />
            </section>
          ))}
        </div>
      </div>

      <div className="s-pbot o-ph">
        <p>
          <span>{status}</span>
          <b>{isPub ? 'Published' : `${left} left`}</b>
        </p>
        <button type="button" className={left === 0 && !isPub ? 'o-btn p xl s-wide' : 'o-btn xl s-wide s-dis'} disabled={left > 0 || isPub} onClick={() => setConfirm(true)}>
          Publish
        </button>
      </div>

      {confirm ? (
        <Dialog title={`Publish your score for ${sheet.code} ${sheet.initials}?`} onClose={() => setConfirm(false)}>
          <p>{sheet.otherPublished ? `${sheet.otherName.split(' ')[0]} has published, so you'll both see both scores.` : 'Your score stays private until both interviewers publish.'}</p>
          <div className="s-dlg-b">
            <button type="button" className="o-btn p lg" onClick={publish}>
              Publish score
            </button>
            <button type="button" className="o-btn s lg" onClick={() => setConfirm(false)}>
              Keep editing
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
