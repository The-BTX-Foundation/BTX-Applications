// Calendar invites for the interview emails: one VCALENDAR with one VEVENT, so "Add to calendar" and Accept work in
// Google Calendar, Outlook and Apple Calendar. Pure functions that return strings.
//
// METHOD:REQUEST creates or updates the event; METHOD:CANCEL removes it. The UID is stable per slot
// (slot-<slotId>@thebtxfoundation.org), so a later invite for the same slot updates the same calendar entry. SEQUENCE
// must go up on every change: it defaults to the time of the send in whole seconds, which only ever grows.
// Lines end in CRLF, are folded at 75 octets and have commas, semicolons, backslashes and newlines escaped (RFC 5545).

export type IcsAttendee = { email: string; name?: string };

export type InterviewIcsInput = {
  slotId: string;
  method: 'REQUEST' | 'CANCEL';
  /** ISO start and end; written in UTC. */
  startsAt: string;
  endsAt: string;
  description: string;
  /** The video link, when there is one; becomes URL and LOCATION. */
  videoUrl?: string | null;
  attendees: IcsAttendee[];
  /** Bumps on every change to the event. Defaults to `now` in whole seconds. */
  sequence?: number;
  now?: Date;
};

export const ICS_ORGANIZER = 'info@thebtxfoundation.org';
export const ICS_SUMMARY = 'BTX scholarship interview';

const stamp = (iso: string | Date) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');

/** Escapes a TEXT value: backslash, semicolon, comma and newlines. */
export function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r\n|\r|\n/g, '\\n');
}

const enc = new TextEncoder();

/** Folds one content line at 75 octets: continuation lines start with one space. Never splits a multi-byte character. */
export function foldLine(line: string): string {
  if (enc.encode(line).length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let bytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (bytes + n > limit) {
      out.push(cur);
      cur = '';
      bytes = 0;
      limit = 74; // the leading space counts as one octet
    }
    cur += ch;
    bytes += n;
  }
  out.push(cur);
  return out.join('\r\n ');
}

// A parameter value in quotes, with quotes removed (they cannot be escaped).
const param = (s: string) => `"${s.replace(/"/g, "'")}"`;

export function buildInterviewIcs(i: InterviewIcsInput): string {
  const now = i.now ?? new Date();
  const cancel = i.method === 'CANCEL';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The BTX Foundation//Scholarship interviews//EN',
    'CALSCALE:GREGORIAN',
    `METHOD:${i.method}`,
    'BEGIN:VEVENT',
    `UID:slot-${i.slotId}@thebtxfoundation.org`,
    `SEQUENCE:${i.sequence ?? Math.floor(now.getTime() / 1000)}`,
    `DTSTAMP:${stamp(now)}`,
    `DTSTART:${stamp(i.startsAt)}`,
    `DTEND:${stamp(i.endsAt)}`,
    `SUMMARY:${icsEscape(ICS_SUMMARY)}`,
    `DESCRIPTION:${icsEscape(i.description)}`,
    ...(i.videoUrl ? [`URL:${i.videoUrl}`, `LOCATION:${icsEscape(i.videoUrl)}`] : []),
    `ORGANIZER;CN=${param('The BTX Foundation')}:mailto:${ICS_ORGANIZER}`,
    ...i.attendees.map((a) => `ATTENDEE;CN=${param(a.name || a.email)};ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=FALSE:mailto:${a.email}`),
    `STATUS:${cancel ? 'CANCELLED' : 'CONFIRMED'}`,
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldLine).join('\r\n') + '\r\n';
}

/** The attachment for sendMail: the .ics as a file, with the METHOD in the content type so mail apps show Accept. */
export function icsAttachment(ics: string, method: 'REQUEST' | 'CANCEL', filename = 'btx-interview.ics') {
  return { filename, content: Buffer.from(ics, 'utf8').toString('base64'), contentType: `text/calendar; charset=utf-8; method=${method}` };
}
