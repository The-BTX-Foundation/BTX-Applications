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
