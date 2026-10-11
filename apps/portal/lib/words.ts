// Word counting for the essay: a word is any run of characters between spaces or line breaks.
export const ESSAY_WORD_LIMIT = 500;

export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
