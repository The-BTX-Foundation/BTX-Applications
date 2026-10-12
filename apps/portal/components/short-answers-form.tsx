'use client';

// Step 3: Short answers. Three required questions (SHORT_ANSWER_QUESTIONS in @btx/data), each with a live word count
// against the 250-word limit. Continue shows an error under every blank or too-long answer and moves focus to the
// first one; otherwise it saves and goes to Documents. Built in code first (2026-10-12) from the old essay step.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ErrorIcon } from '@btx/ui';
import { ANSWER_WORD_LIMIT, SHORT_ANSWER_QUESTIONS, type AppFile, type Application } from '@btx/data';
import type { CycleView } from '@/lib/cycle';
import { savedTime } from '@/lib/format';
import { DEMO_SAVED, demoDone, railSteps } from '@/lib/steps';
import { STRESS } from '@/lib/stress';
import { useAutosave } from '@/lib/use-autosave';
import { countWords } from '@/lib/words';
import { ApplyShell } from './apply-shell';
import s from './short-answers-form.module.css';

type Answers = [string, string, string];
const COLUMNS = ['answer_1', 'answer_2', 'answer_3'] as const;

// Sample answers for ?demo=1 review: a UMD mechanical engineering junior, one per question.
export const DEMO_ANSWERS: Answers = [
  `I've been part of my church in Hyattsville since I was nine. The summer after my freshman year, the wheelchair ramp by the side door cracked down the middle. Two of our older members stopped coming on Sundays because they couldn't get in safely. The repair quote was more than the congregation could pay, so my uncle and I measured the ramp ourselves, sketched a new design and priced the lumber and concrete.

I had just finished my first statics course, and the free-body diagrams from my homework turned into a real question: how much weight would this ramp carry? I checked the slope against the accessibility code and changed our plan twice. We rebuilt it over three weekends with six neighbors.

Afterward I wrote a one-page checklist so the church can inspect the ramp every spring. Both members came back that fall, and the neighborhood association has since asked me to look at four more ramps on our street.`,
  `Thermodynamics was the first class where my usual way of studying stopped working. I had always reread my notes and redone the homework, and that got me through calculus and statics. On the first exam I got a 58. I understood the examples in lecture, but when a problem looked new I didn't know where to start.

I went to office hours, and my professor asked me to talk through a problem out loud. I couldn't explain why I had picked my control volume. After that I changed three things. I started every problem by drawing the system and writing down what I knew before touching an equation. I joined a study group of four that met twice a week, where each of us had to explain one problem to the others. And I worked old exams under a timer instead of rereading.

I got an 81 on the second exam and finished the class with a B+. I still draw the system first in fluids this semester.`,
  `I want to make older public buildings accessible without huge renovation costs. Many buildings in Prince George's County still have entrances, ramps and restrooms that don't meet the current code, and the fixes get put off because each one is priced as a custom project.

This summer I worked with the facilities team on campus, surveying older buildings. I measured door widths, ramp slopes and handrail heights in fourteen buildings and wrote up every one that failed. Most of the problems repeated: the same ramp length, the same door hardware, the same missing landing.

That made me think a small set of standard, prefabricated parts could cover a lot of these fixes. This semester I'm taking a materials course and a CAD elective so I can design and test parts like that. I also asked the facilities manager if I can keep surveying one building a month during the school year, so I have real measurements to design against.`,
];

export function ShortAnswersForm({
  application,
  files,
  view,
  demo,
}: {
  application: Application | null;
  files: AppFile[];
  view: CycleView;
  /** Review mode: "1" (three sample answers) or "stress" (one at the limit, one over it, one long address). */
  demo?: string;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<Answers>(
    demo
      ? demo === 'stress'
        ? [...STRESS.answers]
        : DEMO_ANSWERS
      : [application?.answer_1 ?? '', application?.answer_2 ?? '', application?.answer_3 ?? ''],
  );
  // After Continue, blank answers show their error too (too-long ones always do).
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxes = useRef<(HTMLTextAreaElement | null)[]>([]);
  const auto = useAutosave(application?.id ?? null, application && application.updated_at !== application.created_at ? application.updated_at : null);
  const words = answers.map(countWords);
  const saved = demo ? DEMO_SAVED[3] : auto.failed ? "Couldn't save yet" : auto.savedAt ? `Saved ${savedTime(auto.savedAt)}` : undefined;

  // The message under answer i, or null when it is fine.
  function problem(i: number): string | null {
    const over = words[i] - ANSWER_WORD_LIMIT;
    if (over > 0) return `Shorten this answer by ${over} ${over === 1 ? 'word' : 'words'} to continue.`;
    if (submitted && words[i] === 0) return 'Answer this question to continue.';
    return null;
  }

  // Each box grows with its answer (from the 160px minimum).
  useLayoutEffect(() => {
    for (const el of boxes.current) {
      if (!el) continue;
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 3}px`;
    }
  }, [answers]);

  // In review mode the first box starts focused, as the old essay draft drew it.
  useEffect(() => {
    if (demo) boxes.current[0]?.focus();
  }, [demo]);

  // Updates one answer and schedules its autosave (a blank answer saves as null).
  function set(i: number, value: string) {
    const next = [...answers] as Answers;
    next[i] = value;
    setAnswers(next);
    setError(null);
    auto.schedule({ [COLUMNS[i]]: value.trim() ? value : null });
  }

  // Continue: blocked while any answer is blank or over the limit; otherwise save all three and go to Documents.
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
    const first = words.findIndex((w) => w === 0 || w > ANSWER_WORD_LIMIT);
    if (first >= 0) {
      boxes.current[first]?.focus();
      return;
    }
    const ok = await auto.flush({
      answer_1: answers[0],
      answer_2: answers[1],
      answer_3: answers[2],
      current_step: Math.max(application?.current_step ?? 1, 4),
    });
    if (ok) router.push('/apply/documents');
    else setError("We couldn't save your answers. Check your connection and try again.");
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
      <h1 className="st">Short answers.</h1>
      <p className="ld">Answer all three, up to {ANSWER_WORD_LIMIT} words each. Your answers help the board get to know you.</p>
      {SHORT_ANSWER_QUESTIONS.map((question, i) => {
        const id = `answer-${i + 1}`;
        const msg = problem(i);
        return (
          <div className={s.block} key={id}>
            <p className="lb">
              Question {i + 1} of {SHORT_ANSWER_QUESTIONS.length}
            </p>
            <label className={s.question} htmlFor={id}>
              {question}
            </label>
            <textarea
              id={id}
              ref={(el) => {
                boxes.current[i] = el;
              }}
              className={msg ? `${s.box} ${s.boxErr}` : s.box}
              value={answers[i]}
              maxLength={2500}
              aria-invalid={msg ? true : undefined}
              aria-describedby={msg ? `${id}-err ${id}-count` : `${id}-count`}
              onChange={(e) => set(i, e.target.value)}
            />
            <div className={s.count}>
              <span>
                {msg ? (
                  <span className={s.errMsg} id={`${id}-err`}>
                    <ErrorIcon />
                    <span>{msg}</span>
                  </span>
                ) : null}
              </span>
              <b id={`${id}-count`}>
                {words[i]} of {ANSWER_WORD_LIMIT} words
              </b>
            </div>
          </div>
        );
      })}
      {error ? (
        <p role="alert" style={{ marginTop: 16, fontSize: 15, fontWeight: 600 }}>
          {error}
        </p>
      ) : null}
    </ApplyShell>
  );
}
