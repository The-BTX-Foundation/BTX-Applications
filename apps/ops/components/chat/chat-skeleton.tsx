// Board chat while it loads: grey blocks shaped like the page (the title, the news card, the window with channels, the
// thread and the composer), no spinner. Drawn by app/(shell)/(chat)/loading.tsx on every real navigation to /chat,
// by `?demo=loading` in mock mode, and inside the load-error box while "Try again" reloads.
import '@/components/refresh/refresh.css';
import './chat.css';
import { Icon } from '@/components/refresh/icons';
import { Sk } from '@/components/refresh/skeleton';

/** The message rows' second-line widths (the demo's skeleton). */
const LINE_W = [70, 55, 80, 45];

// The chat window's grey blocks: five channel rows, the thread head, four messages and the composer.
export function ChatWinSkeleton() {
  return (
    <div className="ch-win" aria-hidden="true">
      <div className="ch-chans">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="ch-sk-chn">
            <Sk />
            <Sk />
          </div>
        ))}
      </div>
      <div className="ch-thread">
        <div className="ch-th-head">
          <Sk style={{ width: 140, height: 18 }} />
        </div>
        <div className="ch-msgs">
          {LINE_W.map((w) => (
            <div key={w} className="ch-sk-mg">
              <Sk className="ch-sk-av" />
              <span className="ch-lines">
                <Sk style={{ width: '30%' }} />
                <Sk style={{ width: `${w}%` }} />
              </span>
            </div>
          ))}
        </div>
        <div className="ch-comp">
          <Sk style={{ flex: 1, height: 40 }} />
        </div>
      </div>
    </div>
  );
}

// The whole page.
export function ChatSkeleton() {
  return (
    <div className="rf ch-pg" data-state="loading" aria-busy="true">
      <h1 className="rf-sr">Board chat</h1>
      <p className="rf-sr" role="status">
        Loading Board chat
      </p>
      <header className="rf-head ch-head" aria-hidden="true">
        <div>
          <Sk className="ch-sk-hl" />
          <Sk className="ch-sk-nx" />
        </div>
        <div className="rf-search">
          <Icon name="search" />
          <span className="rf-search-ph">Search messages</span>
        </div>
      </header>
      <ChatWinSkeleton />
    </div>
  );
}
