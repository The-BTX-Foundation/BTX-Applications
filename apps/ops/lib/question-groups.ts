// Interview questions under their scoring criteria (pure, safe in the browser).

export type QuestionRow = { id: string; text: string };
/** One scoring criterion (or "To close") with its questions. */
export type QuestionGroup = { key: string | null; name: string; /** "20 points", or "Not scored" for "To close". */ points: string; questions: QuestionRow[] };
export const TO_CLOSE = 'To close';

/** Puts questions under their criteria (in the rubric's order) and the rest under "To close". */
export function groupQuestions(rubric: { key: string; name: string; weight: number }[], questions: { id: string; criterionKey: string | null; text: string }[]): QuestionGroup[] {
  const groups: QuestionGroup[] = rubric.map((c) => ({ key: c.key, name: c.name, points: `${c.weight} points`, questions: questions.filter((q) => q.criterionKey === c.key).map(({ id, text }) => ({ id, text })) }));
  groups.push({ key: null, name: TO_CLOSE, points: 'Not scored', questions: questions.filter((q) => q.criterionKey === null).map(({ id, text }) => ({ id, text })) });
  return groups;
}

