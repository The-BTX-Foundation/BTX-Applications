// The refreshed page header: the title with the date beside it, an optional line or news card under it, and on laptops
// the search box in the current app's look (search is not built yet, so the box is drawn, not a field; phones hide it).
import type { ReactNode } from 'react';
import { Icon } from './icons';

/** The words in the search box until search is built. */
export const SEARCH_PLACEHOLDER = 'Search applicants, tasks, people';

// One page header. `title` may be a node (a skeleton passes grey blocks via `loading`). `children` sit under the title.
export function PageHeader({ title, date, search = true, loading = false, children }: { title?: ReactNode; date?: ReactNode; search?: boolean; loading?: boolean; children?: ReactNode }) {
  return (
    <header className="rf-head">
      <div>
        {loading ? (
          <div className="rf-sk-hl" aria-hidden="true">
            <span className="rf-sk" />
          </div>
        ) : (
          <div className="rf-ptitle">
            <h1>{title}</h1>
            {date ? <span className="rf-pdate">{date}</span> : null}
          </div>
        )}
        {children}
      </div>
      {search ? (
        <div className="rf-search" aria-hidden="true">
          <Icon name="search" />
          <span className="rf-search-ph">{SEARCH_PLACEHOLDER}</span>
        </div>
      ) : null}
    </header>
  );
}
