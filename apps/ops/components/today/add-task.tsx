'use client';

// "Add a task" in place on Today: a quiet row that turns into a field. As the person types, words like "fri" or "budget"
// show as chips (the due day, the area); tapping a chip takes that guess away. Enter adds the task and keeps the field open
// for the next one; Escape or leaving the field closes it. On a laptop, N opens it from anywhere on the page.
import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { parseTask, shortDate, type ParsedTask } from '@/lib/today-time';
import { TdIcon } from './td-icons';

export type AddTaskHandle = { open: () => void };

type Props = {
  today: string;
  /** Called with what was read from the field; the board adds the row. */
  onAdd: (p: ParsedTask) => void;
  /** Called before the field opens (the board switches to the Mine tab). */
  onOpening: () => void;
};

// The add row and its field.
export const AddTask = forwardRef<AddTaskHandle, Props>(function AddTask({ today, onAdd, onOpening }, ref) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [dismissed, setDismissed] = useState({ date: false, area: false });
  const inputRef = useRef<HTMLInputElement>(null);
  const openRef = useRef<HTMLButtonElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const chipTap = useRef(false);

  // Opens the field and puts the cursor in it.
  const show = () => {
    onOpening();
    setOpen(true);
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  useImperativeHandle(ref, () => ({ open: show }));

  // Closes the field; `clear` also forgets what was typed.
  const close = (clear: boolean) => {
    if (clear) {
      setValue('');
      setDismissed({ date: false, area: false });
    }
    setOpen(false);
  };

  const parsed = parseTask(today, value, dismissed);

  // Adds the task and keeps the field open for the next one.
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.title) return;
    onAdd(parsed);
    setValue('');
    setDismissed({ date: false, area: false });
    inputRef.current?.focus();
  };

  return (
    <div className="td-add">
      <button type="button" ref={openRef} className="td-add-open" hidden={open} onClick={show}>
        <span className="td-plus">
          <TdIcon name="plus" />
        </span>
        <span className="td-lab">Add a task</span>
        <span className="td-kbd" aria-hidden="true">
          N
        </span>
      </button>
      <form className="td-add-form" ref={formRef} hidden={!open} autoComplete="off" onSubmit={submit}>
        <div className="td-add-field">
          <span className="td-plus">
            <TdIcon name="plus" />
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
          <span className="td-add-hint">Enter to add</span>
        </div>
        <div className="rf-chips" aria-live="polite" onPointerDown={() => (chipTap.current = true)} onMouseDown={(e) => e.preventDefault()}>
          {parsed.dueOn ? (
            <button
              type="button"
              key={`d-${parsed.dueOn}`}
              className="rf-pchip rf-new"
              aria-label={`Due ${shortDate(parsed.dueOn)}. Remove`}
              onClick={() => {
                chipTap.current = false;
                setDismissed((d) => ({ ...d, date: true }));
                inputRef.current?.focus();
              }}
            >
              <TdIcon name="cal" />
              {shortDate(parsed.dueOn)}
              <TdIcon name="x" className="rf-x" />
            </button>
          ) : null}
          {parsed.area ? (
            <button
              type="button"
              key={`a-${parsed.area}`}
              className="rf-pchip rf-new"
              aria-label={`Area ${parsed.area}. Remove`}
              onClick={() => {
                chipTap.current = false;
                setDismissed((d) => ({ ...d, area: true }));
                inputRef.current?.focus();
              }}
            >
              {parsed.area}
              <TdIcon name="x" className="rf-x" />
            </button>
          ) : null}
        </div>
      </form>
    </div>
  );
});
