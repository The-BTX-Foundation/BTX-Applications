// The five application steps: names, routes, and the status each one shows in the rail.
import type { Step } from '@btx/ui';
import type { Application, AppFile } from '@btx/data';
import { ORDER, fieldError, fromApplication } from './basic-info';
import { countWords } from './words';

export const STEP_NAMES = ['Basic info', 'Scholarship and programs', 'Essay', 'Documents', 'Review and submit'] as const;
export const STEP_PATHS = ['/apply/basic-info', '/apply/scholarship', '/apply/essay', '/apply/documents', '/apply/review'] as const;

// The route for a step number (1 to 5).
export function stepPath(step: number): string {
  return STEP_PATHS[Math.min(Math.max(step, 1), 5) - 1];
}

// Which steps have their required answers complete (index 0 = step 1).
export function stepsDone(app: Application | null, files: AppFile[]): boolean[] {
  if (!app) return [false, false, false, false, false];
  const v = fromApplication(app);
  const basic = ORDER.every((k) => fieldError(k, v) === null);
  const kinds = new Set(files.map((f) => f.kind));
  return [basic, app.current_step > 2, countWords(app.essay ?? '') > 0, kinds.has('resume') && kinds.has('transcript'), false];
}

// The rail's step list for the page the student is on. Finished steps link back; the essay says "Optional" until written.
export function railSteps(app: Application | null, files: AppFile[], current: number, demoDone?: boolean[]): Step[] {
  const done = demoDone ?? stepsDone(app, files);
  return STEP_NAMES.map((name, i) => ({
    name,
    done: done[i],
    href: i + 1 !== current && done[i] ? STEP_PATHS[i] : undefined,
    status: i + 1 === current ? 'In progress' : done[i] ? 'Done' : i === 2 ? 'Optional' : 'Not started',
  }));
}


// Review-mode (?demo) rail data: the drafts show the steps before the current one as done, with these save times.
export function demoDone(step: number): boolean[] {
  return [0, 1, 2, 3, 4].map((i) => i < step - 1);
}
export const DEMO_SAVED: Record<number, string> = { 1: 'Saved 4:12 PM', 2: 'Saved 4:21 PM', 3: 'Saved 4:26 PM', 4: 'Saved 4:31 PM', 5: 'Saved 4:49 PM' };
