'use client';

// Scholarships > Interviews (Figma "Scholarships > Interviews", laptop and phone): the interviews left this week with
// who interviews and the video link, then the table of interviewer pairs. "Re-run pairing" (admins only) opens a
// preview that says nothing would move.
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { InterviewsData, UpcomingInterview } from '@/lib/interviews';
import { previewPairing, rerunPairing, type PairingPreview } from '@/lib/actions/interviews';
import { PageHeader } from './page-header';
import { Avatar, Dialog, VideoMark } from './sch-parts';
import './scholarships.css';

// One interview on the laptop: date, applicant, the two interviewers, the video mark and when or "Yours".
function LaptopRow({ r }: { r: UpcomingInterview }) {
  return (
    <div className={`s-ivr${r.mine ? ' mine' : ''}`}>
      <span className="s-ivd">
        <span>{r.weekday}</span>
        <b>{r.dayNum}</b>
        <span className="t">{r.time}</span>
      </span>
      <span className="s-ivc">
        <b>{r.applicant}</b>
        <span>{r.code}</span>
      </span>
      <span className="s-ivp">
        {r.pair.length === 0 ? (
          <span className="s-ivp-i">
            <Avatar initials="?" />
            <b>Unassigned</b>
          </span>
        ) : (
          r.pair.map((p) => (
            <span className="s-ivp-i" key={p.userId}>
              <Avatar initials={p.initials} />
              <b>{p.name}</b>
            </span>
          ))
        )}
      </span>
      <span className="s-ivv">
        <VideoMark />
        Video
      </span>
      {r.mine ? (
        <span className="s-ivs">
          <span className="s-ivst">
            <i />
            Yours
          </span>
          {r.videoUrl ? (
            <a className="o-btn s" href={r.videoUrl} target="_blank" rel="noreferrer">
              Join video
            </a>
          ) : (
            <span className="o-btn s dis">Join video</span>
          )}
        </span>
      ) : (
        <span className="s-ivw">{r.when}</span>
      )}
    </div>
  );
}

// One interview card on the phone.
function PhoneCard({ r }: { r: UpcomingInterview }) {
  return (
    <div className="s-ivc-p">
      <span className={`s-ivd-p${r.mine ? ' me' : ''}`}>
        <span>{r.weekday}</span>
        <b>{r.dayNum}</b>
      </span>
      <span className="s-ivt-p">
        <b>
          {r.time} · {r.applicant}
        </b>
        <span>{r.code}</span>
        <span className="s-ivn-p">
          <VideoMark size={15} />
          <span>
            {r.pair.length === 0 ? (
              'Unassigned'
            ) : (
              <>
                {r.pair[0].name}
                <br />
                {r.pair[1].name}
              </>
            )}
          </span>
        </span>
      </span>
      <span className={`s-du${r.mine ? ' fill' : ''}`}>{r.mine ? 'Yours' : r.when}</span>
    </div>
  );
}

export function InterviewsView({ data }: { data: InterviewsData }) {
  const router = useRouter();
  const [rerun, setRerun] = useState(false);
  const [preview, setPreview] = useState<PairingPreview | null>(null);
  const [note, setNote] = useState('');
  const frac = data.total > 0 ? data.done / data.total : 0;

  // Opens the preview: asks the server what pairing would do, without doing it.
  async function openRerun() {
    setPreview(null);
    setRerun(true);
    setPreview(await previewPairing());
  }

  // "Re-run anyway": asks the server to run the pairing again, then reloads the page's data.
  async function runAnyway() {
    const res = await rerunPairing();
    setRerun(false);
    setNote(res.message);
    router.refresh();
  }

  const nothing = preview !== null && preview.ok && preview.unpaired === 0;

  return (
    <div className="s-page">
      <PageHeader title="Interviews" sub={<><span className="o-lg">{data.sub}</span><span className="o-ph">Scholarships · all on video</span></>} />

      <section className="o-card s-panel">
        <div className="s-ph o-lg">
          <h2>Left this week</h2>
          <div className="s-pg">
            <i>
              <span style={{ width: `${(frac * 100).toFixed(1)}%` }} />
            </i>
            <b>
              {data.done} of {data.total} interviewed
            </b>
          </div>
        </div>
        <div className="s-ph2 o-ph">
          <h2>Left this week</h2>
          <span>{data.endsLabel}</span>
        </div>
        <p className="s-ln o-lg">Every applicant meets two board members on a video call.</p>
        {data.upcoming.map((r) => (
          <div key={r.slotId}>
            <div className="o-lg">
              <LaptopRow r={r} />
            </div>
            <div className="o-ph">
              <PhoneCard r={r} />
            </div>
          </div>
        ))}
        <div className="s-lkr o-ph">
          <b>Interviewer pairs</b>
        </div>
      </section>

      <section className="o-card s-panel s-pairs o-lg">
        <div className="s-ph">
          <h2>Interviewer pairs</h2>
          <div className="s-adm">
            <span>Admins only</span>
            {data.isAdmin ? (
              <button type="button" className="o-ul" onClick={openRerun}>
                Re-run pairing
              </button>
            ) : null}
          </div>
        </div>
        <div className="s-th">
          <span>Pair</span>
          <span>Done</span>
          <span>Left</span>
          <span>Next</span>
        </div>
        {data.pairs.map((p) => (
          <div className="s-tr" key={p.key}>
            <b>{p.names}</b>
            <span>{p.done}</span>
            <span>{p.left}</span>
            <span className={p.next === 'Done' ? 'strong' : undefined}>{p.next}</span>
          </div>
        ))}
      </section>
      {note ? (
        <p className="s-note o-lg" role="status">
          {note}
        </p>
      ) : null}

      {rerun ? (
        <Dialog title="Re-run pairing?" onClose={() => setRerun(false)}>
          {preview === null ? (
            <p>Checking what would change.</p>
          ) : !preview.ok ? (
            <p>{preview.message}</p>
          ) : nothing ? (
            <p>
              Nothing would move. {data.done} interviews are done and the {data.upcoming.length} booked this week stay as they are.
              {data.source === 'mock' ? ' Pairing already runs again on its own Tue at 9:00 AM.' : ''}
            </p>
          ) : (
            <p>
              {preview.wouldPair} of the {preview.unpaired} interviews with no pair would be paired now.
              {preview.uncovered > 0 ? ` ${preview.uncovered} could not be, because fewer than two board members are free.` : ''} Pairs already set stay as they are.
            </p>
          )}
          <div className="s-dlg-b">
            <button type="button" className="o-btn p lg" onClick={() => setRerun(false)}>
              Close
            </button>
            <button type="button" className="o-btn s lg" onClick={runAnyway} disabled={preview === null || !preview.ok}>
              {nothing ? 'Re-run anyway' : 'Re-run pairing'}
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
