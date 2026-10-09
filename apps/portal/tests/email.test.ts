import { describe, expect, it } from 'vitest';
import { confirmationHtml, confirmationSubject, confirmationText, esc, type ConfirmationInput } from '@/lib/email/confirmation';

const input: ConfirmationInput = {
  firstName: 'Ebony',
  to: 'ecoleman@terpmail.umd.edu',
  code: 'APP-2026-00016',
  submittedLabel: 'Sat Sep 12, 4:52 PM',
  term: 'Fall 2026',
  award: 'Legacy Scholarship',
  interviewWeeks: 'Sep 15 to Oct 9',
  decisionDate: 'Fri Oct 23',
  statusUrl: 'https://apply.example.org/status',
  helpEmail: 'info@thebtxfoundation.org',
};

describe('confirmation email', () => {
  it('names the application number in the subject, the html and the text', () => {
    expect(confirmationSubject(input)).toContain('APP-2026-00016');
    expect(confirmationHtml(input)).toContain('APP-2026-00016');
    expect(confirmationText(input)).toContain('APP-2026-00016');
  });
  it('links to the status page and says what happens next', () => {
    const html = confirmationHtml(input);
    expect(html).toContain('href="https://apply.example.org/status"');
    expect(html).toContain('Sep 15 to Oct 9');
    expect(html).toContain('Fri Oct 23');
    expect(confirmationText(input)).toContain('https://apply.example.org/status');
  });
  it('escapes anything a student typed', () => {
    const html = confirmationHtml({ ...input, firstName: '<script>alert(1)</script>' });
    expect(html).not.toContain('<script>alert');
    expect(esc('a & "b" <c>')).toBe('a &amp; &quot;b&quot; &lt;c&gt;');
  });
});

import { bookHtml, bookSubject, bookText, notPickedHtml, notPickedText, wonHtml, wonSubject, wonText } from '@/lib/email/journey';

const base = { firstName: 'Ebony', to: 'ecoleman@terpmail.umd.edu', code: 'APP-2026-00016', term: 'Fall 2026', award: 'Legacy Scholarship', origin: 'https://apply.example.org', helpEmail: 'info@thebtxfoundation.org' };

describe('book your interview email', () => {
  const i = { ...base, bookBy: 'Fri Oct 9' };
  it('puts the deadline in the subject and links straight to the booking page', () => {
    expect(bookSubject(i)).toBe('Schedule your interview by Fri Oct 9');
    expect(bookHtml(i)).toContain('href="https://apply.example.org/status/schedule"');
    expect(bookText(i)).toContain('https://apply.example.org/status/schedule');
  });
  it('uses the drafts\' copy', () => {
    const html = bookHtml(i);
    expect(html).toContain('Interview times are open.');
    expect(html).toContain('Hi Ebony, please pick one by Fri Oct 9.');
    expect(html).toContain("None of the times work? Tell us when you're free on that page.");
  });
  it('escapes a typed name', () => {
    expect(bookHtml({ ...i, firstName: '<b>x</b>' })).not.toContain('<b>x</b>');
  });
});

describe('decision emails', () => {
  it('the winner email says Congratulations and links to the photo and story page', () => {
    const i = { ...base, amount: '$2,000', photoDue: 'Fri Nov 6' };
    expect(wonSubject(i)).toBe('You won the Legacy Scholarship');
    const html = wonHtml(i);
    expect(html).toContain('Congratulations, Ebony.');
    expect(html).toContain('$2,000');
    expect(html).toContain('href="https://apply.example.org/status/story"');
    expect(wonText(i)).toContain('Congratulations, Ebony.');
  });
  it('the not-picked email never mentions other awards, trips, or selling', () => {
    const html = notPickedHtml(base) + notPickedText(base);
    expect(html).toContain('Thank you, Ebony.');
    expect(html).not.toMatch(/other award|another award|empowerment|trip/i);
    expect(html).not.toMatch(/Congratulations/);
  });
  it('every journey email uses LinkedIn, never X', () => {
    for (const h of [bookHtml({ ...base, bookBy: 'x' }), wonHtml({ ...base, amount: 'a', photoDue: 'b' }), notPickedHtml(base)]) {
      expect(h).toContain('LinkedIn');
      expect(h).not.toMatch(/twitter|\bX\b \(/i);
    }
  });
});
