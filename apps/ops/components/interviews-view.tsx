'use client';

// Scholarships > Interviews (Figma "Options: interview flow", laptop and phone): interview times proposed from the
// board's availability, interviews per board member against an even target, the booked interviews ahead and the table
// of interviewer pairs. Board members with admin rights change times, rebalance and re-run pairing; every other board
// member reads. Links in the header go to the interview questions and to "Your availability".
// The older "Left this week" list stays for data with no times or fairness (the stress frame).
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { InterviewsData, UpcomingInterview, VideoLinksData } from '@/lib/interviews';
import { previewPairing, rerunPairing, type PairingPreview } from '@/lib/actions/interviews';
import { PageHeader } from './page-header';
import { Avatar, Dialog, VideoMark } from './sch-parts';
import { FairnessSection } from './interviews/fairness-panel';
import { TimesPanel } from './interviews/times-panel';
import { VideoLinksPanel } from './interviews/video-links-panel';
import './scholarships.css';
import './interviews/interview-flow.css';

// One interview on the laptop: date, applicant, the two interviewers, the video mark and when or "Yours".
function LaptopRow({ r }: { r: UpcomingInterview }) {
  return (
    <div className={`s-ivr${r.mine ? ' mine' : ''}`}>
      <span className="s-ivd">
        <span>{r.weekday}</span>
        <b>{r.dayNum}</b>
        <span className="t">{r.time}</span>
      </span>
      <span className="s-ivc" data-review-private>
        <b>{r.applicant}</b>
        <span>{r.code}</span>
      </span>
      <span className="s-ivp" data-review-private>
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
      <span className="s-ivt-p" data-review-private>
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

// "Interview questions" and "Your availability": in the header on the laptop, under it on the phone.
// onVideoLinks is set for admins once an interview is booked: it opens the "Add the video links" panel.
function HeaderLinks({ className, onVideoLinks }: { className: string; onVideoLinks?: () => void }) {
  return (
    <div className={`iv-hdr-links ${className}`}>
      <Link className="o-ul" href="/scholarships/interviews/questions">
        Interview questions
      </Link>
      <Link className="o-ul" href="/scholarships/interviews/availability">
        Your availability
      </Link>
      {onVideoLinks ? (
        <button type="button" className="o-ul" onClick={onVideoLinks}>
          Video links
        </button>
      ) : null}
    </div>
  );
}

// The page remounts its panels when the server sends new data (after a live change), so each panel starts from it.
const signature = (d: InterviewsData) =>
  JSON.stringify([d.times?.days.flatMap((x) => x.times.map((t) => [t.slotId, t.opened, t.booked])), d.times?.people.map((p) => [p.userId, p.sent]), d.fair?.people.map((p) => [p.userId, p.interviews]), d.upcoming.map((u) => [u.slotId, u.pair.map((p) => p.userId)])]);

// videoLinks is set for admins: the booked interviews whose video links can be added or changed.
export function InterviewsView({ data, videoLinks }: { data: InterviewsData; videoLinks?: VideoLinksData }) {
  const router = useRouter();
  const [vlOpen, setVlOpen] = useState(false);
  const openLinks = videoLinks && videoLinks.rows.length > 0 ? () => setVlOpen(true) : undefined;
  const [rerun, setRerun] = useState(false);
  const [preview, setPreview] = useState<PairingPreview | null>(null);
  const [note, setNote] = useState('');
  const [moved, setMoved] = useState('');
  const frac = data.total > 0 ? data.done / data.total : 0;
  const mock = data.source === 'mock';

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
  const sig = signature(data);

  return (
    <div className="s-page iv-wide">
      <PageHeader title="Interviews" sub={<><span className="o-lg">{data.sub}</span><span className="o-ph">{data.subPhone}</span></>}>
        <HeaderLinks className="o-lg" onVideoLinks={openLinks} />
      </PageHeader>
      <HeaderLinks className="o-ph" onVideoLinks={openLinks} />

      {note ? (
        <p className="iv-note" role="status">
          {note}
        </p>
      ) : null}

      {data.times ? <TimesPanel key={`t-${sig}`} data={data.times} isAdmin={data.isAdmin} mock={mock} onNote={setNote} /> : null}

      {videoLinks && vlOpen ? (
        <VideoLinksPanel
          data={videoLinks}
          onClose={() => {
            setVlOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {data.fair ? (
        <FairnessSection
          key={`f-${sig}`}
          fair={data.fair}
          upcoming={data.upcoming}
          bookedCount={data.bookedCount}
          applicantCount={data.applicantCount}
          cycleId={data.cycleId}
          isAdmin={data.isAdmin}
          mock={mock}
          moved={moved}
          onMoved={setMoved}
          onNote={setNote}
          onPair={openRerun}
        />
      ) : data.upcoming.length > 0 ? (
        <section className="o-card s-panel" data-review="Interviews left this week">
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
        </section>
      ) : null}

      {data.pairs.length > 0 ? (
        <section className="o-card s-panel s-pairs o-lg" data-review="Interviewer pairs">
          <div className="s-ph">
            <h2>Interviewer pairs</h2>
            <div className="s-adm">
              <span>Needs admin rights</span>
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
            <div className="s-tr" key={p.key} data-review-private>
              <b>{p.names}</b>
              <span>{p.done}</span>
              <span>{p.left}</span>
              <span className={p.next === 'Done' ? 'strong' : undefined}>{p.next}</span>
            </div>
          ))}
        </section>
      ) : null}

      {rerun ? (
        <Dialog title="Re-run pairing?" onClose={() => setRerun(false)}>
          {preview === null ? (
            <p>Checking what would change.</p>
          ) : !preview.ok ? (
            <p>{preview.message}</p>
          ) : nothing ? (
            <p>
              Nothing would move. {data.done} interviews are done and the {data.upcoming.length} booked ahead stay as they are.
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
