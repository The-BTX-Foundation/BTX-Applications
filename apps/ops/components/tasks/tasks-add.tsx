'use client';

// "Add a task" in place on Tasks: Today's quiet row that turns into a field, with one difference: when an area filter is
// on, the row says "Add a Finance task" and a new task takes that area unless another area word is typed or the area
// chip is tapped away (parseAdd in lib/tasks-time.ts). Words like "fri" or "budget" show as chips as the person types;
// Enter adds and keeps the field open; Escape or leaving the field closes it. N opens it from anywhere (the board).
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { parseAdd, shortDate } from '@/lib/tasks-time';
import type { ParsedTask } from '@/lib/today-time';
import { Icon } from '@/components/refresh/icons';

/** `restore` puts words back in the field after a failed add (only when nothing new was typed since). */
export type AddTaskHandle = { open: () => void; restore: (text: string) => void };

type Props = {
  today: string;
  /** The area filter in play ('' for all): it names the row and pre-fills the new task's area. */
  area: string;
  /** Called with what was read from the field (and the words typed); the board adds the row. False keeps the words. */
  onAdd: (p: ParsedTask, text: string) => boolean | void;
  /** Called before the field opens (the board leaves the Approvals tab). */
  onOpening: () => void;
};

// The add row and its field.
export const TasksAdd = forwardRef<AddTaskHandle, Props>(function TasksAdd({ today, area, onAdd, onOpening }, ref) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [dismissed, setDismissed] = useState({ date: false, area: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  // Set while a chip is being tapped, so the field's blur does not close the form under the tap.
  const chipTap = useRef(false);

  // Opens the field and puts the cursor in it in the same tap (drawn at once, so the first keys typed land in it and the
  // phone keyboard opens: iOS only opens it for a focus made inside the tap itself).
  const show = () => {
    onOpening();
    flushSync(() => setOpen(true));
    inputRef.current?.focus();
  };
  useImperativeHandle(ref, () => ({ open: show, restore: (text: string) => setValue((v) => v || text) }));

  // Closes the field; `clear` also forgets what was typed.
  const close = (clear: boolean) => {
    if (clear) {
      setValue('');
      setDismissed({ date: false, area: false });
    }
    setOpen(false);
  };

  const parsed = parseAdd(today, value, dismissed, area);

  // Adds the task and keeps the field open for the next one.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.title) return;
    // A failed add keeps what was typed, so nothing has to be typed again.
    if (onAdd(parsed, value) === false) return;
    setValue('');
    setDismissed({ date: false, area: false });
    inputRef.current?.focus();
  };

  // Takes one guessed chip away (the date or the area) and puts the cursor back in the field.
  const drop = (kind: 'date' | 'area') => {
    chipTap.current = false;
    setDismissed((d) => ({ ...d, [kind]: true }));
    inputRef.current?.focus();
  };

  return (
    <div className="tk-add">
      <button type="button" ref={openRef} className="tk-add-open" hidden={open} onClick={show}>
        <span className="tk-plus">
          <Icon name="plus" />
        </span>
        <span className="tk-lab">{area ? `Add a ${area} task` : 'Add a task'}</span>
        <span className="tk-kbd" aria-hidden="true">
          N
        </span>
      </button>
      <form className="tk-add-form" ref={formRef} hidden={!open} autoComplete="off" onSubmit={submit}>
        <div className="tk-add-field">
          <span className="tk-plus">
            <Icon name="plus" />
          </span>
          <input
            ref={inputRef}
            type="text"
            enterKeyHint="done"
            maxLength={300}
            value={value}
            aria-label="New task. Words like fri or budget set the date and area."
            placeholder="New task, e.g. Call the venue fri"
            onChange={(e) => {
              setValue(e.target.value);
              if (!e.target.value.trim()) setDismissed({ date: false, area: false });
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                close(true);
                requestAnimationFrame(() => openRef.current?.focus());
              }
            }}
            onBlur={() =>
              window.setTimeout(() => {
                if (chipTap.current) {
                  chipTap.current = false;
                  inputRef.current?.focus();
                  return;
                }
                if (!formRef.current?.contains(document.activeElement)) close(false);
              }, 150)
            }
          />
          <span className="tk-add-hint">Enter to add</span>
        </div>
        <div className="rf-chips" aria-live="polite" onPointerDown={() => (chipTap.current = true)} onMouseDown={(e) => e.preventDefault()}>
          {parsed.dueOn ? (
            <button type="button" key={`d-${parsed.dueOn}`} className="rf-pchip rf-new" aria-label={`Due ${shortDate(parsed.dueOn)}. Remove`} onClick={() => drop('date')}>
              <Icon name="cal" />
              {shortDate(parsed.dueOn)}
              <Icon name="x" className="rf-x" />
            </button>
          ) : null}
          {parsed.area ? (
            <button type="button" key={`a-${parsed.area}`} className="rf-pchip rf-new" aria-label={`Area ${parsed.area}. Remove`} onClick={() => drop('area')}>
              {parsed.area}
              <Icon name="x" className="rf-x" />
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
});
