'use client';

// Step 3: Essay, optional (drafts step4.html and step4-phone.html). The prompt comes from the cycle; a live word count
// shows against the 500-word limit. Only going over the limit blocks Continue, with the field's error style.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ErrorIcon } from '@btx/ui';
import type { AppFile, Application } from '@btx/data';
import type { CycleView } from '@/lib/cycle';
import { savedTime } from '@/lib/format';
import { DEMO_SAVED, demoDone, railSteps } from '@/lib/steps';
import { STRESS } from '@/lib/stress';
import { useAutosave } from '@/lib/use-autosave';
import { ESSAY_WORD_LIMIT, countWords } from '@/lib/words';
import { ApplyShell } from './apply-shell';
import s from './essay-form.module.css';

// The sample essay and prompt from the draft, for ?demo=1 review.
const DEMO_PROMPT =
  'Describe a moment when engineering felt personal to you: a challenge, a community need, or an experience that shaped why you want to become an engineer.';
const DEMO_ESSAY = `The summer after my freshman year, the wheelchair ramp at my church in Hyattsville cracked down the middle. The repair quote was more than the congregation could pay, so my uncle and I measured it ourselves, sketched a new design and priced the lumber and concrete.

I had just finished my first statics course. For the first time, the free-body diagrams from my homework turned into a real question: how much weight would this ramp carry, and what would happen if we got it wrong? We rebuilt it over three weekends with six neighbors.

That ramp is why I chose mechanical engineering. I want to design things people rely on every day without thinking about them.

This summer I worked with the facilities team on campus, surveying older buildings for access. I measured door widths, ramp slopes and handrail heights in fourteen buildings and wrote up every one that failed the current code.`;

export function EssayForm({
  application,
  files,
  view,
  demo,
}: {
  application: Application | null;
  files: AppFile[];
  view: CycleView;
  /** Review mode: "1" (the draft's sample) or "stress" (a 3,000-character essay). */
  demo?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState(demo ? (demo === 'stress' ? STRESS.essay : DEMO_ESSAY) : (application?.essay ?? ''));
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const auto = useAutosave(application?.id ?? null, application && application.updated_at !== application.created_at ? application.updated_at : null);
  const words = demo === '1' ? 412 : countWords(text);
  const tooLong = words > ESSAY_WORD_LIMIT;
  const showOver = tooLong;
  const prompt = demo ? DEMO_PROMPT : view.essayPrompt;
  const saved = demo ? DEMO_SAVED[3] : auto.failed ? "Couldn't save yet" : auto.savedAt ? `Saved ${savedTime(auto.savedAt)}` : undefined;

  // The box grows with the essay (the stress frame shows it taller than the 300px minimum).
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight + 3}px`;
  }, [text]);

  // In review mode the box starts focused, as the draft draws it.
  useEffect(() => {
    if (demo) box.current?.focus();
  }, [demo]);

  // Continue: blocked only when over the limit; otherwise save and go to Documents.
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (tooLong) {
      box.current?.focus();
      return;
    }
    const ok = await auto.flush({ essay: text.trim() ? text : null, current_step: Math.max(application?.current_step ?? 1, 4) });
    if (ok) router.push('/apply/documents');
    else setError("We couldn't save your essay. Check your connection and try again.");
  }

  return (
    <ApplyShell
      current={3}
      steps={railSteps(application, files, 3, demo ? demoDone(3) : undefined)}
      view={view}
      accountName={demo ? (demo === 'stress' ? STRESS.name : 'Ebony Coleman') : application?.full_name || 'Your account'}
      saved={saved}
      onSubmit={onSubmit}
      backHref="/apply/scholarship"
      primary={<Button type="submit">Continue</Button>}
    >
      <h1 className="st">Essay.</h1>
      <p className="ld">This step is optional. Write up to {ESSAY_WORD_LIMIT} words.</p>
      <div className={s.prompt}>
        <p className="lb">The prompt</p>
        {prompt ? <p className={s.promptText}>{prompt}</p> : null}
        {view.essayPrompt ? null : <p className={s.placeholder}>[Legacy essay prompt to confirm]</p>}
        {view.essayUse ? <p className={s.placeholder}>{view.essayUse}</p> : <p className={s.placeholder}>[How the essay is used, to confirm]</p>}
      </div>
      <div className={s.essay}>
        <label className="lb" htmlFor="essay">
          Your essay
        </label>
        <textarea
          id="essay"
          ref={box}
          className={showOver ? `${s.box} ${s.boxErr}` : s.box}
          value={text}
          maxLength={6000}
          aria-invalid={showOver ? true : undefined}
          aria-describedby="essay-count"
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
            auto.schedule({ essay: e.target.value.trim() ? e.target.value : null });
          }}
        />
        <div className={s.count} id="essay-count">
          <span>
            {showOver ? (
              <span className={s.overMsg}>
                <ErrorIcon />
                <span>Shorten your essay by {words - ESSAY_WORD_LIMIT} words to continue.</span>
              </span>
            ) : null}
          </span>
          <b>
            {words} of {ESSAY_WORD_LIMIT} words
          </b>
        </div>
      </div>
      {error ? (
        <p role="alert" style={{ marginTop: 16, fontSize: 15, fontWeight: 600 }}>
          {error}
        </p>
      ) : null}
    </ApplyShell>
  );
}
