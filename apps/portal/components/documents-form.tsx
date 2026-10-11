'use client';

// Step 4: Documents (drafts step5.html, step5-phone.html and the paused states step5-failed*.html). Two required PDFs:
// resume and unofficial transcript. Each uploads to the private bucket as `{user}/{application}/{kind}.pdf` and is
// recorded in application_files. States per file: empty, uploading (progress, Cancel), paused or failed (Try again,
// Choose a different file), uploaded (View, Replace).
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, ErrorIcon, ErrorSummary, Icon, type SummaryItem } from '@btx/ui';
import {
  checkPdf,
  getAuthMode,
  getBrowserClient,
  uploadDocument,
  viewUrl,
  type AppFile,
  type Application,
  type DocKind,
  type UploadHandle,
} from '@btx/data';
import type { CycleView } from '@/lib/cycle';
import { savedTime } from '@/lib/format';
import { DEMO_SAVED, demoDone, railSteps } from '@/lib/steps';
import { STRESS } from '@/lib/stress';
import { useAutosave } from '@/lib/use-autosave';
import { ApplyShell } from './apply-shell';
import { FileName } from './text';
import s from './documents-form.module.css';

type Slot =
  | { phase: 'empty' }
  | { phase: 'done'; name: string; size: number; at: string; path: string | null }
  | { phase: 'uploading'; name: string; sent: number; total: number }
  | { phase: 'paused'; name: string; sent: number; total: number; offline: boolean };

const KINDS: { kind: DocKind; label: string; missing: string }[] = [
  { kind: 'resume', label: 'Resume', missing: 'Upload your resume to continue.' },
  { kind: 'transcript', label: 'Unofficial transcript', missing: 'Upload your unofficial transcript to continue.' },
];

// 184320 -> "180 KB"; 3460000 -> "3.3 MB".
function size(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
const mb = (bytes: number) => (bytes / 1024 / 1024).toFixed(1);

// A saved file as a slot.
function slotFrom(f: AppFile): Slot {
  return { phase: 'done', name: f.filename, size: f.size_bytes, at: f.uploaded_at, path: f.storage_path };
}

// The states the drafts draw, for ?demo review: resume uploaded and the transcript empty, uploading or paused.
function demoSlots(demo: string): Record<DocKind, Slot> {
  if (demo === 'stress' || demo === 'failed-stress' || demo === 'stress-uploading') {
    const resume: Slot = { phase: 'done', name: STRESS.resume.name, size: STRESS.resume.size, at: STRESS.resume.at, path: null };
    if (demo === 'stress-uploading') return { resume, transcript: { phase: 'uploading', name: STRESS.transcript.name, sent: 6.3 * 1048576, total: STRESS.transcript.size } };
    if (demo === 'stress') return { resume, transcript: { phase: 'done', name: STRESS.transcript.name, size: STRESS.transcript.size, at: STRESS.transcript.at, path: null } };
    return { resume, transcript: { phase: 'paused', name: STRESS.transcript.name, sent: 2.1 * 1048576, total: STRESS.transcript.size, offline: true } };
  }
  const resume: Slot = { phase: 'done', name: 'Coleman_Resume.pdf', size: 184 * 1024, at: '2026-09-12T20:31:00Z', path: null };
  const name = 'Coleman_Unofficial_Transcript.pdf';
  if (demo === 'uploading') return { resume, transcript: { phase: 'uploading', name, sent: 2.1 * 1048576, total: 3.3 * 1048576 } };
  if (demo === 'failed') return { resume, transcript: { phase: 'paused', name, sent: 2.1 * 1048576, total: 3.3 * 1048576, offline: true } };
  return { resume, transcript: { phase: 'empty' } };
}

export function DocumentsForm({
  application,
  files,
  view,
  userId,
  demo,
}: {
  application: Application | null;
  files: AppFile[];
  view: CycleView;
  userId?: string;
  /** Review mode: "1" or "empty", "uploading" or "failed". */
  demo?: string;
}) {
  const router = useRouter();
  const [slots, setSlots] = useState<Record<DocKind, Slot>>(() => {
    if (demo) return demoSlots(demo);
    const find = (k: DocKind) => files.find((f) => f.kind === k);
    const r = find('resume');
    const t = find('transcript');
    return { resume: r ? slotFrom(r) : { phase: 'empty' }, transcript: t ? slotFrom(t) : { phase: 'empty' } };
  });
  const [problems, setProblems] = useState<Partial<Record<DocKind, string>>>({});
  const [summary, setSummary] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const handles = useRef<Partial<Record<DocKind, UploadHandle>>>({});
  const chosen = useRef<Partial<Record<DocKind, File>>>({});
  const inputs = useRef<Partial<Record<DocKind, HTMLInputElement | null>>>({});
  const summaryRef = useRef<HTMLDivElement>(null);
  const auto = useAutosave(application?.id ?? null, application && application.updated_at !== application.created_at ? application.updated_at : null);
  const saved = demo ? DEMO_SAVED[4] : auto.failed ? "Couldn't save yet" : auto.savedAt ? `Saved ${savedTime(auto.savedAt)}` : undefined;

  // What a screen reader hears: when an upload starts, stops, or finishes (not every progress tick).
  const live = (() => {
    const list = KINDS.map(({ kind }) => slots[kind]);
    const up = list.find((x) => x.phase === 'uploading');
    if (up && up.phase === 'uploading') return `Uploading ${up.name}.`;
    const paused = list.find((x) => x.phase === 'paused');
    if (paused && paused.phase === 'paused') return `Upload of ${paused.name} did not finish.`;
    const n = list.filter((x) => x.phase === 'done').length;
    return `${n} of 2 documents uploaded.${saved ? ` ${saved}.` : ''}`;
  })();

  const setSlot = (k: DocKind, v: Slot) => setSlots((p) => ({ ...p, [k]: v }));
  const setProblem = (k: DocKind, m: string | undefined) => setProblems((p) => ({ ...p, [k]: m }));

  // Starts (or restarts) an upload of the chosen file.
  async function start(kind: DocKind, file: File) {
    chosen.current[kind] = file;
    setProblem(kind, undefined);
    setSlot(kind, { phase: 'uploading', name: file.name, sent: 0, total: file.size });
    // mock mode: pretend to upload so the screens can be reviewed without a database
    if (getAuthMode() === 'mock' || !application || !userId) {
      for (let i = 1; i <= 4; i++) {
        await new Promise((r) => setTimeout(r, 250));
        setSlot(kind, { phase: 'uploading', name: file.name, sent: (file.size * i) / 4, total: file.size });
      }
      setSlot(kind, { phase: 'done', name: file.name, size: file.size, at: new Date().toISOString(), path: null });
      return;
    }
    const handle = uploadDocument(getBrowserClient(), {
      userId,
      applicationId: application.id,
      kind,
      file,
      onProgress: (sent, total) => setSlot(kind, { phase: 'uploading', name: file.name, sent, total }),
    });
    handles.current[kind] = handle;
    try {
      const row = await handle.done;
      delete chosen.current[kind];
      setSlot(kind, slotFrom(row));
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'cancelled') {
        setSlot(kind, { phase: 'empty' });
        return;
      }
      setSlots((p) => {
        const cur = p[kind];
        const sent = cur.phase === 'uploading' ? cur.sent : 0;
        return { ...p, [kind]: { phase: 'paused', name: file.name, sent, total: file.size, offline: msg === 'network' || !navigator.onLine } };
      });
      if (msg !== 'network') setProblem(kind, "We couldn't upload that file. Try again, or choose a different one.");
    } finally {
      delete handles.current[kind];
    }
  }

  // A file was picked or dropped: check it, then upload it.
  function choose(kind: DocKind, file: File | undefined) {
    if (!file) return;
    const bad = checkPdf(file);
    if (bad) {
      setProblem(kind, bad);
      return;
    }
    void start(kind, file);
  }

  // Opens an uploaded file in a new tab (a short-lived signed link).
  async function view_(path: string | null) {
    if (!path) return;
    const url = await viewUrl(getBrowserClient(), path);
    if (url) window.open(url, '_blank', 'noopener');
  }

  const items: SummaryItem[] = summary
    ? KINDS.flatMap(({ kind, label, missing }) => (slots[kind].phase === 'done' ? [] : [{ fieldId: `${kind}-pick`, message: `${label}: ${missing}` }]))
    : [];

  // Continue: both files must be uploaded; then save progress and go to Review.
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSummary(true);
    const missing = KINDS.filter(({ kind }) => slots[kind].phase !== 'done');
    if (missing.length) {
      setTimeout(() => {
        summaryRef.current?.scrollIntoView({ block: 'center' });
        summaryRef.current?.focus({ preventScroll: true });
      }, 0);
      return;
    }
    const ok = await auto.flush({ current_step: Math.max(application?.current_step ?? 1, 5) });
    if (ok) router.push('/apply/review');
    else setSaveError("We couldn't save your progress. Check your connection and try again.");
  }

  return (
    <ApplyShell
      current={4}
      steps={railSteps(application, files, 4, demo ? demoDone(4) : undefined)}
      view={view}
      accountName={demo ? (demo.includes('stress') ? STRESS.name : 'Ebony Coleman') : application?.full_name || 'Your account'}
      saved={saved}
      onSubmit={onSubmit}
      backHref="/apply/essay"
      live={live}
      primary={<Button type="submit">Continue</Button>}
    >
      <h1 className="st">Documents.</h1>
      <p className="ld">Upload two PDFs. Both are required.</p>
      {items.length ? (
        <div className={s.summary}>
          <ErrorSummary items={items} ref={summaryRef} />
        </div>
      ) : null}
      {KINDS.map(({ kind, label, missing }) => {
        const slot = slots[kind];
        const showMissing = summary && slot.phase !== 'done' && slot.phase !== 'uploading';
        const problem = problems[kind] ?? (showMissing ? missing : undefined);
        return (
          <div className={s.block} key={kind}>
            <p className="lb">{label}</p>
            {kind === 'transcript' ? (
              <p className="hint">
                Download it from{' '}
                <a href="https://www.testudo.umd.edu" className="lk" target="_blank" rel="noopener noreferrer">
                  Testudo <Icon name="ext" small />
                </a>
                .
              </p>
            ) : null}
            <input
              ref={(el) => {
                inputs.current[kind] = el;
              }}
              type="file"
              accept="application/pdf,.pdf"
              className="sr-only"
              tabIndex={-1}
              aria-label={`Choose a PDF for ${label}`}
              onChange={(e) => {
                choose(kind, e.target.files?.[0]);
                e.target.value = '';
              }}
            />
            {slot.phase === 'done' ? (
              <div className={s.row}>
                <span className={s.icon}>
                  <Icon name="file" />
                </span>
                <div className={s.meta}>
                  <b>
                    <FileName>{slot.name}</FileName>
                  </b>
                  <span>
                    PDF, {size(slot.size)}. Uploaded {savedTime(slot.at)}.
                  </span>
                </div>
                <span className={s.ok}>
                  <Icon name="check" />
                  Uploaded
                </span>
                <div className={s.actions}>
                  <button type="button" className="lk" onClick={() => void view_(slot.path)}>
                    View
                  </button>
                  <button type="button" className="lk" id={`${kind}-pick`} onClick={() => inputs.current[kind]?.click()}>
                    Replace
                  </button>
                </div>
              </div>
            ) : slot.phase === 'empty' ? (
              <div
                className={s.zone}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  choose(kind, e.dataTransfer.files?.[0]);
                }}
              >
                <span className={s.dropIcon}>
                  <Icon name="upload" />
                </span>
                <p className={s.drag}>Drag your PDF here, or</p>
                <button type="button" className="btn s" id={`${kind}-pick`} onClick={() => inputs.current[kind]?.click()}>
                  Choose a file
                </button>
                <small>PDF only, up to 10 MB.</small>
              </div>
            ) : (
              <div className={s.row}>
                <span className={s.icon}>
                  <Icon name="file" />
                </span>
                <div className={`${s.meta} ${s.wide}`}>
                  <b>
                    <FileName>{slot.name}</FileName>
                  </b>
                  <div className={s.track}>
                    <div style={{ width: `${Math.min(100, Math.round((slot.sent / Math.max(1, slot.total)) * 100))}%` }} />
                  </div>
                  <div className={slot.phase === 'paused' ? `${s.up} ${s.paused}` : s.up}>
                    {slot.phase === 'uploading' ? (
                      <>
                        <span>
                          Uploading. {mb(slot.sent)} of {mb(slot.total)}&nbsp;MB.
                        </span>
                        <button type="button" className="lk" onClick={() => handles.current[kind]?.cancel()}>
                          Cancel
                        </button>
                      </>
                    ) : (
                      <>
                        <span>
                          Paused at {mb(slot.sent)} of {mb(slot.total)}&nbsp;MB.{' '}
                          {slot.offline ? "It picks up again when you're back online." : 'Try again, or choose a different file.'}
                        </span>
                        <span className={s.upActions}>
                          {slot.offline ? null : (
                            <button
                              type="button"
                              className="lk"
                              onClick={() => chosen.current[kind] && void start(kind, chosen.current[kind]!)}
                            >
                              Try again
                            </button>
                          )}
                          <button type="button" className="lk" id={`${kind}-pick`} onClick={() => inputs.current[kind]?.click()}>
                            Choose a different file
                          </button>
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
            {problem ? (
              <p className="em" role="alert" style={{ marginTop: 8 }}>
                <ErrorIcon />
                <span>{problem}</span>
              </p>
            ) : null}
          </div>
        );
      })}
      <p className={s.note}>Files stay saved to your account. You can replace them until you submit.</p>
      {saveError ? (
        <p role="alert" style={{ marginTop: 16, fontSize: 15, fontWeight: 600 }}>
          {saveError}
        </p>
      ) : null}
    </ApplyShell>
  );
}
