'use client';

// The refreshed tab bar: light text tabs with a count, and a gold line that slides under the selected tab. ARIA tabs
// (tablist, tab, aria-selected, aria-controls, roving tabIndex); Left/Right arrows move and select. The page draws the
// tab panels itself with ids `${idBase}-p-${tab id}` labelled by `${idBase}-tab-${tab id}`.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export type TabItem<T extends string> = { id: T; label: string; count?: number };

type TabsProps<T extends string> = { label: string; idBase: string; tabs: TabItem<T>[]; value: T; onChange: (id: T) => void };

// One tab bar.
export function Tabs<T extends string>({ label, idBase, tabs, value, onChange }: TabsProps<T>) {
  const refs = useRef<Partial<Record<T, HTMLButtonElement | null>>>({});
  const [ink, setInk] = useState<{ x: number; w: number; ready: boolean }>({ x: 0, w: 0, ready: false });
  // Counts change the tab widths, so the line re-measures when any count changes.
  const counts = tabs.map((t) => t.count ?? '').join(',');

  // Slides the gold ink under the selected tab (measured, so any label width fits).
  const moveInk = useCallback(() => {
    const el = refs.current[value];
    if (!el || !el.offsetWidth) return;
    setInk((i) => (i.x === el.offsetLeft && i.w === el.offsetWidth ? i : { ...i, x: el.offsetLeft, w: el.offsetWidth }));
  }, [value]);
  useLayoutEffect(() => {
    moveInk();
  }, [moveInk, counts]);
  useEffect(() => {
    let r = 0;
    // Measure again once the web font has loaded; only then turn the slide animation on (no slide on first paint).
    void document.fonts?.ready.then(() => {
      moveInk();
      r = requestAnimationFrame(() => setInk((i) => ({ ...i, ready: true })));
    });
    window.addEventListener('resize', moveInk);
    return () => {
      cancelAnimationFrame(r);
      window.removeEventListener('resize', moveInk);
    };
  }, [moveInk]);

  // Arrow keys move between the tabs (wrapping) and select the one they land on.
  const onKey = (e: React.KeyboardEvent, i: number) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length].id;
    onChange(next);
    refs.current[next]?.focus();
  };

  return (
    <div className="rf-tabbar" role="tablist" aria-label={label}>
      {tabs.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[t.id] = el;
          }}
          type="button"
          role="tab"
          id={`${idBase}-tab-${t.id}`}
          aria-selected={value === t.id}
          aria-controls={`${idBase}-p-${t.id}`}
          tabIndex={value === t.id ? 0 : -1}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => onKey(e, i)}
        >
          {t.label}
          {t.count !== undefined ? (
            <>
              {' '}
              <span className="rf-n">{t.count}</span>
            </>
          ) : null}
        </button>
      ))}
      <span className={`rf-tab-ink${ink.ready ? ' rf-ready' : ''}`} aria-hidden="true" style={{ width: ink.w, transform: `translateX(${ink.x}px)` }} />
    </div>
  );
}
