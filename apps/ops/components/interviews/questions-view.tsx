'use client';

// Scholarships > Interviews > Interview questions (Figma "Options: interview flow": reading, and editing with admin
// rights). Every board member reads the questions, grouped by the cycle's scoring criteria and then "To close" (not
// scored). Board members with admin rights edit the text in place, add, remove and move questions up or down. The
// scorecard shows the same questions beside the scores. Changes save through lib/actions/interview-questions.ts;
// in mock mode (no Supabase env) the page keeps them in its own state.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import type { QuestionsData } from '@/lib/interview-questions';
import { groupQuestions, type QuestionGroup } from '@/lib/question-groups';
import { moveInterviewQuestion, removeInterviewQuestion, saveInterviewQuestion, addStarterQuestions } from '@/lib/actions/interview-questions';
import { timeLabel } from '@/lib/format';
import { RUBRIC } from '@/mock/scores';
import { STARTER_QUESTIONS } from '@/mock/interview-flow';
import { useRouter } from 'next/navigation';
import { PageHeader } from '../page-header';
import '../scholarships.css';
import './interview-flow.css';

// A question's text box: grows with its text, saves when you leave it.
function QuestionBox({ value, label, autoFocus, onSave }: { value: string; label: string; autoFocus?: boolean; onSave: (text: string) => void }) {
  const [text, setText] = useState(value);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [text]);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  return (
    <textarea
      ref={ref}
      className="iv-qin"
      rows={1}
      value={text}
      aria-label={label}
      onChange={(e) => setText(e.target.value.replace(/\n/g, ' '))}
      onBlur={() => {
        onSave(text);
        if (text.trim() === '') setText(value);
      }}
    />
  );
}

type Row = { id: string; text: string; draft?: boolean };
type Group = Omit<QuestionGroup, 'questions'> & { questions: Row[] };

export function QuestionsView({ data }: { data: QuestionsData }) {
  const router = useRouter();
  const mock = data.source === 'mock';
  const [groups, setGroups] = useState<Group[]>(data.groups);
  const [saved, setSaved] = useState('');
  const [error, setError] = useState('');
  const [focus, setFocus] = useState<string | null>(null);
  const localId = useRef(0);
  const total = groups.reduce((n, g) => n + g.questions.filter((q) => !q.draft).length, 0);
  const cycleId = data.cycleId ?? '';
  const admin = data.isAdmin;

  const patch = (key: string | null, f: (rows: Row[]) => Row[]) => setGroups((gs) => gs.map((g) => (g.key === key ? { ...g, questions: f(g.questions) } : g)));
  const stamp = () => setSaved(`Saved ${timeLabel(new Date())}`);

  function add(g: Group) {
    localId.current += 1;
    const id = `draft-${localId.current}`;
    patch(g.key, (rows) => [...rows, { id, text: '', draft: true }]);
    setFocus(id);
  }

  async function save(g: Group, q: Row, text: string) {
    const t = text.trim();
    if (q.draft && t === '') return patch(g.key, (rows) => rows.filter((r) => r.id !== q.id));
    if (t === '' || (!q.draft && t === q.text)) return;
    const r = await saveInterviewQuestion(cycleId, { id: q.draft ? undefined : q.id, criterionKey: g.key, text: t });
    if (!r.ok) return setError(r.message);
    setError('');
    const id = q.draft ? (r.id ?? `local-${++localId.current}`) : q.id;
    patch(g.key, (rows) => rows.map((x) => (x.id === q.id ? { id, text: t } : x)));
    stamp();
  }

  async function remove(g: Group, q: Row) {
    if (q.draft) return patch(g.key, (rows) => rows.filter((r) => r.id !== q.id));
    const r = await removeInterviewQuestion(q.id);
    if (!r.ok) return setError(r.message);
    setError('');
    patch(g.key, (rows) => rows.filter((x) => x.id !== q.id));
    stamp();
  }

  async function move(g: Group, q: Row, dir: 'up' | 'down') {
    const r = await moveInterviewQuestion(q.id, dir);
    if (!r.ok) return setError(r.message);
    setError('');
    patch(g.key, (rows) => {
      const i = rows.findIndex((x) => x.id === q.id);
      const j = dir === 'up' ? i - 1 : i + 1;
      if (i < 0 || j < 0 || j >= rows.length) return rows;
      const next = [...rows];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    stamp();
  }

  async function starter() {
    const r = await addStarterQuestions(cycleId);
    if (!r.ok) return setError(r.message);
    setError('');
    if (mock) setGroups(groupQuestions(RUBRIC, STARTER_QUESTIONS.map((q, i) => ({ id: `mock-q-${i + 1}`, criterionKey: q.key, text: q.text }))));
    else router.refresh();
    stamp();
  }

  // Questions are numbered 1, 2, 3 ... down the whole page, across groups.
  const numbers = new Map<string, number>();
  for (const g of groups) for (const q of g.questions) if (!q.draft) numbers.set(q.id, numbers.size + 1);

  return (
    <div className="s-page iv-wide">
      <PageHeader title="Interview questions" sub={<><span className="o-lg">{data.sub}</span><span className="o-ph">Grouped by the scoring rubric</span></>} />

      <div className="iv-cols">
        <section className="o-card s-panel iv-main" aria-label="Questions">
          <div className="iv-ph">
            <div className="iv-qh">
              <h2>Questions</h2>
              <span className="iv-pill">Draft: edit freely</span>
            </div>
            <span className="o-lg">{admin ? `${saved ? `${saved} · ` : ''}Use the arrows to reorder` : 'Editable with admin rights'}</span>
          </div>
          <p className="iv-pf o-ph" style={{ borderBottom: '1px solid var(--line)', padding: '10px 16px' }}>
            {admin ? `${saved ? `${saved}. ` : ''}Tap a question to edit it. Use the arrows to reorder.` : 'Editable with admin rights.'}
          </p>
          {error ? (
            <p className="iv-err" role="alert" style={{ padding: '10px 16px 0', margin: 0 }}>
              {error}
            </p>
          ) : null}

          {total === 0 ? (
            <div className="iv-empty">
              <p>{admin ? 'This cycle has no interview questions yet.' : 'No interview questions yet. A board member with admin rights will add them.'}</p>
              {admin ? (
                <button type="button" className="o-btn p lg" onClick={starter}>
                  Use the starter questions
                </button>
              ) : null}
            </div>
          ) : null}

          {groups.map((g) => {
            if (!admin && g.questions.length === 0) return null;
            return (
              <div className="iv-qg" key={g.key ?? 'close'}>
                <div className="iv-qgh">
                  <b>{g.name}</b>
                  <span className="iv-qgr">
                    {admin ? (
                      <button type="button" className="o-ul o-lg" onClick={() => add(g)}>
                        + Add a question
                      </button>
                    ) : null}
                    <span>{g.points}</span>
                  </span>
                </div>
                <ol className={`iv-ql${admin ? ' edit' : ''}`} style={{ listStyle: 'none' }}>
                  {g.questions.map((q, i) => {
                    const n = numbers.get(q.id) ?? 0;
                    const num = q.draft ? '' : `${n}.`;
                    return (
                      <li key={q.id}>
                        <span className="nn">{num}</span>
                        {admin ? (
                          <>
                            <QuestionBox value={q.text} label={q.draft ? `New question for ${g.name}` : `Question ${n}`} autoFocus={focus === q.id} onSave={(t) => save(g, q, t)} />
                            <span className="iv-mvb">
                              <button type="button" aria-label={`Move question ${num} up`} disabled={q.draft || i === 0} onClick={() => move(g, q, 'up')}>
                                ▲
                              </button>
                              <button type="button" aria-label={`Move question ${num} down`} disabled={q.draft || i === g.questions.length - 1} onClick={() => move(g, q, 'down')}>
                                ▼
                              </button>
                            </span>
                            <button type="button" className="iv-rm" onClick={() => remove(g, q)}>
                              Remove
                            </button>
                          </>
                        ) : (
                          <span>{q.text}</span>
                        )}
                      </li>
                    );
                  })}
                </ol>
                {admin ? (
                  <button type="button" className="o-ul o-ph" style={{ marginTop: 8 }} onClick={() => add(g)}>
                    + Add a question
                  </button>
                ) : null}
              </div>
            );
          })}
        </section>

        <div className="iv-side" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <section className="o-card s-panel iv-next" aria-label="Your next interview">
            <small>Your next interview</small>
            {data.next ? (
              <>
                <h2>{data.next.whenLine}</h2>
                <p>
                  {data.next.code} · {data.next.applicant} · with {data.next.withName}
                </p>
                <Link className="o-btn s" href="/scholarships/scoring">
                  Open the scorecard
                </Link>
              </>
            ) : (
              <>
                <h2>None booked yet</h2>
                <p>When a student books a time with you, it shows here.</p>
                <Link className="o-btn s" href="/scholarships/scoring">
                  Open the scorecard
                </Link>
              </>
            )}
          </section>
          <section className="o-card s-panel iv-tip">The scorecard shows these questions beside the scores.</section>
        </div>
      </div>
    </div>
  );
}
