'use client';

// Scholarships > Interviews (Figma "Scholarships > Interviews", laptop and phone): the interviews left this week with
// who interviews and the video link, then the table of interviewer pairs. "Re-run pairing" (admins only) opens a
// preview that says nothing would move.
import { useState } from 'react';
import type { InterviewsData, UpcomingInterview } from '@/lib/interviews';
import { rerunPairing } from '@/lib/actions/interviews';
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
        <b>{r.code}</b>
        <span>{r.initials}</span>
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
          {r.time} · {r.initials}
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
  const [rerun, setRerun] = useState(false);
  const [note, setNote] = useState('');
  const frac = data.total > 0 ? data.done / data.total : 0;

  // "Re-run anyway": asks the server to run the pairing again. The preview says nothing would move.
  async function runAnyway() {
    const res = await rerunPairing();
    setRerun(false);
    setNote(res.message);
  }

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
              <button type="button" className="o-ul" onClick={() => setRerun(true)}>
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
          <p>
            Nothing would move. {data.done} interviews are done and the {data.upcoming.length} booked this week stay as they are. Pairing already runs again on its own Tue at 9:00 AM.
          </p>
          <div className="s-dlg-b">
            <button type="button" className="o-btn p lg" onClick={() => setRerun(false)}>
              Close
            </button>
            <button type="button" className="o-btn s lg" onClick={runAnyway}>
              Re-run anyway
            </button>
          </div>
        </Dialog>
      ) : null}
    </div>
  );
}
