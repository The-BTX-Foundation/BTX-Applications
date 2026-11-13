// The Board members page while it loads (the demo's Loading state): the title as a grey block, then one panel with a grey
// heading and six grey member rows (circle, two lines, the last-active cell). No spinner. Screen readers get the page's h1
// and one "Loading" status line (the hidden title already names the page).
import { PageHeader } from '@/components/refresh/page-header';
import { Sk } from '@/components/refresh/skeleton';
import '@/components/refresh/refresh.css';
import './people.css';

// The skeleton.
export function PeopleSkeleton() {
  return (
    <div className="rf bm" aria-busy="true">
      <h1 className="rf-sr">Board members</h1>
      <p className="rf-sr" role="status">
        Loading
      </p>
      <PageHeader search={false} loading />
      <div className="bm-board" aria-hidden="true">
        <div className="rf-col">
          <section className="bm-skpanel">
            <div className="bm-skph">
              <Sk />
            </div>
            <div>
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} className="bm-skrow">
                  <Sk className="bm-skav" />
                  <span className="bm-lines">
                    <Sk />
                    <Sk />
                  </span>
                  <Sk />
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
