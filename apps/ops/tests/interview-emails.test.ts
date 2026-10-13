import { describe, expect, it } from 'vitest';
import { bookedEmail, cancelEmail, easternWhen, groupQuestions, prepEmail, rebalanceEmail, reminderEmail, videoLinkEmail } from '@btx/emails';

const base = { term: 'Fall 2026', award: 'Legacy Scholarship', origin: 'https://apply.example.org', code: 'APP-2026-00015', applicantName: 'Ada Okafor', startsAt: '2026-11-12T00:00:00Z', endsAt: '2026-11-12T00:30:00Z' };

describe('Eastern times', () => {
  it('writes an instant as Eastern wall time', () => {
    expect(easternWhen('2026-11-12T00:00:00Z')).toBe('Wed Nov 11, 7:00 PM'); // EST
    expect(easternWhen('2026-10-12T23:00:00Z')).toBe('Mon Oct 12, 7:00 PM'); // EDT
  });
});

describe('groupQuestions', () => {
  it('groups by criterion name in the rubric order and puts "To close" last', () => {
    const g = groupQuestions(
      [
        { criterionKey: null, position: 0, text: 'Anything to add?' },
        { criterionKey: 'impact', position: 1, text: 'Second' },
        { criterionKey: 'impact', position: 0, text: 'First' },
        { criterionKey: 'community', position: 0, text: 'Community Q' },
      ],
      [
        { key: 'community', name: 'Community', position: 0 },
        { key: 'impact', name: 'Impact', position: 1 },
      ],
    );
    expect(g).toEqual([
      { title: 'Community', questions: ['Community Q'] },
      { title: 'Impact', questions: ['First', 'Second'] },
      { title: 'To close', questions: ['Anything to add?'] },
    ]);
  });
});

describe('prep email', () => {
  const input = {
    ...base,
    firstName: 'Kelsey',
    otherName: 'Tomi Falodun',
    videoUrl: 'https://meet.google.com/qvr-hwbn-xme',
    answers: ['I tutor in Bowie.', null, 'Stormwater.'],
    scorecardUrl: 'https://ops.example.org/scholarships/scoring',
    questions: [{ title: 'Community', questions: ['Tell us about it.'] }, { title: 'To close', questions: ['Questions for us?'] }],
  };
  it('has the time, the other interviewer, the full name and code, the link, the answers, the scorecard and the questions', () => {
    const r = prepEmail(input);
    expect(r.subject).toBe('Your BTX interview tomorrow: Ada Okafor, APP-2026-00015 at 7:00 PM');
    for (const part of [r.html, r.text]) {
      expect(part).toContain('Tomorrow at 7:00 PM.');
      expect(part).toContain('Ada Okafor');
      expect(part).toContain('APP-2026-00015');
      expect(part).toContain('Tomi Falodun');
      expect(part).toContain('meet.google.com/qvr-hwbn-xme');
      expect(part).toContain('I tutor in Bowie.');
      expect(part).toContain('Stormwater.');
      expect(part).toContain('https://ops.example.org/scholarships/scoring');
      expect(part).toContain('Tell us about it.');
      expect(part).toContain('To close');
    }
    expect(r.html).toContain('Wed Nov 11 · 30 minutes');
    expect(r.html.indexOf('Community')).toBeLessThan(r.html.indexOf('To close'));
  });
  it('uses the full name, never initials', () => {
    expect(prepEmail(input).html).not.toMatch(/\(A\.O\.\)/);
  });
  it('says the link is coming when there is none', () => {
    const r = prepEmail({ ...input, videoUrl: null });
    expect(r.html).toContain('The video link will come before the interview.');
    expect(r.text).toContain('The video link will come before the interview.');
  });
  it('escapes what an applicant wrote', () => {
    expect(prepEmail({ ...input, answers: ['<script>alert(1)</script>', null, null] }).html).not.toContain('<script>alert');
  });
});

describe('reminder email', () => {
  const input = { ...base, firstName: 'Ebony Coleman', videoUrl: 'https://meet.google.com/xke-pfrd-tqa', interviewers: ['Cillisha Knights', 'Darien Strachan'], changeUrl: 'https://apply.example.org/status/change' };
  it('has the time, link, interviewer names and the change link', () => {
    const r = reminderEmail(input);
    expect(r.subject).toBe('Your BTX interview is tomorrow at 7:00 PM');
    expect(r.html).toContain('Tomorrow at 7:00 PM, Ebony.');
    expect(r.html).toContain('Cillisha Knights and Darien Strachan will interview you.');
    expect(r.html).toContain('Join the video call');
    expect(r.html).toContain('https://apply.example.org/status/change');
    expect(r.text).toContain('Change your time: https://apply.example.org/status/change');
  });
  it('never mentions other awards', () => {
    const r = reminderEmail(input);
    expect(r.html + r.text).not.toMatch(/think big|other award|another award/i);
  });
});

describe('booked, video link, rebalance, cancel', () => {
  it('booked: the student subject names the time', () => {
    const r = bookedEmail({ ...base, audience: 'student', firstName: 'Ada', videoUrl: null, others: ['A One', 'B Two'], changeUrl: 'https://apply.example.org/status/change' });
    expect(r.subject).toBe('Your interview is booked: Wed Nov 11, 7:00 PM');
    expect(r.html).toContain('A One and B Two will interview you.');
    expect(r.html).toContain('A calendar invite is attached');
  });
  it('booked: an interviewer sees the applicant and the other interviewer', () => {
    const r = bookedEmail({ ...base, audience: 'interviewer', firstName: 'Kelsey', videoUrl: null, others: ['Tomi Falodun'] });
    expect(r.html).toContain('You and Tomi Falodun interview Ada Okafor');
  });
  it('video link: has the link and a join button', () => {
    const r = videoLinkEmail({ ...base, audience: 'student', firstName: 'Ada', videoUrl: 'https://zoom.us/j/1' });
    expect(r.subject).toBe('Video link for Wed Nov 11, 7:00 PM');
    expect(r.html).toContain('https://zoom.us/j/1');
    expect(r.html).toContain('Join the video call');
  });
  it('rebalance: added and removed', () => {
    const a = rebalanceEmail({ ...base, change: 'added', firstName: 'Kelsey', videoUrl: null, otherName: 'Tomi Falodun', scorecardUrl: 'https://ops.example.org/scholarships/scoring' });
    expect(a.subject).toBe("You're now interviewing Ada Okafor, Wed Nov 11, 7:00 PM");
    expect(a.html).toContain('You and Tomi Falodun interview Ada Okafor');
    const r = rebalanceEmail({ ...base, change: 'removed', firstName: 'Kelsey', videoUrl: null });
    expect(r.subject).toBe("You're no longer interviewing Ada Okafor, Wed Nov 11, 7:00 PM");
    expect(r.html).not.toContain('Open the scorecard');
  });
  it('cancel', () => {
    const r = cancelEmail({ ...base, firstName: 'Kelsey' });
    expect(r.subject).toBe('Interview cancelled: Wed Nov 11, 7:00 PM');
    expect(r.html).toContain('Ada Okafor');
  });
});
