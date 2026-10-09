"use client";

// The Calendar screen (Figma "Calendar", laptop and phone). Laptop: month grid with bars across days and chips inside a
// day (three, then "+N more"), a side panel for the selected day, a legend and filters. Phone: a week strip with dots
// and the agenda for three days from the selected day. Month is the only view drawn in Figma: Week and List do nothing
// yet. MOCK today: "Add event" adds to this component's own state (resets on reload); in live mode it inserts into
// `calendar_events` (title, kind, area, starts_at, all_day). NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
import { useMemo, useState } from "react";
import { getBrowserClient, hasSupabaseEnv } from "@btx/data";
import { PageHeader } from "../page-header";
import { OIcon } from "../icons";
import {
  AREA_LABEL,
  type CalArea,
  type CalItem,
  type CalendarData,
} from "./types";
import {
  addDays,
  addMonths,
  chipOrder,
  daysBetween,
  dayItems,
  dayLabel,
  dayNum,
  minutes,
  monthStart,
  monthTitle,
  monthWeeks,
  panelHeading,
  weekStart,
} from "./dates";
import "./calendar.css";

const KIND: Record<CalArea, string> = {
  scholarships: "s",
  programs: "p",
  money: "m",
  outreach: "o",
};
const WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const WD1 = ["S", "M", "T", "W", "T", "F", "S"];

function Chev({ dir, size = 16 }: { dir: "left" | "right"; size?: number }) {
  return (
    <OIcon
      name="right"
      size={size}
      className={dir === "left" ? "ca-flip" : undefined}
    />
  );
}

// The small camera mark before "Video".
function VideoMark() {
  return (
    <svg
      className="ca-vid"
      width="15"
      height="15"
      viewBox="0 0 15 15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.3"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1.5" y="3.5" width="8" height="8" rx="1.2" />
      <path d="M9.5 6.5 13.5 4.5v6l-4-2" />
    </svg>
  );
}

type Placed = { item: CalItem; col: number; lane: number; span: number };
type More = { col: number; lane: number; n: number };

// Works out which lane (row inside the week) every bar, chip and "+N more" sits in.
function layoutWeek(
  days: string[],
  items: CalItem[],
): { bars: Placed[]; chips: Placed[]; more: More[] } {
  const taken: Set<number>[] = days.map(() => new Set());
  const bars: Placed[] = [];
  for (const it of items.filter((i) => i.span)) {
    const s = Math.max(0, daysBetween(days[0], it.date));
    const e = Math.min(6, daysBetween(days[0], it.endDate ?? it.date));
    if (e < 0 || s > 6) continue;
    let lane = 1;
    while (
      Array.from({ length: e - s + 1 }, (_, k) => s + k).some((c) =>
        taken[c].has(lane),
      )
    )
      lane++;
    for (let c = s; c <= e; c++) taken[c].add(lane);
    bars.push({ item: it, col: s, lane, span: e - s + 1 });
  }
  const chips: Placed[] = [];
  const more: More[] = [];
  const free = (c: number) => {
    let l = 1;
    while (taken[c].has(l)) l++;
    taken[c].add(l);
    return l;
  };
  days.forEach((d, c) => {
    const list = chipOrder(dayItems(items, d).filter((i) => !i.hideInMonth));
    list
      .slice(0, 3)
      .forEach((item) => chips.push({ item, col: c, lane: free(c), span: 1 }));
    if (list.length > 3)
      more.push({ col: c, lane: free(c), n: list.length - 3 });
  });
  return { bars, chips, more };
}

// One chip or bar on the month grid.
function Ev({
  p,
  me,
  onPick,
}: {
  p: Placed;
  me: string;
  onPick: (d: string) => void;
}) {
  const { item } = p;
  const mine = !item.late && item.people.includes(me);
  const cls = [
    "ca-ev",
    KIND[item.area],
    item.late ? "late" : "",
    mine ? "dot" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      type="button"
      className={cls}
      style={{
        gridColumn: `${p.col + 1} / span ${p.span}`,
        gridRow: p.lane + 1,
      }}
      onClick={() => onPick(item.date)}
      title={item.title}
    >
      {mine ? <i className="ca-nd" /> : null}
      <span>
        {item.late ? "! " : ""}
        {item.chip}
      </span>
    </button>
  );
}

// The side panel: the selected day's heading and its first timed item (what the Figma frame draws).
function SidePanel({
  day,
  today,
  items,
  names,
}: {
  day: string;
  today: string;
  items: CalItem[];
  names: Record<string, string>;
}) {
  const first = dayItems(items, day)
    .filter((i) => i.start)
    .sort((a, b) => minutes(a.start) - minutes(b.start))[0];
  return (
    <aside className="ca-side" aria-label="Agenda">
      <div className="ca-sd">
        <h2>{panelHeading(day, today)}</h2>
        {first ? (
          <div className="ca-ag">
            <b className="ca-ag-t">{first.start}</b>
            <p>
              <b>{first.title}</b>
              <span>
                {first.people.map((id) => names[id] ?? id).join(", ")}
                {first.video ? " · Video" : ""}
              </span>
            </p>
          </div>
        ) : (
          <p className="ca-none">Nothing scheduled at a set time.</p>
        )}
      </div>
      <a className="ca-sub2" href="#" onClick={(e) => e.preventDefault()}>
        Add the BTX calendar to Google Calendar
      </a>
    </aside>
  );
}

// Phone: what a day's row says in its first column.
const whenLabel = (i: CalItem) =>
  i.start ??
  (i.source === "task" ? "Due" : i.source === "post" ? "Post" : "All day");

function AgendaRow({
  it,
  me,
  names,
}: {
  it: CalItem;
  me: string;
  names: Record<string, string>;
}) {
  const mine = it.people.includes(me);
  const interview = it.source === "interview";
  const people = it.people.map((id) => names[id] ?? id).join(", ");
  return (
    <div className="ca-ar">
      <b className="ca-ar-w">{whenLabel(it)}</b>
      <span className={`ca-sw ${KIND[it.area]}`} />
      <div className="ca-ab">
        <p className="ca-ab-t">{it.title}</p>
        {interview ? (
          <>
            {mine ? (
              <p className="ca-yr">
                <i className="ca-yd" />
                <b>Yours</b>
              </p>
            ) : null}
            <p className="ca-ab-s">{people}</p>
            {it.video ? (
              <p className="ca-ab-s ca-ab-v">
                <VideoMark />
                Video
              </p>
            ) : null}
          </>
        ) : mine ? (
          <p className="ca-yr">
            <i className="ca-yd" />
            <b>Yours</b>
            <span>{AREA_LABEL[it.area]}</span>
          </p>
        ) : (
          <p className="ca-ab-s">{AREA_LABEL[it.area]}</p>
        )}
      </div>
    </div>
  );
}

export function CalendarView({ data }: { data: CalendarData }) {
  const { today, me } = data;
  const names = useMemo(
    () => Object.fromEntries(data.people.map((p) => [p.id, p.name])),
    [data.people],
  );
  const [added, setAdded] = useState<CalItem[]>([]);
  const [month, setMonth] = useState(monthStart(today));
  const [sel, setSel] = useState(addDays(today, 1));
  const [wk, setWk] = useState(weekStart(today));
  const [view, setView] = useState<"month" | "week" | "list">("month");
  const [who, setWho] = useState("");

  const all = useMemo(() => [...data.items, ...added], [data.items, added]);
  const items = useMemo(
    () => (who ? all.filter((i) => i.span || i.people.includes(who)) : all),
    [all, who],
  );
  const weeks = monthWeeks(month);

  const pick = (d: string) => {
    setSel(d);
    setWk(weekStart(d));
  };
  const goToday = () => {
    setMonth(monthStart(today));
    pick(today);
  };
  // "Add event": a title for the selected day (the design has no form for it yet).
  async function addEvent() {
    const title = window.prompt("Event title")?.trim();
    if (!title) return;
    const item: CalItem = {
      id: `new-${added.length}`,
      date: sel,
      source: "event",
      area: "scholarships",
      chip: title,
      title,
      start: null,
      people: [me],
    };
    setAdded((a) => [...a, item]);
    if (hasSupabaseEnv()) {
      // NOT TESTED: needs the Ops Hub tables (draft schema, not applied).
      const w = getBrowserClient() as unknown as {
        from: (t: string) => {
          insert: (
            r: Record<string, unknown>,
          ) => PromiseLike<{ error: unknown }>;
        };
      };
      await w.from("calendar_events").insert({
        title,
        kind: "event",
        area: "scholarships",
        starts_at: `${sel}T04:00:00Z`,
        all_day: true,
      });
    }
  }

  // Phone: the three days from the selected one, each with its items in list order.
  const agenda = [0, 1, 2]
    .map((n) => addDays(sel, n))
    .map((d) => ({
      d,
      rows: dayItems(items, d).sort(
        (a, b) => Number(Boolean(b.listFirst)) - Number(Boolean(a.listFirst)),
      ),
    }))
    .filter((g) => g.rows.length > 0);
  const strip = Array.from({ length: 7 }, (_, k) => addDays(wk, k));
  // The dots under a day: up to two ink ones for other people's items and one gold one for yours.
  const dots = (d: string) => {
    const list = dayItems(items, d);
    return {
      ink: Math.min(2, list.filter((i) => !i.people.includes(me)).length),
      gold: Math.min(1, list.filter((i) => i.people.includes(me)).length),
    };
  };

  return (
    <div className="ca">
      {/* laptop header */}
      <div className="o-lg">
        <PageHeader
          title="Calendar"
          sub="Cycle dates, interviews, events, posts and due dates in one place"
          actionsClass="ca-acts"
        >
          <button
            type="button"
            className="o-btn s lg ca-sq"
            aria-label="Previous month"
            onClick={() => setMonth(addMonths(month, -1))}
          >
            <Chev dir="left" />
          </button>
          <span className="ca-mt">{monthTitle(month)}</span>
          <button
            type="button"
            className="o-btn s lg ca-sq"
            aria-label="Next month"
            onClick={() => setMonth(addMonths(month, 1))}
          >
            <Chev dir="right" />
          </button>
          <button type="button" className="o-btn s lg" onClick={goToday}>
            Today
          </button>
          <button type="button" className="o-btn s lg" onClick={addEvent}>
            <OIcon name="plus" size={16} />
            Add event
          </button>
        </PageHeader>
      </div>
      {/* phone header */}
      <div className="ca-hrow o-ph">
        <div>
          <h1>{monthTitle(wk)}</h1>
          <p>Week of {dayLabel(wk)}</p>
        </div>
        <div className="ca-ib2">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => setWk(addDays(wk, -7))}
          >
            <Chev dir="left" size={22} />
          </button>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => setWk(addDays(wk, 7))}
          >
            <Chev dir="right" size={22} />
          </button>
        </div>
      </div>

      <div className="ca-bar o-lg">
        <div className="o-seg" role="group" aria-label="View">
          {(["month", "week", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              className={view === v ? "on" : ""}
              aria-pressed={view === v}
              onClick={() => setView(v)}
            >
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        <label className="o-chip">
          <span>Person</span>
          <select value={who} onChange={(e) => setWho(e.target.value)}>
            <option value="">Everyone</option>
            {data.people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <OIcon name="down" size={14} />
        </label>
        <div className="ca-lg" aria-label="Legend">
          <span>
            <i className="ca-sw s" />
            Scholarships
          </span>
          <span>
            <i className="ca-sw p" />
            Programs
          </span>
          <span>
            <i className="ca-sw m" />
            Money
          </span>
          <span>
            <i className="ca-sw o" />
            Outreach
          </span>
          <span>
            <i className="ca-sw y">
              <i className="ca-nd" />
            </i>
            Yours
          </span>
        </div>
      </div>

      <div className="ca-body o-lg">
        <section className="ca-cal" aria-label={monthTitle(month)}>
          <div className="ca-wd">
            {WD.map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div
            className="ca-weeks"
            style={{
              gridTemplateRows: `repeat(${weeks.length}, minmax(min-content, 1fr))`,
            }}
          >
            {weeks.map((days) => {
              const lay = layoutWeek(days, items);
              return (
                <div key={days[0]} className="ca-wk">
                  <div className="ca-cells" aria-hidden="true">
                    {days.slice(0, 6).map((d) => (
                      <span
                        key={d}
                        className={d === today ? "today" : ""}
                        onClick={() => pick(d)}
                      />
                    ))}
                    <span
                      className={days[6] === today ? "today last" : "last"}
                      onClick={() => pick(days[6])}
                    />
                  </div>
                  {days.map((d, c) => (
                    <button
                      key={d}
                      type="button"
                      className={`ca-dn${d === today ? " is-tdy" : ""}${d.slice(0, 7) !== month.slice(0, 7) ? " is-mu" : ""}`}
                      style={{ gridColumn: c + 1, gridRow: 1 }}
                      onClick={() => pick(d)}
                      aria-label={dayLabel(d)}
                    >
                      <span>{dayNum(d)}</span>
                    </button>
                  ))}
                  {lay.bars.map((p) => (
                    <Ev key={p.item.id} p={p} me={me} onPick={pick} />
                  ))}
                  {lay.chips.map((p) => (
                    <Ev key={p.item.id} p={p} me={me} onPick={pick} />
                  ))}
                  {lay.more.map((m) => (
                    <button
                      key={m.col}
                      type="button"
                      className="ca-more"
                      style={{ gridColumn: m.col + 1, gridRow: m.lane + 1 }}
                      onClick={() => pick(days[m.col])}
                    >
                      +{m.n} more
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
        <SidePanel day={sel} today={today} items={items} names={names} />
      </div>

      {/* phone: week strip and agenda */}
      <div className="ca-wkc o-ph" role="group" aria-label="This week">
        {strip.map((d, k) => {
          const dt = dots(d);
          return (
            <button
              key={d}
              type="button"
              className={`ca-dc${d === today ? " today" : ""}${d === sel ? " sel" : ""}`}
              aria-pressed={d === sel}
              onClick={() => setSel(d)}
              aria-label={dayLabel(d)}
            >
              <span className="ca-dc-w">{WD1[k]}</span>
              <b>{dayNum(d)}</b>
              <span className="ca-dts">
                {Array.from({ length: dt.ink }, (_, n) => (
                  <i key={n} />
                ))}
                {dt.gold ? <i className="y" /> : null}
              </span>
            </button>
          );
        })}
      </div>
      <section className="ca-agenda o-ph" aria-label="Agenda">
        {agenda.length === 0 ? (
          <p className="ca-none">Nothing scheduled in these three days.</p>
        ) : null}
        {agenda.map((g) => (
          <div key={g.d}>
            <p className="ca-tg">{dayLabel(g.d)}</p>
            {g.rows.map((it) => (
              <AgendaRow key={it.id} it={it} me={me} names={names} />
            ))}
          </div>
        ))}
      </section>
    </div>
  );
}
