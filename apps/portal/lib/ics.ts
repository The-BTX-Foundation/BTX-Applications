// A one-event calendar file (.ics) for her interview, so "Add to calendar" works in any calendar app. Pure function.
export type IcsInput = { uid: string; startsAt: string; endsAt: string; title: string; description: string; now?: Date };

const stamp = (iso: string | Date) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;');

export function buildIcs(i: IcsInput): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//The BTX Foundation//Scholarship Portal//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${i.uid}@thebtxfoundation.org`,
    `DTSTAMP:${stamp(i.now ?? new Date())}`,
    `DTSTART:${stamp(i.startsAt)}`,
    `DTEND:${stamp(i.endsAt)}`,
    `SUMMARY:${esc(i.title)}`,
    `DESCRIPTION:${esc(i.description)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

/** A data: link the browser downloads as a file. */
export function icsHref(ics: string): string {
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
}
