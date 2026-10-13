import { describe, expect, it } from 'vitest';
import { buildInterviewIcs, foldLine, icsAttachment, icsEscape } from '@btx/emails';

const input = {
  applicationId: 'app-123',
  method: 'REQUEST' as const,
  startsAt: '2026-11-12T00:00:00Z',
  endsAt: '2026-11-12T00:30:00Z',
  description: 'Interview with Ada, Okafor; APP-1\nVideo call',
  videoUrl: 'https://meet.google.com/abc-defg-hij',
  attendees: [{ email: 'ada@terpmail.umd.edu', name: 'Ada Okafor' }],
  now: new Date('2026-11-09T14:00:00Z'),
};

describe('buildInterviewIcs', () => {
  const ics = buildInterviewIcs(input);
  const lines = ics.split('\r\n');

  it('is one calendar with one event, CRLF line endings', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    expect(lines.filter((l) => l === 'BEGIN:VCALENDAR')).toHaveLength(1);
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines).toContain('METHOD:REQUEST');
  });
  it('has the stable UID, UTC times, summary, organizer and attendee', () => {
    expect(lines).toContain('UID:interview-app-123@thebtxfoundation.org');
    expect(lines).toContain('DTSTART:20261112T000000Z');
    expect(lines).toContain('DTEND:20261112T003000Z');
    expect(lines).toContain('SUMMARY:BTX scholarship interview');
    expect(ics).toContain('mailto:info@thebtxfoundation.org');
    expect(ics.replace(/\r\n /g, '')).toContain('ATTENDEE;CN="Ada Okafor";ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:ada@terpmail.umd.edu');
  });
  it('puts the video link in URL and LOCATION and escapes the description', () => {
    expect(lines).toContain('URL:https://meet.google.com/abc-defg-hij');
    expect(ics).toContain('LOCATION:https://meet.google.com/abc-defg-hij');
    expect(ics).toContain('DESCRIPTION:Interview with Ada\\, Okafor\; APP-1\\nVideo call');
  });
  it('leaves out URL and LOCATION without a link', () => {
    const none = buildInterviewIcs({ ...input, videoUrl: null });
    expect(none).not.toMatch(/^URL:|LOCATION:/m);
  });
  it('bumps SEQUENCE on a later send and CANCEL says CANCELLED', () => {
    const a = buildInterviewIcs(input);
    const b = buildInterviewIcs({ ...input, now: new Date('2026-11-09T15:00:00Z') });
    const seq = (s: string) => Number(/SEQUENCE:(\d+)/.exec(s)![1]);
    expect(seq(b)).toBeGreaterThan(seq(a));
    expect(buildInterviewIcs({ ...input, sequence: 7 })).toContain('SEQUENCE:7');
    const c = buildInterviewIcs({ ...input, method: 'CANCEL' });
    expect(c).toContain('METHOD:CANCEL');
    expect(c).toContain('STATUS:CANCELLED');
  });
  it('folds every line to 75 octets or fewer', () => {
    const long = buildInterviewIcs({ ...input, description: 'x'.repeat(300) + ' é'.repeat(80) });
    for (const l of long.split('\r\n')) expect(new TextEncoder().encode(l).length).toBeLessThanOrEqual(75);
  });
});

describe('foldLine and icsEscape', () => {
  it('unfolding gives the original line, and no multi-byte character is split', () => {
    const line = 'DESCRIPTION:' + 'é'.repeat(100);
    const folded = foldLine(line);
    expect(folded.split('\r\n').every((l, i) => new TextEncoder().encode(l).length <= 75 && (i === 0 || l.startsWith(' ')))).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
  it('escapes backslash, semicolon, comma and newline', () => {
    expect(icsEscape('a\\b;c,d\ne')).toBe('a\\\\b\;c\\,d\\ne');
  });
});

describe('icsAttachment', () => {
  it('is base64 with the method in the content type', () => {
    const a = icsAttachment('BEGIN:VCALENDAR\r\n', 'CANCEL');
    expect(Buffer.from(a.content, 'base64').toString()).toBe('BEGIN:VCALENDAR\r\n');
    expect(a.contentType).toContain('method=CANCEL');
    expect(a.filename).toBe('btx-interview.ics');
  });
});
