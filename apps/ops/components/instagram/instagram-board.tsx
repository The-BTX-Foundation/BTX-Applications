'use client';

// Outreach > Instagram (Ops Hub refresh, demo p-instagram): posts by month beside the selected post (laptop); on the phone
// the post opens under its row. The selected post shows its five steps, its caption, its photo and the one thing it needs
// now. Live mode draws only the real writes: "Add a post" and "Send for approval" (lib/instagram-writes.ts). Ticking steps,
// the caption, owners, nudges, schedule, posted and undo have no backing write yet and are drawn in mock mode only.
// Nothing here posts to Instagram.
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition, type CSSProperties, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Icon } from '@/components/refresh/icons';
import { Fold, foldMs } from '@/components/refresh/fold';
import { NewsCard } from '@/components/refresh/news-card';
import { clock, daysFrom, easternDay, fullDate, shortDate, weekday } from '@/lib/refresh-time';
import { postRel, readPostLine, type Dismissed } from '@/lib/instagram-time';
import { first, focusPost, groupPosts, isPosted, nDone, newsOf, nowStep, stateWords, stepName, waitsOnApproval, waitsOnCaption, type StateWords } from '@/lib/instagram-map';
import { addEffect, emptyWords, ESCAPE_FOCUS, mayMoveFocus, NEED_WORDS, runSend, sendEffect, sentWords, submitDay } from '@/lib/instagram-flow';
import { addPost, forgetPostIds, postKey, sendForApproval, type NewPost } from '@/lib/instagram-writes';
import { dropNotAdded, keepNotAdded, notAddedServerSnapshot, notAddedSnapshot, setNotAddedState, subscribeNotAdded, dropListedNotAdded } from '@/lib/instagram-unadded';
import type { IgPerson, IgPost, IgView } from '@/lib/instagram-view';
import { IgBoardSk, IgHead, OutreachNav } from './instagram-skeleton';

type Props = { view: IgView; live: boolean };

/** Mock-only state of one post's open controls (nudge draft, caption editor, owner picker) and its undo memory. */
type PostUi = {
  nudge?: 'none' | 'draft' | 'sent';
  nudgeText?: string;
  nudgeAt?: string;
  editing?: boolean;
  capEdit?: boolean;
  capDraft?: string;
  showFull?: boolean;
  capSavedAt?: string | null;
  prevCap?: string | null;
  prevStep0?: boolean;
  ownSavedAt?: string | null;
  prevOwner?: IgPerson | null;
  chown?: boolean;
  sending?: boolean;
  nudgeClosing?: boolean;
  /** The send's failure line, shown above Send. */
  saveErr?: string | null;
};

const PHONE_Q = '(max-width: 759px)';
const subscribePhone = (cb: () => void) => {
  const mq = window.matchMedia(PHONE_Q);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
};
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// "Tue, Nov 10" beside the title.
const headDate = (today: string) => `${weekday(today)}, ${shortDate(today).split(' ').slice(1).join(' ')}`;
// The nudge's words.
const nudgeWords = (p: IgPost, today: string) => `Hi ${first(p.captionBy?.name ?? '')}, the ${p.slug || p.title} post goes out ${postRel(today, p.date).toLowerCase()}. Could you send the caption?`;

// A name (or any words) kept on one line.
const Nw = ({ children }: { children: ReactNode }) => <span className="rf-nowrap">{children}</span>;

// A person: initials circle and name (yours gold); nobody: a dashed "?" and "No owner".
function Who({ p, me }: { p: IgPerson | null; me: string | null }) {
  if (!p) {
    return (
      <span className="ig-who ig-none">
        <span className="ig-av" aria-hidden="true">
          ?
        </span>
        No owner
      </span>
    );
  }
  return (
    <span className={`ig-who${p.id === me ? ' ig-me' : ''}`}>
      <span className="ig-av" aria-hidden="true">
        {p.initials}
      </span>
      {p.name}
    </span>
  );
}

// "Waiting on Keith's caption" (clock line) or "Next: pick the photo" (plain words).
function State({ w }: { w: StateWords }) {
  if (!w) return null;
  const words = (
    <>
      {w.pre}
      {w.name ? <Nw>{w.name}</Nw> : null}
      {w.post ?? ''}
    </>
  );
  if (w.wait) {
    return (
      <span className="ig-waiting">
        <Icon name="wait" />
        <span>{words}</span>
      </span>
    );
  }
  return <span className="ig-sw">{words}</span>;
}

// A small round gold tick and a line ("Sent ... 9:14 AM · Undo").
function DoneLine({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p className="ig-done-line" style={style}>
      <span className="ig-tick">
        <Icon name="check" />
      </span>
      <span>{children}</span>
    </p>
  );
}

// The page.
export function InstagramBoard({ view, live }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { caps, me, staff } = view;
  // The Eastern day. Mock mode keeps the sample's day; live mode moves it on each minute while the page stays open, so
  // relative words ("Tomorrow"), the past-row rule and the typed line's day words never use the day the page loaded.
  const [liveDay, setLiveDay] = useState(view.today);
  const today = live ? liveDay : view.today;
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => setLiveDay(easternDay(new Date().toISOString())), 60_000);
    return () => window.clearInterval(t);
  }, [live]);
  const [, startRefresh] = useTransition();
  const [retrying, startRetry] = useTransition();
  const phone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_Q).matches, () => false);

  // Posts this page added that the server does not list yet, and changes made here (mock edits, a live send).
  const [local, setLocal] = useState<IgPost[]>([]);
  const [edits, setEdits] = useState<Record<string, Partial<IgPost>>>({});
  const [ui, setUi] = useState<Record<string, PostUi>>({});
  const serverIds = useMemo(() => new Set(view.posts.map((p) => p.id)), [view.posts]);
  // Every settled refresh brings new server rows: the server's values win, so the changes made here are dropped and the
  // added posts the server now lists leave the local list (React's "reset state when a prop changes" pattern).
  const [seen, setSeen] = useState(view.posts);
  if (seen !== view.posts) {
    setSeen(view.posts);
    setEdits({});
    setLocal((l) => l.filter((p) => !serverIds.has(p.id)));
  }
  const posts = useMemo(
    () => [...view.posts, ...local.filter((p) => !serverIds.has(p.id))].map((p) => (edits[p.id] ? { ...p, ...edits[p.id] } : p)),
    [view.posts, local, serverIds, edits],
  );
  const postsRef = useRef(posts);
  useEffect(() => {
    postsRef.current = posts;
  }, [posts]);
  // Once the server lists a post this page added, a retry of the same words is a new post.
  // A failed add whose last try the server lists did save after all: its error and its words go away.
  useEffect(() => {
    forgetPostIds(serverIds);
    dropListedNotAdded(me, serverIds);
  }, [serverIds, me]);

  const [sel, setSel] = useState<string | null>(() => focusPost(view.posts, today)?.id ?? view.posts[0]?.id ?? null);
  const [phoneOpen, setPhoneOpen] = useState(true);
  const [closing, setClosing] = useState(false);
  const [enterId, setEnterId] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [pop, setPop] = useState<string | null>(null);
  const [announce, setAnnounce] = useState('');

  // The add line.
  const [adding, setAdding] = useState(() => caps.add && !view.loadFailed && view.posts.length === 0);
  const [text, setText] = useState('');
  const [dismissed, setDismissed] = useState<Dismissed>({});
  const [needWords, setNeedWords] = useState(false);
  const chipTap = useRef(false);

  const notAdded = useSyncExternalStore(subscribeNotAdded, () => notAddedSnapshot(me), notAddedServerSnapshot);

  const rootRef = useRef<HTMLDivElement>(null);
  // The empty page opens with the cursor in the add line.
  const focusSel = useRef<string | null>(adding ? '#ig-add-in' : null);
  const focusSoft = useRef(false);
  const [, bump] = useState(0);
  // Asks for focus on a selector (first match of "a|b" that shows) after the next render. `afterWrite` is a move at the end
  // of a write that finished later: it is skipped while the person is typing in a field (lib/instagram-flow.ts).
  const focusTo = useCallback((sel: string, afterWrite = false) => {
    focusSel.current = sel;
    focusSoft.current = afterWrite;
    bump((n) => n + 1);
  }, []);
  const timers = useRef<number[]>([]);
  const minute = useRef(13);
  const tempN = useRef(0);
  const busy = useRef(new Set<string>());

  // Runs a callback later, cleared when the page goes away.
  const later = useCallback((fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  }, []);
  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  // Says one line in the page's polite live region (cleared first, so the same words are read again).
  const say = useCallback(
    (m: string) => {
      setAnnounce('');
      later(() => setAnnounce(m), 30);
    },
    [later],
  );

  // Moves focus after the next render to the first selector that exists and shows.
  useEffect(() => {
    const want = focusSel.current;
    if (!want) return;
    focusSel.current = null;
    if (!mayMoveFocus(focusSoft.current, document.activeElement?.tagName)) return;
    for (const s of want.split('|')) {
      const el = rootRef.current?.querySelector<HTMLElement>(s);
      if (el && el.offsetParent !== null) {
        el.focus({ preventScroll: true });
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) el.setSelectionRange(el.value.length, el.value.length);
        return;
      }
    }
  });

  // "N" opens the add line (not while typing).
  useEffect(() => {
    if (!caps.add || view.loadFailed) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if ((e.key === 'n' || e.key === 'N') && !e.metaKey && !e.ctrlKey && !e.altKey && !t?.closest('input, textarea, select, [contenteditable]')) {
        e.preventDefault();
        setAdding(true);
        focusTo('#ig-add-in');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [caps.add, view.loadFailed, focusTo]);

  // Flashes a row for a moment.
  const flashRow = (id: string) => {
    setFlash(null);
    window.requestAnimationFrame(() => setFlash(id));
    later(() => setFlash((f) => (f === id ? null : f)), 1700);
  };

  // The time words for "Saved 9:14 AM": the demo's ticking clock in mock mode, Eastern time now in live mode.
  const nowWords = () => {
    if (live) return clock(new Date().toISOString());
    minute.current += 1;
    return `9:${String(minute.current).padStart(2, '0')} AM`;
  };

  const patch = (id: string, ch: Partial<IgPost>) => setEdits((e) => ({ ...e, [id]: { ...e[id], ...ch } }));
  const setU = (id: string, ch: PostUi) => setUi((u) => ({ ...u, [id]: { ...u[id], ...ch } }));

  // ---------- Selecting a post ----------

  const pick = (id: string) => {
    if (phone) {
      if (id === sel && phoneOpen && !closing) {
        setClosing(true);
        later(() => {
          setPhoneOpen(false);
          setClosing(false);
        }, foldMs());
        return;
      }
      setSel(id);
      setPhoneOpen(true);
      setClosing(false);
      setEnterId(id);
    } else setSel(id);
    focusTo(`#ig-row-${id}`);
  };

  // The news card: opens the post, brings its row into view and rings it.
  const openNews = (id: string) => {
    setSel(id);
    if (phone) {
      setPhoneOpen(true);
      setClosing(false);
      setEnterId(id);
    }
    window.requestAnimationFrame(() => {
      const r = document.getElementById(`ig-row-${id}`);
      if (!r) return;
      r.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
      r.classList.remove('ig-ring');
      r.getBoundingClientRect();
      r.classList.add('ig-ring');
    });
  };

  // ---------- Mock-only actions on the selected post ----------

  const toggleStep = (p: IgPost, k: number) => {
    const steps = p.steps.map((x, j) => (j === k ? !x : x));
    patch(p.id, { steps });
    if (k === 0 && !steps[0]) setU(p.id, { capSavedAt: null });
    focusTo(`[data-step="${k}"]`);
    flashRow(p.id);
    if (steps[k]) {
      setPop(null);
      window.requestAnimationFrame(() => setPop(`${p.id}:${k}`));
    }
    say(`${stepName(p, k)}: ${steps[k] ? 'done' : 'not done'}`);
  };

  // The step checks and "Change owner" read their post from data attributes, so no handler is made while drawing.
  const onStepClick = (e: { currentTarget: HTMLElement }) => {
    const p = posts.find((x) => x.id === e.currentTarget.dataset.post);
    if (p) toggleStep(p, Number(e.currentTarget.dataset.step));
  };
  const onChownClick = (e: { currentTarget: HTMLElement }) => {
    const id = e.currentTarget.dataset.post ?? '';
    const open = !!ui[id]?.chown;
    setU(id, { chown: !open });
    focusTo(open ? '[data-x="chown"]' : '.ig-picks .ig-pick');
  };

  const setOwner = (p: IgPost, who: IgPerson) => {
    patch(p.id, { owner: who });
    setU(p.id, { prevOwner: p.owner, chown: false, ownSavedAt: nowWords() });
    flashRow(p.id);
    focusTo('[data-x="unown"]');
    say(`${who.name} owns ${p.title}`);
  };

  const undoOwner = (p: IgPost) => {
    patch(p.id, { owner: ui[p.id]?.prevOwner ?? null });
    setU(p.id, { ownSavedAt: null });
    flashRow(p.id);
    focusTo('[data-x="chown"]|[data-row-sel]');
    say('Owner change undone');
  };

  const saveCaption = (p: IgPost) => {
    const v = (ui[p.id]?.capDraft ?? '').trim();
    if (!v) {
      focusTo('[data-cap-in]');
      return;
    }
    setU(p.id, { prevCap: p.caption, prevStep0: p.steps[0], capEdit: false, capSavedAt: nowWords() });
    patch(p.id, { caption: v, steps: p.steps.map((x, j) => (j === 0 ? true : x)) });
    flashRow(p.id);
    focusTo('[data-x="capundo"]');
    say('Caption saved');
  };

  const undoCaption = (p: IgPost) => {
    const u = ui[p.id] ?? {};
    patch(p.id, { caption: u.prevCap ?? null, steps: p.steps.map((x, j) => (j === 0 ? !!u.prevStep0 : x)) });
    setU(p.id, { capSavedAt: null });
    flashRow(p.id);
    focusTo('[data-x="capedit"]');
    say('Caption change undone');
  };

  const markNext = (p: IgPost) => {
    const i = nowStep(p);
    patch(p.id, { steps: p.steps.map((x, j) => (j === i ? true : x)) });
    flashRow(p.id);
    say(`${stepName(p, i)}: done`);
  };

  const sendNudge = (p: IgPost, words: string) => {
    setU(p.id, { sending: true, nudgeText: words });
    later(() => {
      setU(p.id, { sending: false, nudge: 'sent', editing: false, nudgeAt: nowWords() });
      focusTo('[data-x="capedit"]');
      say(`Nudge sent to ${p.captionBy?.name ?? ''}`);
    }, 450);
  };

  const cancelNudge = (p: IgPost) => {
    // Close the fold first, then forget the draft.
    setU(p.id, { nudgeClosing: true });
    later(() => {
      setU(p.id, { nudge: 'none', nudgeClosing: false, editing: false, nudgeText: '' });
      focusTo('[data-x="nudge"]');
    }, foldMs());
  };

  // ---------- Send for approval (live: a real write) ----------

  const send = async (p: IgPost) => {
    if (busy.current.has(p.id)) return;
    setU(p.id, { sending: true, saveErr: null });
    const result = await runSend(p.id, busy.current, async (id) => {
      if (live) return sendForApproval(id);
      await new Promise((r) => later(() => r(null), 450));
      return view.mockWrite === 'failsend' ? 'failed' : 'ok';
    });
    if (result === 'busy') return;
    const fx = sendEffect(result, live, p.approver, nowWords());
    if (fx.patch) {
      patch(p.id, fx.patch);
      flashRow(p.id);
    }
    setU(p.id, { sending: false, saveErr: fx.error });
    focusTo(fx.focus, true);
    say(fx.say);
    if (fx.refresh) startRefresh(() => router.refresh());
  };

  const unsend = (p: IgPost) => {
    patch(p.id, { sentAt: null, sent: false });
    flashRow(p.id);
    focusTo('[data-x="send"]');
    say('Approval request undone');
  };

  // ---------- Add a post ----------

  const draft = text.trim() ? readPostLine(text, today, staff, dismissed) : null;

  const openAdd = () => {
    setAdding(true);
    focusTo('#ig-add-in');
  };

  const closeAdd = (clear: boolean) => {
    if (clear) {
      setText('');
      setDismissed({});
    }
    setAdding(false);
  };

  // One add: the post shows at once; a failed add goes back out of the list into "Not added" with its words.
  const runAdd = async (np: NewPost, owner: IgPerson | null, retryKey?: string, retryId?: string) => {
    const tmp = `ig-new-${++tempN.current}`;
    const post: IgPost = {
      id: tmp,
      title: np.title,
      date: np.postOn,
      owner,
      steps: [false, false, false, false, false],
      caption: null,
      photo: live ? 'No photo yet' : '[Photo]',
      sent: false,
      sentAt: null,
      approver: live ? null : (staff.find((x) => x.name === 'Keith Dawson') ?? null),
      captionBy: null,
      slug: null,
      note: null,
    };
    setLocal((l) => [...l, post]);
    setSel(tmp);
    setPhoneOpen(!phone);
    flashRow(tmp);
    let r: { ok: boolean; id: string | undefined };
    if (live) r = await addPost(np, me, undefined, undefined, undefined, retryId);
    else {
      await new Promise((res) => later(() => res(null), 0));
      r = { ok: !(view.mockWrite === 'failadd' && !retryKey), id: tmp };
    }
    const fx = addEffect(r, np.title, np.postOn, live, !!retryKey);
    if (!fx.saved) {
      setLocal((l) => l.filter((x) => x.id !== tmp));
      setSel((s) => (s === tmp ? (focusPost(postsRef.current.filter((x) => x.id !== tmp), today)?.id ?? null) : s));
      keepNotAdded(me, { key: retryKey ?? postKey(np, me), post: np, state: 'failed', id: live ? fx.keepId : undefined });
      say(fx.say);
      // The answer may have been lost after a save: a refresh shows the post if it is there (and clears the error).
      if (fx.refresh) startRefresh(() => router.refresh());
      return;
    }
    const id = r.id ?? tmp;
    say(fx.say);
    if (retryKey) {
      dropNotAdded(me, retryKey);
      focusTo(fx.focus, true);
    }
    if (id !== tmp) {
      setLocal((l) => l.map((x) => (x.id === tmp ? { ...x, id } : x)));
      setSel((s) => (s === tmp ? id : s));
    }
    if (live) startRefresh(() => router.refresh());
  };

  const submitAdd = (e: FormEvent) => {
    e.preventDefault();
    if (!caps.add || !view.channelId || !text.trim()) return;
    // Read the line again against the day of the submit (live: the page may have stayed open past midnight).
    const line = readPostLine(text, submitDay(live, today), staff, dismissed);
    if (!line.title) {
      setNeedWords(true);
      say(NEED_WORDS);
      return;
    }
    const np: NewPost = { channelId: view.channelId, title: line.title.slice(0, 200), postOn: line.due, ownerId: line.owner?.id ?? null };
    setText('');
    setDismissed({});
    focusTo('#ig-add-in');
    void runAdd(np, line.owner);
  };

  const retryAdd = (key: string) => {
    const item = notAdded.find((x) => x.key === key);
    if (!item || item.state === 'adding') return;
    setNotAddedState(me, key, 'adding');
    void runAdd(item.post, staff.find((x) => x.id === item.post.ownerId) ?? null, key, item.id);
  };

  const onAddKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      closeAdd(true);
      focusTo(ESCAPE_FOCUS);
    }
  };

  const onAddBlur = () => {
    later(() => {
      if (chipTap.current) {
        chipTap.current = false;
        focusTo('#ig-add-in');
        return;
      }
      const form = rootRef.current?.querySelector('#ig-add-form');
      if (form && !form.contains(document.activeElement)) closeAdd(false);
    }, 150);
  };

  const dropChip = (kind: 'date' | 'owner') => {
    chipTap.current = false;
    setDismissed((d) => ({ ...d, [kind]: true }));
    focusTo('#ig-add-in');
  };

  // ---------- Try again on the load error ----------

  const retry = () =>
    startRetry(() => {
      if (live) router.refresh();
      else router.replace(pathname);
    });

  const live_ = (
    <p className="rf-sr" aria-live="polite">
      {announce}
    </p>
  );

  if (view.loadFailed) {
    return (
      <div className="rf ig" ref={rootRef}>
        <IgHead date={headDate(today)} />
        <OutreachNav />
        {retrying ? (
          <div aria-busy="true">
            <IgBoardSk />
          </div>
        ) : (
          <section className="ig-panel ig-load-err" role="alert">
            <p>
              <b>
                <Icon name="alert" />
                Instagram didn&apos;t load.
              </b>
              <span>Check your connection, then try again.</span>
            </p>
            <button type="button" className="rf-btn" onClick={retry}>
              Try again
            </button>
          </section>
        )}
        {live_}
      </div>
    );
  }

  // ---------- Drawing ----------

  const news = newsOf(posts, today, me, (id) => ui[id]?.nudge === 'sent');
  const selected = posts.find((p) => p.id === sel) ?? null;
  const groups = groupPosts(posts, today, view.target);

  // One post row.
  const row = (p: IgPost) => {
    const n = p.date ? daysFrom(today, p.date) : null;
    const past = n !== null && n < 0;
    const d = p.date ? postRel(today, p.date) : 'No date';
    const on = p.id === sel;
    const posted = isPosted(p);
    return (
      <button
        key={p.id}
        type="button"
        id={`ig-row-${p.id}`}
        data-row-sel={on ? '' : undefined}
        className={`ig-pr${posted ? ' ig-is-posted' : ''}${past ? ' ig-past' : ''}${flash === p.id ? ' ig-flash' : ''}`}
        aria-current={on ? 'true' : 'false'}
        aria-expanded={phone ? on && phoneOpen && !closing : on}
        onClick={() => pick(p.id)}
      >
        <span className={`ig-dblk${n === 0 ? ' ig-today' : ''}${n === 1 ? ' ig-next' : ''}${p.date ? '' : ' ig-nodate'}`} aria-hidden="true">
          {p.date ? (
            <>
              <b>{Number(p.date.slice(8, 10))}</b>
              <small>{weekday(p.date)}</small>
            </>
          ) : (
            <Icon name="image" />
          )}
        </span>
        <span className="ig-main">
          {p.date && d === shortDate(p.date) ? (
            <span className="rf-sr">{d}, </span>
          ) : (
            <span className="ig-eb">
              <span className={`ig-when${past || !p.date ? ' ig-soft' : ''}`} title={p.date ? fullDate(p.date) : 'No date yet'}>
                {d}
              </span>
            </span>
          )}
          <span className="ig-t">{p.title}</span>
          <span className="ig-meta">
            <Who p={p.owner} me={me} />
            <State w={stateWords(p)} />
          </span>
        </span>
        <span className="ig-prog">
          {posted ? (
            <span className="ig-posted">
              <Icon name="check" />
              Posted
            </span>
          ) : (
            <>
              <span className="ig-steps5" aria-hidden="true">
                {p.steps.map((x, k) => (
                  <span key={k} className={x ? 'ig-on' : undefined} />
                ))}
              </span>
              <span>{nDone(p)} of 5</span>
            </>
          )}
        </span>
      </button>
    );
  };

  // The owner picker (8 board members, "(you)" after the signed-in person).
  const picks = (p: IgPost) => (
    <div className="ig-picks" role="group" aria-label="Pick an owner">
      {staff.map((x) => (
        <button key={x.id} type="button" className="ig-pick" onClick={() => setOwner(p, x)}>
          {x.name}
          {x.id === me ? (
            <>
              {' '}
              <span>(you)</span>
            </>
          ) : null}
        </button>
      ))}
    </div>
  );

  // The one thing the post needs now.
  const act = (p: IgPost) => {
    const u = ui[p.id] ?? {};
    const i = nowStep(p);
    // No owner: the demo asks who takes it. Live has no owner write, so the post's next action shows instead.
    if (!p.owner && caps.owner) {
      return (
        <div className="ig-act">
          <p className="ig-cl">Who takes it?</p>
          {picks(p)}
        </div>
      );
    }
    const owned = u.ownSavedAt && p.owner ? (
      <DoneLine>
        <Nw>{p.owner.name}</Nw> owns it. Saved {u.ownSavedAt}
        {caps.undo ? (
          <>
            &nbsp;·&nbsp;
            <button type="button" className="rf-lnk" data-x="unown" onClick={() => undoOwner(p)}>
              Undo
            </button>
          </>
        ) : null}
      </DoneLine>
    ) : null;
    if (i === -1) return <div className="ig-act">{owned}</div>;
    if (waitsOnCaption(p) && p.captionBy) {
      const by = p.captionBy;
      if (u.nudge === 'sent') {
        return (
          <div className="ig-act">
            {owned}
            <DoneLine>
              Nudged <Nw>{first(by.name)}</Nw> in Board chat, {u.nudgeAt}.
            </DoneLine>
            <p className="ig-sugg">
              <Icon name="bell" />
              Add the caption here when it comes in
            </p>
          </div>
        );
      }
      const words = u.nudgeText || nudgeWords(p, today);
      return (
        <div className="ig-act">
          {owned}
          <div className="ig-waitbar" hidden={u.nudge === 'draft'}>
            <span className="ig-wt">
              <Icon name="wait" />
              <span>
                Waiting on <Nw>{first(by.name)}&apos;s</Nw> caption
              </span>
            </span>
            {caps.nudge ? (
              <button type="button" className="ig-nudge" data-x="nudge" onClick={() => {
                setU(p.id, { nudge: 'draft', nudgeText: u.nudgeText || nudgeWords(p, today) });
                focusTo('[data-x="nsend"]');
              }}>
                Nudge {first(by.name)}
              </button>
            ) : null}
          </div>
          {caps.nudge ? (
            <Fold open={u.nudge === 'draft' && !u.nudgeClosing} data-sub="nudge">
              <div className="ig-draft">
                <span className="ig-dl">
                  To <Nw>{by.name}</Nw> in Board chat
                </span>
                {u.editing ? (
                  <textarea className="ig-dtext" rows={3} aria-label={`Message to ${by.name}`} value={words} data-nudge-in="" onChange={(e) => setU(p.id, { nudgeText: e.target.value })} />
                ) : (
                  <p className="ig-dtext">{words}</p>
                )}
                <div className="ig-dact">
                  <button type="button" className="rf-btn rf-btn-gold" data-x="nsend" disabled={u.sending} onClick={() => sendNudge(p, words.trim() || nudgeWords(p, today))}>
                    <Icon name="send" />
                    <span>{u.sending ? 'Sending…' : 'Send'}</span>
                  </button>
                  <button type="button" className="rf-lnk" data-x="nedit" onClick={() => {
                    setU(p.id, { editing: true, nudgeText: words });
                    focusTo('[data-nudge-in]');
                  }}>
                    Edit
                  </button>
                  <button type="button" className="rf-lnk" data-x="ncancel" onClick={() => cancelNudge(p)}>
                    Cancel
                  </button>
                </div>
              </div>
            </Fold>
          ) : null}
        </div>
      );
    }
    if (i === 2 && p.sentAt) {
      return (
        <div className="ig-act">
          {owned}
          <DoneLine>
            {p.approver ? (
              live ? (
                <>Marked as waiting for approval, {p.sentAt}</>
              ) : (
                <>
                  Sent to <Nw>{p.approver.name}</Nw> for approval, {p.sentAt}
                </>
              )
            ) : (
              <>
                {sentWords(live, null)}, {p.sentAt}
              </>
            )}
            {caps.undo ? (
              <>
                &nbsp;·&nbsp;
                <button type="button" className="rf-lnk" data-x="unsend" onClick={() => unsend(p)}>
                  Undo
                </button>
              </>
            ) : null}
          </DoneLine>
        </div>
      );
    }
    if (waitsOnApproval(p)) return <div className="ig-act">{owned}</div>;
    const allowed = i === 0 ? caps.caption : i === 2 ? caps.send : caps.next;
    if (!allowed) return <div className="ig-act">{owned}</div>;
    const lab = i === 0 ? 'Write the caption' : i === 1 ? 'Mark the photo picked' : i === 2 ? (p.approver ? `Send to ${first(p.approver.name)} for approval` : 'Send for board approval') : i === 3 ? 'Mark it scheduled' : 'Mark it posted';
    const x = i === 0 ? 'capedit' : i === 2 ? 'send' : 'next';
    const onClick = () => {
      if (i === 0) {
        setU(p.id, { capEdit: true, capDraft: p.caption ?? '' });
        focusTo('[data-cap-in]');
      } else if (i === 2) void send(p);
      else markNext(p);
    };
    return (
      <div className="ig-act">
        {owned}
        {u.saveErr ? (
          <p className="rf-saveerr">
            <Icon name="alert" />
            {u.saveErr}
          </p>
        ) : null}
        <button type="button" className="rf-btn rf-btn-gold" data-x={x} disabled={i === 2 && u.sending} onClick={onClick}>
          <Icon name={i === 2 ? 'send' : i === 0 ? 'pen' : 'check'} />
          <span>{i === 2 && u.sending ? 'Sending…' : lab}</span>
        </button>
      </div>
    );
  };

  // The caption box.
  const cap = (p: IgPost) => {
    const u = ui[p.id] ?? {};
    const long = !!p.caption && p.caption.length > 200;
    return (
      <div className="ig-cap">
        <span className="ig-cl">Caption</span>
        {u.capEdit ? (
          <>
            <textarea rows={5} aria-label="Caption" data-cap-in="" value={u.capDraft ?? ''} onChange={(e) => setU(p.id, { capDraft: e.target.value })} />
            <div className="ig-dact">
              <button type="button" className="rf-btn" data-x="capsave" onClick={() => saveCaption(p)}>
                Save caption
              </button>
              <button type="button" className="rf-lnk" data-x="capcancel" onClick={() => {
                setU(p.id, { capEdit: false });
                focusTo('[data-x="capedit"]');
              }}>
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            {p.caption ? <p className={long && !u.showFull ? 'ig-clamp' : undefined}>{p.caption}</p> : <p className="ig-none">No caption yet.</p>}
            <span className="ig-dact" style={{ marginTop: 4 }}>
              {long ? (
                <button type="button" className="rf-lnk" data-x="full" onClick={() => {
                  setU(p.id, { showFull: !u.showFull });
                  focusTo('[data-x="full"]');
                }}>
                  {u.showFull ? 'Show less' : 'Show full caption'}
                </button>
              ) : null}
              {!isPosted(p) && caps.caption ? (
                <button type="button" className="rf-lnk" data-x="capedit" onClick={() => {
                  setU(p.id, { capEdit: true, capDraft: p.caption ?? '' });
                  focusTo('[data-cap-in]');
                }}>
                  {p.caption ? 'Edit caption' : 'Add caption'}
                </button>
              ) : null}
            </span>
          </>
        )}
        {u.capSavedAt ? (
          <DoneLine style={{ marginTop: 8 }}>
            Caption saved {u.capSavedAt}
            {caps.undo ? (
              <>
                &nbsp;·&nbsp;
                <button type="button" className="rf-lnk" data-x="capundo" onClick={() => undoCaption(p)}>
                  Undo
                </button>
              </>
            ) : null}
          </DoneLine>
        ) : null}
      </div>
    );
  };

  // The selected post: heading, the one action, the five steps, the caption and the photo.
  const detail = (p: IgPost | null) => {
    if (!p) return <p className="ig-nonesel">{posts.length ? 'Pick a post to see its checklist.' : caps.add ? 'Add a post to start its checklist.' : emptyWords(false, !!view.channelId)}</p>;
    const u = ui[p.id] ?? {};
    const i = nowStep(p);
    const change =
      p.owner && caps.owner ? (
        <button type="button" className="rf-lnk" data-x="chown" data-post={p.id} onClick={onChownClick}>
          Change owner
        </button>
      ) : null;
    return (
      <>
        <div className="ig-dh">
          <p className="ig-k">
            Instagram post · <span title={p.date ? fullDate(p.date) : ''}>{p.date ? postRel(today, p.date) : 'No date yet'}</span>
          </p>
          <h2>{p.title}</h2>
          <p className="ig-own">
            <Who p={p.owner} me={me} />
            {change}
          </p>
        </div>
        <div className="ig-db">
          <p className="ig-own-ph">{change}</p>
          {u.chown && p.owner ? picks(p) : null}
          {act(p)}
          <ul className="ig-steps" aria-label={`Post checklist, ${nDone(p)} of 5 done`}>
            {p.steps.map((done, k) => {
              const name = stepName(p, k);
              let sub: ReactNode = null;
              if (k === 0 && !done && p.captionBy && !p.caption) sub = (
                <>
                  <Nw>{p.captionBy.name}</Nw> is writing it
                </>
              );
              if (k === 2 && !done && (p.sentAt || p.sent)) sub = p.approver ? (
                <>
                  Waiting on <Nw>{first(p.approver.name)}</Nw>
                </>
              ) : (
                'Waiting for approval'
              );
              const shown = p.approver && k === 2 ? (
                <>
                  Board approval: <Nw>{p.approver.name}</Nw>
                </>
              ) : (
                name
              );
              return (
                <li key={k} className={`ig-step${done ? ' ig-done' : ''}${k === i ? ' ig-now' : ''}`}>
                  {caps.tick ? (
                    <button type="button" className={`ig-check${done ? ' ig-on' : ''}${pop === `${p.id}:${k}` ? ' ig-pop' : ''}`} aria-pressed={done} data-step={k} data-post={p.id} aria-label={`${done ? 'Undo' : 'Done'}: ${name}`} onClick={onStepClick}>
                      <Icon name="check" />
                    </button>
                  ) : (
                    <span className={`ig-check${done ? ' ig-on' : ''}`} aria-hidden="true">
                      <Icon name="check" />
                    </span>
                  )}
                  <span>
                    <span className="ig-sn">{shown}</span>
                    {sub ? <span className="ig-ss">{sub}</span> : null}
                  </span>
                  <span className="ig-sr2">{done ? 'Done' : k === i ? 'Now' : ''}</span>
                </li>
              );
            })}
          </ul>
          {cap(p)}
          <div className="ig-photo">
            <Icon name="image" />
            {p.photo}
          </div>
        </div>
      </>
    );
  };

  const chips = draft ? (
    <>
      {draft.due ? (
        <button key={`d-${draft.due}`} type="button" className="ig-pchip ig-new" aria-label={`Date ${shortDate(draft.due)}. Remove`} onPointerDown={() => (chipTap.current = true)} onMouseDown={(e) => e.preventDefault()} onClick={() => dropChip('date')}>
          <Icon name="cal" />
          {shortDate(draft.due)}
          <Icon name="x" className="ig-x" />
        </button>
      ) : null}
      {draft.owner ? (
        <button key={`o-${draft.owner.id}`} type="button" className="ig-pchip ig-new" aria-label={`Owner ${draft.owner.name}. Remove`} onPointerDown={() => (chipTap.current = true)} onMouseDown={(e) => e.preventDefault()} onClick={() => dropChip('owner')}>
          {draft.owner.name}
          <Icon name="x" className="ig-x" />
        </button>
      ) : (
        <span className="ig-pchip ig-soft">No owner yet</span>
      )}
    </>
  ) : null;

  return (
    <div className="rf ig" ref={rootRef}>
      <IgHead date={headDate(today)} news={news ? <NewsCard icon="image" kicker={news.kicker} title={news.title} go={news.go} gold={news.gold} onClick={() => openNews(news.id)} /> : null} />
      <OutreachNav />
      <div className="rf-board ig-board">
        <section className="rf-panel ig-posts" aria-labelledby="ig-ph">
          <div className="rf-ph">
            <h2 id="ig-ph">Posts</h2>
            <span className="ig-r">{view.target ? `Target ${view.target} a month` : 'Target not set'}</span>
          </div>
          <div className="rf-pcard">
            <div className="ig-list">
              {posts.length === 0 ? (
                <div className="ig-empty">
                  <p>{emptyWords(caps.add, !!view.channelId)}</p>
                </div>
              ) : (
                groups.map((g) => (
                  <div key={g.key} className="ig-group">
                    <div className="ig-grp">
                      <Icon name={g.undated ? 'wait' : 'cal'} />
                      {g.current ? (
                        <>
                          <span className="ig-gm">{g.label}</span>
                          <span className="ig-sq" role="img" aria-label={`${g.posted} of ${g.posts.length} posted`}>
                            {Array.from({ length: g.boxes }, (_, k) => (
                              <span key={k} className={k < g.posted ? 'ig-on' : undefined} />
                            ))}
                          </span>
                          <span className="ig-gl">
                            {g.posted} of {g.posts.length} posted
                          </span>
                        </>
                      ) : (
                        g.label
                      )}
                    </div>
                    {g.posts.map((p) => (
                      <Fragment key={p.id}>
                        {row(p)}
                        {phone && p.id === sel && phoneOpen ? (
                          <Fold open={!closing} appear={enterId === p.id} className="ig-pdx">
                            {detail(p)}
                          </Fold>
                        ) : null}
                      </Fragment>
                    ))}
                  </div>
                ))
              )}
            </div>
            {notAdded.length ? (
              <ul className="ig-unadded" aria-label="Not added">
                {notAdded.map((x) => (
                  <li key={x.key}>
                    <Icon name="alert" />
                    <span className="ig-un-t">
                      Not added: <b>{x.post.title}</b>
                    </span>
                    <button type="button" className="rf-lnk" aria-disabled={x.state === 'adding'} aria-label={`Try again: ${x.post.title}`} data-na={x.key} onClick={() => retryAdd(x.key)}>
                      {x.state === 'adding' ? 'Adding…' : 'Try again'}
                    </button>
                    <button type="button" className="rf-lnk" aria-label={`Remove: ${x.post.title}`} onClick={() => {
                        dropNotAdded(me, x.key);
                        focusTo('.ig-unadded [data-na]|#ig-add-open|#ig-add-in');
                      }}>
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {caps.add ? (
              <div className="ig-add">
                <button type="button" id="ig-add-open" className="ig-add-open" hidden={adding} onClick={openAdd}>
                  <span className="ig-plus">
                    <Icon name="plus" />
                  </span>
                  <span className="ig-lab">Add a post</span>
                  <span className="ig-kbd" aria-hidden="true">
                    N
                  </span>
                </button>
                <form id="ig-add-form" className="ig-add-form" hidden={!adding} autoComplete="off" onSubmit={submitAdd}>
                  <div className="ig-add-field">
                    <span className="ig-plus">
                      <Icon name="plus" />
                    </span>
                    <input
                      id="ig-add-in"
                      type="text"
                      enterKeyHint="done"
                      maxLength={200}
                      aria-label="New post. Words like sat, dec 4 or a first name set the date and owner."
                      placeholder="e.g. Thank our donors dec 2 camila"
                      value={text}
                      onChange={(e) => {
                        if (!e.target.value.trim()) setDismissed({});
                        setNeedWords(false);
                        setText(e.target.value);
                      }}
                      onKeyDown={onAddKey}
                      onBlur={onAddBlur}
                    />
                    <span className="ig-add-hint">Enter to add</span>
                  </div>
                  <div className="ig-chips">
                    {chips}
                  </div>
                  {needWords ? <p className="ig-need">{NEED_WORDS}</p> : null}
                </form>
              </div>
            ) : null}
          </div>
        </section>
        <section className="ig-panel ig-detail" aria-label="The selected post">
          {phone ? null : detail(selected)}
        </section>
      </div>
      {live_}
    </div>
  );
}

