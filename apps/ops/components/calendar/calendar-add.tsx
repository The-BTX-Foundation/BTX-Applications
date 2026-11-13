'use client';

// "Add an event" in place on the Calendar: a quiet row that turns into a field; as the person types, chips under it show the
// day, time and area read from the words ("Board call thu 7pm"). A found part has a gold edge and an x to turn it back
// into plain words; the Area chip cycles the areas. Enter adds and keeps the field open; Escape, or leaving it empty,
// closes it. After an add, "Added Thu Nov 12, 7:00 PM, saved 9:14 AM · Undo". Presentational: the board owns the state.
// Demo reference: addBlock(), updateChips() and the add handlers in apps/design/ops-refresh/directions/p-calendar/index.html.
import { useState } from 'react';
import { Icon } from '@/components/refresh/icons';
import { shortDate } from '@/lib/refresh-time';
import { areaName, clockMin, type ParsedEvent } from '@/lib/calendar-time';

/** The add field's state, owned by the board (one field state, drawn in the chosen day and in the agenda). */
export type AddUi = {
  adding: boolean;
  text: string;
  parsed: ParsedEvent;
  /** The day an add without a day word goes to (the chosen day). */
  sel: string;
  err: string | null;
  after: { day: string; time: number | null; at: string } | null;
  /** The Undo after an add is drawn (caps.undoAdd). */
  canUndo: boolean;
  /** Today's year ("2026"): a day in another year shows its year. */
  year: string;
};

// "Thu Nov 12", or "Fri Jan 15, 2027" when the day is not in this year.
const dayText = (d: string, year: string) => (d.slice(0, 4) === year ? shortDate(d) : `${shortDate(d)}, ${d.slice(0, 4)}`);

type Props = {
  where: 'day' | 'top';
  ui: AddUi;
  onOpen: () => void;
  onText: (t: string) => void;
  onSubmit: () => void;
  onEscape: () => void;
  onBlur: () => void;
  onChip: (kind: 'day' | 'time' | 'area', found: boolean) => void;
  onUndo: () => void;
};

// One add block (`where` picks its label and look: in the chosen day, or at the top of the agenda).
export function AddEvent({ where, ui, onOpen, onText, onSubmit, onEscape, onBlur, onChip, onUndo }: Props) {
  const p = ui.parsed;
  const day = p.day ?? ui.sel;
  const area = p.area ?? 'scholarships';
  // The chips' last values: a chip whose value just changed pops in (the demo's `.new`).
  const parts = [day, String(p.time), area];
  // Kept as state (updated while drawing when the chips change): the values before the last change, none when just opened.
  const key = ui.adding ? parts.join('|') : '';
  const [seen, setSeen] = useState<{ key: string; prev: string[] | null; cur: string[] | null }>({ key, prev: null, cur: ui.adding ? parts : null });
  if (seen.key !== key) setSeen({ key, prev: seen.cur, cur: ui.adding ? parts : null });
  const changed = (n: number) => (seen.prev && seen.prev[n] !== parts[n] ? ' cal-new' : '');
  const sfx = where === 'day' ? '-d' : '-a';
  return (
    <div className={`cal-add${where === 'top' ? ' cal-top' : ''}`}>
      <button type="button" className="cal-add-open" data-k="openadd" hidden={ui.adding} onClick={onOpen}>
        <span className="cal-plus">
          <Icon name="plus" />
        </span>
        <span className="cal-lab">{where === 'day' ? `Add to ${shortDate(ui.sel)}` : 'Add an event'}</span>
        <span className="cal-kbd" aria-hidden="true">
          N
        </span>
      </button>
      <form
        className="cal-add-form"
        hidden={!ui.adding}
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
      >
        <div className="cal-add-field">
          <span className="cal-plus">
            <Icon name="plus" />
          </span>
          <input
            id={`cal-add-in${sfx}`}
            data-k="addin"
            type="text"
            enterKeyHint="done"
            aria-label="New event. Words like thu or 7pm set the day and time."
            placeholder="New event, e.g. Board call thu 7pm"
            value={ui.text}
            onChange={(e) => onText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                onEscape();
              }
            }}
            onBlur={onBlur}
          />
          <span className="cal-add-hint">Enter to add</span>
          <button type="submit" className="rf-lnk cal-add-go">
            Add
          </button>
        </div>
        {/* The chips keep the focus in the field (mousedown does not take it). */}
        <div className="cal-chips" onMouseDown={(e) => e.preventDefault()}>
          {ui.adding ? (
            <>
              <button type="button" className={`cal-pchip${p.found.day ? ' cal-found' : ''}${changed(0)}`} aria-label={`Day ${dayText(day, ui.year)}${p.found.day ? '. Remove' : ''}`} onClick={() => onChip('day', p.found.day)}>
                <Icon name="cal" />
                {dayText(day, ui.year)}
                {p.found.day ? <Icon name="x" className="cal-x" /> : null}
              </button>
              <button type="button" className={`cal-pchip${p.time != null ? ' cal-found' : ''}${changed(1)}`} aria-label={p.time != null ? `${clockMin(p.time)}. Remove` : 'All day'} onClick={() => onChip('time', p.time != null)}>
                <Icon name="clock" />
                {p.time != null ? (
                  <>
                    {clockMin(p.time)}
                    <Icon name="x" className="cal-x" />
                  </>
                ) : (
                  'All day'
                )}
              </button>
              <button type="button" className={`cal-pchip${p.found.area ? ' cal-found' : ''}${changed(2)}`} aria-label={`Area ${areaName(area)}. Tap to change`} onClick={() => onChip('area', p.found.area)}>
                <span className="cal-k">Area</span>
                {areaName(area)}
              </button>
            </>
          ) : null}
        </div>
        {ui.err ? (
          <p className="cal-add-err">
            {ui.err}
          </p>
        ) : null}
      </form>
      {ui.after ? (
        <div className="cal-after">
          <span className="rf-tick">
            <Icon name="check" />
          </span>
          <span>
            Added {dayText(ui.after.day, ui.year)}
            {ui.after.time != null ? `, ${clockMin(ui.after.time)}` : ''}, saved {ui.after.at}
          </span>
          {ui.canUndo ? (
            <>
              <span aria-hidden="true">·</span>
              <button type="button" className="rf-lnk" data-k="unadd" onClick={onUndo}>
                Undo
              </button>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
