// MOCK: the Board chat page's sample (the demo p-chat's data: Tuesday, November 10, 2026, Eastern; EST = -05:00), in the
// page's view shape (lib/chat-view.ts). CHAT_VIEW is the normal day, CHAT_VIEW_STRESS the longest names and texts with
// 99+ unread, CHAT_VIEW_EMPTY a chat with no messages yet. Mock mode turns every capability on (the demo's behaviour).
import type { ChatCaps, ChatChannel, ChatMessage, ChatPerson, ChatPin, ChatView } from '@/lib/chat-view';

const DM: ChatPerson = { userId: 'u-dm', displayName: 'Dana Mercer', initials: 'DM' };
const KD: ChatPerson = { userId: 'u-kd', displayName: 'Keith Dawson', initials: 'KD' };
const MD: ChatPerson = { userId: 'u-md', displayName: 'Miles Donovan', initials: 'MD' };
const CK: ChatPerson = { userId: 'u-ck', displayName: 'Camila Keane', initials: 'CK' };
const DS: ChatPerson = { userId: 'u-ds', displayName: 'Dorian Sutton', initials: 'DS' };

const READ = '2026-11-10T08:30:00-05:00';
const CAPS: ChatCaps = { send: true, openDirect: true, markRead: true, unsend: true, pinToggle: true };

// An area channel (8 people, read at 8:30 AM unless said otherwise).
function area(id: string, slug: string, name: string, lastReadAt = READ, unreadExtra = 0): ChatChannel {
  return { key: id, id, kind: 'area', area: slug, name, otherUserId: null, initials: null, lastReadAt, unreadExtra, people: 8 };
}
// A direct conversation that already exists.
function direct(id: string, p: ChatPerson): ChatChannel {
  return { key: `direct:${p.userId}`, id, kind: 'direct', area: null, name: p.displayName, otherUserId: p.userId, initials: p.initials, lastReadAt: READ, unreadExtra: 0, people: 2 };
}
// One message; a null author is the system ("BTX").
const m = (id: string, channelId: string, authorId: string | null, body: string, createdAt: string, taskId: string | null = null): ChatMessage => ({
  id,
  channelId,
  authorId,
  isBot: authorId === null,
  body,
  taskId,
  createdAt,
});
// An Eastern time on a November 2026 day ("2026-11-09T18:00:00-05:00").
const at = (day: number, hm: string) => `2026-11-${String(day).padStart(2, '0')}T${hm}:00-05:00`;

// The channel list; stress adds 117 older unread messages in Scholarships (its pill reads 99+, All areas 99+).
const channels = (stress: boolean): ChatChannel[] => [
  area('ch-sch', 'scholarships', 'Scholarships', READ, stress ? 117 : 0),
  area('ch-fin', 'money', 'Finance'),
  area('ch-pro', 'programs', 'Programs', at(9, '18:00')),
  area('ch-out', 'outreach', 'Outreach'),
  direct('dm-kd', KD),
  direct('dm-md', MD),
];

// The demo's nine messages (stress swaps in the longest names, a long link and a long message).
function messages(stress: boolean): ChatMessage[] {
  return [
    m('m1', 'ch-pro', null, 'Certification program planning call is set for Thu Nov 19 at 7:00 PM.', at(9, '16:00')),
    m('m2', 'ch-fin', null, 'Q3 is closed. Spending was **$460**. 2026 so far: $3,670 of $8,500.', at(10, '06:00')),
    m('m3', 'ch-fin', null, `${stress ? 'Dorian Sutton' : 'Keith Dawson'} assigned you **Approve the Q4 budget ($4,830)**, due Fri Nov 13.`, at(10, '07:55'), 't-q4-budget'),
    m('m4', 'ch-sch', null, 'Interview times went to all 21 students.', at(10, '08:01')),
    m('m5', 'ch-sch', DM.userId, "I'll share the interview schedule with the board today.", at(10, '08:14')),
    m('m6', 'ch-sch', null, '5 of 21 students have booked an interview.', at(10, '09:00')),
    stress
      ? m('m7', 'ch-sch', CK.userId, 'Interview schedule: https://thebtxfoundation.org/scholarships/legacy-scholarship-fall-2026-interview-schedule', at(10, '09:05'))
      : m('m7', 'ch-sch', MD.userId, 'I have the questions ready for APP-2026-00013 on Friday.', at(10, '09:05')),
    stress
      ? m('m8', 'ch-fin', DS.userId, "I'll pull a list of grants we could apply for by the 16th. I'm starting with the ones that fund student scholarships, since the Legacy Scholarship is our main award. Each one gets a deadline, an amount and who it is for. I'll post the whole list here tonight so we can pick five to apply for.", at(10, '09:08'))
      : m('m8', 'ch-fin', KD.userId, "I'll pull a list of grants we could apply for by the 16th.", at(10, '09:08')),
    m('m9', 'ch-sch', KD.userId, 'Times look good. I can take Saturday mornings.', at(10, '09:12')),
  ];
}

const PINS: ChatPin[] = [
  { id: 'p1', channelId: null, label: 'Interview schedule, Nov 10-20' },
  { id: 'p2', channelId: null, label: 'Q4 budget' },
];
const PINS_STRESS: ChatPin[] = [
  { id: 'p1', channelId: null, label: 'Announce the Legacy Scholarship at the NSBE event and cocktail hour' },
  { id: 'p2', channelId: null, label: 'Q4 budget' },
];

const BASE = {
  failed: false as const,
  threadFailed: false,
  today: '2026-11-10',
  dateLabel: 'Tue, Nov 10',
  now: at(10, '09:14'),
  me: DM,
  people: [DM, KD, MD, CK, DS],
  caps: CAPS,
  capped: [] as string[],
};

export const CHAT_VIEW: ChatView = { ...BASE, channels: channels(false), messages: messages(false), pins: PINS };
export const CHAT_VIEW_STRESS: ChatView = { ...BASE, channels: channels(true), messages: messages(true), pins: PINS_STRESS };
export const CHAT_VIEW_EMPTY: ChatView = { ...BASE, channels: channels(false), messages: [], pins: [] };
