"use client";

// Board chat (Figma "Board chat" laptop and phone frames). Laptop: channel list, the thread, a "Pinned" panel. Phone: a
// channel picker above the thread. "All areas" is every area channel together; each message carries its area tag there.
// Sending works in mock mode (an in-memory append that marks the channel read). In live mode it calls the draft tables
// (lib/chat-actions.ts, NOT TESTED).
import Link from "next/link";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { OIcon, type OpsIconName } from "@/components/icons";
import { timeLabel } from "@/lib/format";
import type { ChatChannel, ChatData, ChatMessageRow } from "@/lib/chat";
import {
  chatIsLive,
  markRead,
  openDirect,
  postMessage,
} from "@/lib/chat-actions";
import { PinIcon } from "./pin-icon";
import "./chat.css";

const ALL = "all";
const AREA_ICON: Record<string, OpsIconName> = {
  scholarships: "scholarships",
  money: "money",
  programs: "programs",
  outreach: "outreach",
};

// The page's clock: the sample's "now" plus the time since the page opened (so new messages land after the sample ones).
function clockMs(base: string, startedAt: number): number {
  return Date.parse(base) + (Date.now() - (startedAt || Date.now()));
}

const keyOf = (c: ChatChannel) => c.id ?? `direct:${c.otherUserId}`;
const eastern = (ts: string | number) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(
    new Date(ts),
  );

// "Wed Sep 30" style label for a day that is not today or yesterday.
function dayName(ts: string, nowMs: number): string {
  const d = eastern(ts);
  if (d === eastern(nowMs)) return "Today";
  if (d === eastern(nowMs - 86_400_000)) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    month: "short",
    day: "numeric",
  })
    .format(new Date(ts))
    .replace(",", "");
}

// A message's text: "**bold**" parts, and an applicant code ("APP-2026-00004") kept on one line, as the design does.
function plain(text: string, key: string) {
  return text.split(/(APP-\d{4}-\d{5})/).map((part, i) =>
    /^APP-/.test(part) ? (
      <span key={`${key}${i}`} style={{ whiteSpace: "nowrap" }}>
        {part}
      </span>
    ) : (
      // a line may break after each slash of a long web address
      part
        .split(/(?<=\/)/)
        .map((piece, k) =>
          k ? [<wbr key={`${key}w${i}${k}`} />, piece] : piece,
        )
    ),
  );
}
function Body({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\*\*(.+?)\*\*/)
        .map((part, i) =>
          i % 2 ? <b key={i}>{plain(part, `b${i}`)}</b> : plain(part, `t${i}`),
        )}
    </>
  );
}

// The gold count pill (All areas caps at 99+).
function Pill({ n, cap }: { n: number | null; cap?: boolean }) {
  if (n === null) return null;
  return <span className="o-ct ch-ct">{cap && n > 99 ? "99+" : n}</span>;
}

type Item =
  | { kind: "day"; label: string }
  | { kind: "new"; count: number }
  | { kind: "msg"; msg: ChatMessageRow };

export function ChatView({ data }: { data: ChatData }) {
  const live = chatIsLive();
  const [channels, setChannels] = useState(data.channels);
  const [messages, setMessages] = useState(data.messages);
  const [sel, setSel] = useState<string>(ALL);
  const areas = channels.filter((c) => c.kind === "area");
  const directs = channels.filter((c) => c.kind === "direct");
  const [postTo, setPostTo] = useState<string>(
    areas.find((c) => c.area === "scholarships")?.id ?? areas[0]?.id ?? "",
  );
  const [draft, setDraft] = useState("");
  const [search, setSearch] = useState("");
  const [sendError, setSendError] = useState(false);
  const mountedAt = useRef(0);
  const nowMs = () => clockMs(data.now, mountedAt.current);
  const people = useMemo(
    () => new Map(data.people.map((p) => [p.userId, p])),
    [data.people],
  );
  const byId = useMemo(
    () => new Map(channels.map((c) => [c.id, c])),
    [channels],
  );

  // The "N new" divider is worked out when a channel opens (before it is marked read), so it stays while you read.
  const [divider, setDivider] = useState<{
    firstId: string;
    count: number;
  } | null>(() =>
    unreadSplit(
      data.channels,
      data.messages,
      data.channels.filter((c) => c.kind === "area").map((c) => c.id as string),
      data.me.userId,
    ),
  );
  const current =
    sel === ALL ? null : (channels.find((c) => keyOf(c) === sel) ?? null);

  function inView(m: ChatMessageRow): boolean {
    if (sel === ALL) return byId.get(m.channelId)?.kind === "area";
    return current?.id === m.channelId;
  }
  const visible = messages.filter(inView).filter((m) => {
    if (!search.trim()) return true;
    const who = m.isBot
      ? "BTX"
      : (people.get(m.authorId ?? "")?.displayName ?? "");
    return `${m.body} ${who}`
      .toLowerCase()
      .includes(search.trim().toLowerCase());
  });

  const items: Item[] = [];
  let lastDay = "";
  for (const m of visible) {
    const day = dayName(m.createdAt, Date.parse(data.now));
    if (day !== lastDay) {
      items.push({ kind: "day", label: day });
      lastDay = day;
    }
    if (divider && divider.firstId === m.id)
      items.push({ kind: "new", count: divider.count });
    items.push({ kind: "msg", msg: m });
  }

  // mountedAt: when the page opened (the clock for new messages).
  useLayoutEffect(() => {
    if (!mountedAt.current) mountedAt.current = Date.now();
  }, []);

  // Marks channels read in the page's state (and, live, in chat_read_markers).
  function markChannelsRead(ids: string[]) {
    if (ids.length === 0) return;
    const at = new Date(nowMs()).toISOString();
    setChannels((cs) =>
      cs.map((c) =>
        c.id && ids.includes(c.id) ? { ...c, unread: null, lastReadAt: at } : c,
      ),
    );
    // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
    if (live) void markRead(ids).catch(() => undefined);
  }

  function open(key: string) {
    setSearch("");
    const ids =
      key === ALL
        ? areas.map((c) => c.id as string)
        : [channels.find((c) => keyOf(c) === key)?.id].filter(
            (x): x is string => Boolean(x),
          );
    setDivider(unreadSplit(channels, messages, ids, data.me.userId));
    setSel(key);
    markChannelsRead(ids);
  }

  async function send() {
    const body = draft.trim();
    if (!body) return;
    setSendError(false);
    const target = current ?? areas.find((c) => c.id === postTo) ?? null;
    if (!target) return;
    try {
      let id = target.id;
      let createdAt = new Date(nowMs()).toISOString();
      let msgId = `local-${messages.length + 1}`;
      if (live) {
        // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
        if (!id && target.otherUserId) {
          id = await openDirect(target.otherUserId);
          const opened = { ...target, id };
          setChannels((cs) => cs.map((c) => (c === target ? opened : c)));
          setSel(keyOf(opened));
        }
        if (!id) return;
        const saved = await postMessage(id, body);
        msgId = saved.id;
        createdAt = saved.createdAt;
      }
      if (!id) return;
      setMessages((ms) => [
        ...ms,
        {
          id: msgId,
          channelId: id,
          authorId: data.me.userId,
          isBot: false,
          body,
          taskId: null,
          createdAt,
        },
      ]);
      setDraft("");
      setDivider(null);
      markChannelsRead(sel === ALL ? areas.map((c) => c.id as string) : [id]);
    } catch {
      setSendError(true);
    }
  }

  const title = current ? current.name : "All areas";
  const peopleLine = current
    ? `${current.people} people`
    : `${areas[0]?.people ?? 0} people`;
  const pins = data.pins.filter((p) =>
    current ? p.channelId === current.id : p.channelId === null,
  );
  const placeholder =
    current?.kind === "direct"
      ? `Message ${current.name}`
      : "Message the board";
  const postLabel =
    current?.kind === "area"
      ? current.name
      : (areas.find((c) => c.id === postTo)?.name ?? "");

  return (
    <div className="ch-root">
      <div className="ch-hrow">
        <h1>Board chat</h1>
        <label className="ch-sel ch-pick">
          <span>{title}</span>
          <OIcon name="down" size={18} />
          <select
            aria-label="Channel"
            value={sel}
            onChange={(e) => open(e.target.value)}
          >
            <option value={ALL}>All areas</option>
            {areas.map((c) => (
              <option key={keyOf(c)} value={keyOf(c)}>
                {c.name}
              </option>
            ))}
            <optgroup label="Direct">
              {directs.map((c) => (
                <option key={keyOf(c)} value={keyOf(c)}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
      </div>

      <nav className="ch-list" aria-label="Channels">
        <h1>Board chat</h1>
        <label className="ch-search">
          <OIcon name="search" size={17} />
          <input
            type="search"
            placeholder="Search messages"
            aria-label="Search messages"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button
          type="button"
          className={`ch-chn${sel === ALL ? " on" : ""}`}
          aria-current={sel === ALL ? "true" : undefined}
          onClick={() => open(ALL)}
        >
          <OIcon name="chat" size={18} />
          <span>All areas</span>
          <Pill
            n={
              areas.some((c) => c.unread !== null)
                ? areas.reduce((s, c) => s + (c.unread ?? 0), 0)
                : null
            }
            cap
          />
        </button>
        {areas.map((c) => (
          <button
            key={keyOf(c)}
            type="button"
            className={`ch-chn${sel === keyOf(c) ? " on" : ""}`}
            aria-current={sel === keyOf(c) ? "true" : undefined}
            onClick={() => open(keyOf(c))}
          >
            <OIcon name={AREA_ICON[c.area ?? ""] ?? "chat"} size={18} />
            <span>{c.name}</span>
            <Pill n={c.unread} />
          </button>
        ))}
        <p className="ch-dir">Direct</p>
        {directs.map((c) => (
          <button
            key={keyOf(c)}
            type="button"
            className={`ch-chn${sel === keyOf(c) ? " on" : ""}`}
            aria-current={sel === keyOf(c) ? "true" : undefined}
            onClick={() => open(keyOf(c))}
          >
            <span className="ch-av s">{c.initials}</span>
            <span>{c.name}</span>
            <Pill n={c.unread} />
          </button>
        ))}
      </nav>

      <section className="ch-th" aria-label={`${title} thread`}>
        <div className="ch-thh">
          <div>
            <h2>{title}</h2>
            <p>{peopleLine}</p>
          </div>
        </div>
        <div className="ch-msgs">
          <div className="ch-mi">
            {items.length === 0 ? (
              <p className="ch-none">
                {search.trim() ? "No messages match." : "No messages yet."}
              </p>
            ) : null}
            {items.map((it) => {
              if (it.kind === "day")
                return (
                  <p key={`d-${it.label}`} className="ch-day">
                    <span>{it.label}</span>
                  </p>
                );
              if (it.kind === "new")
                return (
                  <p key="new" className="ch-day">
                    <span>{it.count} new</span>
                  </p>
                );
              const m = it.msg;
              const mine = m.authorId === data.me.userId;
              const who = m.isBot ? null : people.get(m.authorId ?? "");
              const ch = byId.get(m.channelId);
              const tag = sel === ALL && ch?.kind === "area" ? ch.name : null;
              return (
                <div key={m.id} className={`ch-m${mine ? " me" : ""}`}>
                  {mine ? null : m.isBot ? (
                    <span className="ch-av bot">
                      <OIcon name="refresh" size={18} />
                    </span>
                  ) : (
                    <span className="ch-av">{who?.initials ?? "?"}</span>
                  )}
                  <div className="ch-mb">
                    <p className="ch-mh">
                      {mine ? null : (
                        <b>
                          {m.isBot
                            ? "BTX"
                            : (who?.displayName ?? "Former member")}
                        </b>
                      )}
                      {tag ? <span className="ch-tag">{tag}</span> : null}
                      <span className="ch-tm">{timeLabel(m.createdAt)}</span>
                    </p>
                    <p className={`ch-bub${m.isBot ? " bot" : ""}`}>
                      <Body text={m.body} />
                    </p>
                    {m.taskId ? (
                      <Link href="/tasks" className="o-btn s lg ch-open">
                        Open task
                      </Link>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <form
          className="ch-comp"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {current?.kind === "direct" ? null : (
            <label className="ch-sel ch-post">
              <em>Post to:</em>
              <b>{postLabel}</b>
              <OIcon name="down" size={16} />
              <select
                aria-label="Post to"
                value={current ? (current.id ?? "") : postTo}
                disabled={Boolean(current)}
                onChange={(e) => setPostTo(e.target.value)}
              >
                {areas.map((c) => (
                  <option key={keyOf(c)} value={c.id ?? ""}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <input
            className="ch-in"
            type="text"
            placeholder={placeholder}
            aria-label={placeholder}
            value={draft}
            maxLength={4000}
            onChange={(e) => setDraft(e.target.value)}
          />
          <button
            type="submit"
            className="ch-go"
            aria-label="Send"
            disabled={!draft.trim()}
          >
            <OIcon name="send" size={20} />
          </button>
          {sendError ? (
            <span className="ch-err" role="alert">
              Didn&apos;t send. Try again.
            </span>
          ) : null}
        </form>
      </section>

      <aside className="ch-sp" aria-label="Chat details">
        <section>
          <h2>Pinned</h2>
          {pins.length === 0 ? (
            <p className="ch-none">Nothing pinned yet.</p>
          ) : null}
          {pins.map((p) => (
            <div key={p.id} className="ch-pn">
              <PinIcon />
              <span>{p.label}</span>
            </div>
          ))}
        </section>
      </aside>
    </div>
  );
}

// Which unread messages the channels in `ids` hold for the person: the first one's id and how many.
function unreadSplit(
  channels: ChatChannel[],
  messages: ChatMessageRow[],
  ids: string[],
  me: string,
): { firstId: string; count: number } | null {
  const last = new Map(channels.map((c) => [c.id, c.lastReadAt]));
  const unread = messages.filter(
    (m) =>
      ids.includes(m.channelId) &&
      m.authorId !== me &&
      Date.parse(m.createdAt) >
        Date.parse(last.get(m.channelId) ?? "1970-01-01T00:00:00Z"),
  );
  return unread.length ? { firstId: unread[0].id, count: unread.length } : null;
}
