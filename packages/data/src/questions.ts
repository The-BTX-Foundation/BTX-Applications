// The three short-answer questions on every application (step 3), in order; answer_1 to answer_3 hold the replies.
export const SHORT_ANSWER_QUESTIONS = [
  "Tell us about a community you're part of, on campus or off. What have you done to make it stronger?",
  'Think of a class that pushed you. What did you change about how you studied, and how did it turn out?',
  "What problem do you want to work on in your career? What's one step you're taking toward it now?",
] as const;

// Each answer's word limit (checked in the Portal; the database only caps characters).
export const ANSWER_WORD_LIMIT = 400;
