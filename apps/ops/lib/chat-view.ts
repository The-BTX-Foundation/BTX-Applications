// The Board chat page's data contract (Ops Hub refresh; demo apps/design/ops-refresh/directions/p-chat). Types only, no
// logic: mock mode fills it from mock/chat-view.ts, live mode from the real tables (lib/chat-live.ts through the pure
// mapping in lib/chat-map.ts). Times travel as ISO strings; `today` is the Eastern calendar day the server counted from.

/** A board member who can be in the chat (admins and board members only). */
export type ChatPerson = {
  userId: string;
  displayName: string;
  initials: string;
};

/** One entry in the channel list: an area channel, or a direct conversation with one other board member. */
export type ChatChannel = {
  /** The list key: the channel id for an area, `direct:<userId>` for a direct conversation (stable once it is opened). */
  key: string;
  /** chat_channels.id; null for a direct conversation that has never been opened (open_direct_channel creates it). */
  id: string | null;
  kind: 'area' | 'direct';
  /** areas.slug for an area channel (scholarships, money, programs, outreach); null for a direct one. */
  area: string | null;
  /** The label in the list: the area's name, or the other person's name. */
  name: string;
  /** direct only: the other person. */
  otherUserId: string | null;
  initials: string | null;
  /** chat_read_markers.last_read_at for the viewer (ISO), or null = never read. */
  lastReadAt: string | null;
  /**
   * Unread messages the page cannot count itself because they are older than the loaded messages (the server's unread
   * count minus the unread messages that were loaded); 0 when everything unread is loaded. Cleared when the channel is read.
   */
  unreadExtra: number;
  /** How many people can read it ("8 people"). */
  people: number;
};

/** One message. */
export type ChatMessage = {
  id: string;
  channelId: string;
  /** null for a message the system posted ("BTX"). */
  authorId: string | null;
  isBot: boolean;
  body: string;
  /** The task the message is about (draws "Open task"). */
  taskId: string | null;
  createdAt: string;
  /** Live only: drawn while its insert is still running ("Sending…"); never counted for read markers. */
  pending?: boolean;
};

/** A pinned item: `channelId` null = pinned for All areas. Read-only on this page. */
export type ChatPin = {
  id: string;
  channelId: string | null;
  label: string;
};

/**
 * What the page may do. Mock mode turns everything on (the demo's behaviour); live mode only where a real write exists.
 */
export type ChatCaps = {
  /** Post a message (chat_messages insert, then the push call). */
  send: boolean;
  /** Start a direct conversation on first send (rpc open_direct_channel). */
  openDirect: boolean;
  /** Mark channels read when they open (chat_read_markers upsert). */
  markRead: boolean;
  /** "Undo" on a just-sent message (mock only: live mode keeps it off by the spec). */
  unsend: boolean;
  /** Pin or unpin an item (mock only, off in live mode; the page draws no pin control, so the Pinned list is read-only). */
  pinToggle: boolean;
};

/** The page's data when it loaded. */
export type ChatView = {
  failed: false;
  /** The thread could not be read (the window shows "Board chat didn't load." with Try again; the title still shows). */
  threadFailed: boolean;
  /** The Eastern calendar day the page counts from ("2026-11-10"). */
  today: string;
  /** "Tue, Nov 10" beside the title. */
  dateLabel: string;
  /** The server's "now" (ISO); mock mode's clock for new messages and read markers. */
  now: string;
  me: ChatPerson;
  people: ChatPerson[];
  channels: ChatChannel[];
  /** Oldest first. */
  messages: ChatMessage[];
  pins: ChatPin[];
  caps: ChatCaps;
  /**
   * Channel ids whose read hit the per-channel cap: older messages exist that the page did not load (the thread says
   * "Older messages aren't shown here." and search says it only covers loaded messages). Always empty in mock mode.
   */
  capped: string[];
};

/** What the loader returns: the view, or the whole page failed. */
export type ChatResult = ChatView | { failed: true };
