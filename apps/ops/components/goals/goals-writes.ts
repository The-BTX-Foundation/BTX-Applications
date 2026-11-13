'use client';

// The Goals page's write actions for LIVE mode (mock mode never calls these; the page changes its own state, like the demo).
// Each returns true/false so the page can put the cell back and show "Couldn't save. Try again." when the database says no.
// Row-level security decides who may write (year_figures: admins and board members); nothing here widens it. A write that
// RLS filters out matches zero rows and returns no error, so every call asks for the changed row back and counts anything
// but exactly one row as a failure. Every call gives up after 15 seconds.
import { getBrowserClient } from '@btx/data';
import type { FigureMetric } from '@/lib/goals-view';

type Rows = { data: { year: number }[] | null; error: unknown };
type Abortable<T> = { abortSignal: (s: AbortSignal) => Promise<T> };
// A filter chain that ends in .select(): .eq(...).eq(...).select('year').
type Filter = { eq: (c: string, v: unknown) => Filter; select: (c: string) => Abortable<Rows> };
type Loose = {
  from: (t: string) => {
    upsert: (v: Record<string, unknown>, o: { onConflict: string }) => { select: (c: string) => Abortable<Rows> };
    update: (v: Record<string, unknown>) => Filter;
    delete: () => Filter;
  };
};
const db = () => getBrowserClient() as unknown as Loose;
// A fresh 15-second limit for one request.
const limit = () => AbortSignal.timeout(15_000);

// True when exactly one row came back without an error.
const one = ({ data, error }: Rows) => !error && Array.isArray(data) && data.length === 1;

/** Saves one past year's figure (money in cents, applicants as a count): insert, or replace the stored value. */
export async function saveFigure(year: number, metric: FigureMetric, value: number): Promise<boolean> {
  try {
    return one(await db().from('year_figures').upsert({ year, metric, value }, { onConflict: 'year,metric' }).select('year').abortSignal(limit()));
  } catch {
    return false;
  }
}

/**
 * Undo of a save: puts the old value back, or removes the row when the cell was empty before. Either write only touches
 * the row while it still holds the value this person saved (`.eq('value', saved)`), so a colleague's newer figure is never
 * deleted or overwritten; zero rows back (changed by someone else, or refused) is a failure.
 */
export async function undoFigure(year: number, metric: FigureMetric, saved: number, before: number | null): Promise<boolean> {
  try {
    const t = db().from('year_figures');
    const q = before != null ? t.update({ value: before }) : t.delete();
    return one(await q.eq('year', year).eq('metric', metric).eq('value', saved).select('year').abortSignal(limit()));
  } catch {
    return false;
  }
}
