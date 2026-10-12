// Word counting for the short answers: a word is any run of characters between spaces or line breaks. The limit
// itself is ANSWER_WORD_LIMIT in @btx/data.
export function countWords(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}
