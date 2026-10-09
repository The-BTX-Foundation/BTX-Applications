// MOCK: the Board chat page. The Ops Hub chat tables do not exist yet, so this is the Figma "Board chat" frames' sample
// (a Sunday, October 4, 2026; times are Eastern, EDT = -04:00) and the stress frame's long-text version (?demo=stress).
// The array order is the frames' order. When the tables arrive, lib/chat.ts reads them instead and the page does not change.
import type {
  ChatChannel,
  ChatData,
  ChatMessageRow,
  ChatPerson,
  ChatPinRow,
} from "@/lib/chat";

const DM: ChatPerson = {
  userId: "u-dm",
  displayName: "Dania Morris",
  initials: "DM",
};
const KD: ChatPerson = {
  userId: "u-kd",
  displayName: "Kelsey Davis",
  initials: "KD",
};
const MD: ChatPerson = {
  userId: "u-md",
  displayName: "Marcus Davis",
  initials: "MD",
};
const CK: ChatPerson = {
  userId: "u-ck",
  displayName: "Cillisha Knights",
  initials: "CK",
};
const DS: ChatPerson = {
  userId: "u-ds",
  displayName: "Darien Strachan",
  initials: "DS",
};

const NOW = "2026-10-04T09:35:00-04:00";
const READ = "2026-10-04T08:30:00-04:00";

function area(
  id: string,
  slug: string,
  name: string,
  unread: number | null,
  lastReadAt: string,
): ChatChannel {
  return {
    id,
    kind: "area",
    area: slug,
    name,
    otherUserId: null,
    initials: null,
    unread,
    lastReadAt,
    people: 7,
  };
}
function direct(id: string, p: ChatPerson): ChatChannel {
  return {
    id,
    kind: "direct",
    area: null,
    name: p.displayName,
    otherUserId: p.userId,
    initials: p.initials,
    unread: null,
    lastReadAt: READ,
    people: 2,
  };
}

const AREAS = {
  scholarships: "ch-scholarships",
  money: "ch-money",
  programs: "ch-programs",
  outreach: "ch-outreach",
};

const m = (
  id: string,
  channelId: string,
  authorId: string | null,
  body: string,
  createdAt: string,
  extra: Partial<ChatMessageRow> = {},
): ChatMessageRow => ({
  id,
  channelId,
  authorId,
  isBot: authorId === null,
  body,
  taskId: null,
  createdAt,
  ...extra,
});

const PINS: ChatPinRow[] = [
  { id: "p1", channelId: null, label: "Interview schedule, Oct 5-9" },
  { id: "p2", channelId: null, label: "Q4 budget" },
];

export const CHAT_MOCK: ChatData = {
  failed: false,
  me: DM,
  people: [DM, KD, MD],
  now: NOW,
  channels: [
    area(AREAS.scholarships, "scholarships", "Scholarships", 2, READ),
    area(AREAS.money, "money", "Money", 1, READ),
    area(
      AREAS.programs,
      "programs",
      "Programs",
      null,
      "2026-10-03T18:00:00-04:00",
    ),
    area(AREAS.outreach, "outreach", "Outreach", 1, READ),
    direct("dm-kd", KD),
    direct("dm-md", MD),
  ],
  messages: [
    m(
      "m1",
      AREAS.programs,
      null,
      "Certification program planning call is set for Thu Oct 22 at 7:00 PM.",
      "2026-10-03T16:00:00-04:00",
    ),
    m(
      "m2",
      AREAS.money,
      null,
      "Q3 is closed. Spending was **$460**. 2026 so far: $3,670 of $8,500.",
      "2026-10-04T06:00:00-04:00",
    ),
    m(
      "m3",
      AREAS.money,
      null,
      "Kelsey Davis assigned you **Approve Q4 budget**, due Tue Oct 6.",
      "2026-10-04T07:55:00-04:00",
      { taskId: "t-q4-budget" },
    ),
    m(
      "m4",
      AREAS.scholarships,
      DM.userId,
      "I'll send the video links for this week's interviews today.",
      "2026-10-04T08:14:00-04:00",
    ),
    m(
      "m5",
      AREAS.scholarships,
      null,
      "Scores are due Sun Oct 11. 4 applicants are waiting on a score, 3 of them yours.",
      "2026-10-04T09:00:00-04:00",
    ),
    m(
      "m6",
      AREAS.scholarships,
      MD.userId,
      "Publishing my score for APP-2026-00004 tonight.",
      "2026-10-04T09:12:00-04:00",
    ),
    m(
      "m7",
      AREAS.money,
      KD.userId,
      "I'll pull a list of grants we could apply for by the 12th.",
      "2026-10-04T09:20:00-04:00",
    ),
    m(
      "m8",
      AREAS.outreach,
      KD.userId,
      "Send me the Meet the board caption when it's ready.",
      "2026-10-04T09:31:00-04:00",
    ),
  ],
  pins: PINS,
};

export const CHAT_STRESS: ChatData = {
  failed: false,
  me: DM,
  people: [DM, KD, MD, CK, DS],
  now: NOW,
  channels: [
    area(AREAS.scholarships, "scholarships", "Scholarships", 120, READ),
    area(AREAS.money, "money", "Money", 1, READ),
    // The stress frame draws a "0" pill here.
    area(
      AREAS.programs,
      "programs",
      "Programs",
      0,
      "2026-10-03T18:00:00-04:00",
    ),
    area(AREAS.outreach, "outreach", "Outreach", 1, READ),
    direct("dm-kd", KD),
    direct("dm-md", MD),
  ],
  messages: [
    m(
      "s1",
      AREAS.programs,
      null,
      "Certification program planning call is set for Thu Oct 22 at 7:00 PM.",
      "2026-10-03T16:00:00-04:00",
    ),
    m(
      "s2",
      AREAS.money,
      null,
      "Q3 is closed. Spending was **$460**. 2026 so far: $3,670 of $8,500.",
      "2026-10-04T08:00:00-04:00",
    ),
    m(
      "s3",
      AREAS.money,
      null,
      "Darien Strachan assigned you **Approve Q4 budget**, due Tue Oct 6.",
      "2026-10-04T07:55:00-04:00",
      { taskId: "t-q4-budget" },
    ),
    m(
      "s4",
      AREAS.scholarships,
      DM.userId,
      "I'll send the video links for this week's interviews today.",
      "2026-10-04T08:14:00-04:00",
    ),
    m(
      "s5",
      AREAS.scholarships,
      null,
      "Scores are due Sun Oct 11. 4 applicants are waiting on a score, 3 of them yours.",
      "2026-10-04T09:00:00-04:00",
    ),
    m(
      "s6",
      AREAS.scholarships,
      CK.userId,
      "Interview schedule: https://thebtxfoundation.org/scholarships/legacy-scholarship-fall-2026-interview-schedule",
      "2026-10-04T09:12:00-04:00",
    ),
    m(
      "s7",
      AREAS.money,
      DS.userId,
      "I'll pull a list of grants we could apply for by the 12th. I'm starting with the ones that fund student scholarships, since the Legacy Scholarship is our main award. Each one gets a deadline, an amount and who it is for. I'll post the whole list here tonight so we can pick five to apply for.",
      "2026-10-04T21:30:00-04:00",
    ),
    m(
      "s8",
      AREAS.outreach,
      DS.userId,
      "Send me the Meet the board caption when it's ready.",
      "2026-10-04T21:31:00-04:00",
    ),
  ],
  pins: [
    {
      id: "sp1",
      channelId: null,
      label:
        "Announce the Legacy Scholarship at the NSBE event and cocktail hour",
    },
    { id: "sp2", channelId: null, label: "Q4 budget" },
  ],
};
