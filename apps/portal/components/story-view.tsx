'use client';

// Photo and story (drafts story.html, story-phone.html): the winner adds a photo and a few lines (up to 100 words)
// for her scholar page and agrees to BTX showing them. Mock: sending goes to the "story sent" preview and nothing is
// stored. Live: the photo goes to the private award-photos bucket at {user id}/{award id}/photo.jpg|png, the story and
// consent are saved in award_stories as she types, and "Send to BTX" sets sent_at (the database wants a photo, a story
// and her consent). Consent starts unticked in live mode: it has to be an active choice. NOT TESTED AGAINST LIVE DATA.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Checkbox } from '@btx/ui';
import { getAuthMode, getBrowserClient, saveStory, uploadAwardPhoto } from '@btx/data';
import { savedTime } from '@/lib/format';
import { countWords } from '@/lib/words';
import { FileName } from './text';
import { JourneyPage } from './journey-page';
import b from './booking.module.css';
import s from './story-view.module.css';

const LIMIT = 100;

export type StoryProps = {
  accountName: string;
  photo: { url: string; name: string; meta: string } | null;
  story: string;
  saved: string;
  stress: boolean;
  /** Live only: who is saving, and the photo already stored. */
  live: { awardId: string; userId: string; photoPath: string | null } | null;
  initialConsent: boolean;
};

export function StoryView(p: StoryProps) {
  const router = useRouter();
  const [photo, setPhoto] = useState(p.photo);
  const [story, setStory] = useState(p.story);
  const [agree, setAgree] = useState(p.initialConsent);
  const [photoPath, setPhotoPath] = useState(p.live?.photoPath ?? null);
  const [busy, setBusy] = useState(false);
  const first = useRef(true);
  const [saved, setSaved] = useState(p.saved);
  const [problem, setProblem] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const words = countWords(story);
  const over = words > LIMIT;
  const touch = () => setSaved(`Saved ${savedTime(new Date().toISOString())}`);

  // live: save the story and consent a moment after she stops typing (the database refuses over 100 words)
  const live = p.live;
  useEffect(() => {
    if (!live || getAuthMode() === 'mock') return;
    if (first.current) {
      first.current = false;
      return;
    }
    if (countWords(story) > LIMIT) return;
    const t = setTimeout(async () => {
      const r = await saveStory(getBrowserClient(), live.awardId, { story, photoPath, consent: agree });
      setSaved(r.ok ? `Saved ${savedTime(new Date().toISOString())}` : "Couldn't save yet");
    }, 1000);
    return () => clearTimeout(t);
  }, [story, agree, photoPath, live]);

  async function choose(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (!/^image\/(jpeg|png)$/.test(f.type) || f.size > 10 * 1048576) {
      setProblem('Choose a JPG or PNG photo under 10 MB.');
      return;
    }
    setProblem(null);
    if (live && getAuthMode() !== 'mock') {
      const path = await uploadAwardPhoto(getBrowserClient(), live.userId, live.awardId, f, photoPath);
      if (!path) {
        setProblem("The photo didn't upload. Check your connection and try again.");
        return;
      }
      setPhotoPath(path);
      const r = await saveStory(getBrowserClient(), live.awardId, { story: countWords(story) > LIMIT ? '' : story, photoPath: path, consent: agree });
      setSaved(r.ok ? `Saved ${savedTime(new Date().toISOString())}` : "Couldn't save yet");
    } else {
      touch();
    }
    setPhoto({ url: URL.createObjectURL(f), name: f.name, meta: `${f.type === 'image/png' ? 'PNG' : 'JPG'}, ${(f.size / 1048576).toFixed(1)} MB` });
  }
  async function send() {
    if (!photo) return setProblem('Add your photo first.');
    if (over) return setProblem(`Shorten your story by ${words - LIMIT} ${words - LIMIT === 1 ? 'word' : 'words'}.`);
    if (!agree) return setProblem('Check the box to let BTX show your photo and story.');
    setProblem(null);
    if (live && getAuthMode() !== 'mock') {
      setBusy(true);
      const r = await saveStory(getBrowserClient(), live.awardId, { story, photoPath, consent: agree, sentAt: new Date().toISOString() });
      setBusy(false);
      if (!r.ok) return setProblem("We couldn't send your photo and story. Check your connection and try again.");
      router.push('/status');
      router.refresh();
      return;
    }
    router.push(`/status?demo=won-sent${p.stress ? '-stress' : ''}`);
  }

  return (
    <JourneyPage accountName={p.accountName} primary={<Button onClick={() => void send()} disabled={busy}>Send to BTX</Button>}>
      <div className={s.wrap}>
        <h1 className={`st ${s.title}`}>Your photo and story.</h1>
        <p className={b.lead}>For your scholar page on the BTX website. It saves as you type.</p>
        {problem ? (
          <p className={b.err} role="alert">
            <span>{problem}</span>
          </p>
        ) : null}
        <div className={s.grid}>
          <div className="f" style={{ marginTop: 20 }}>
            <p className="lb">Photo</p>
            <div className={s.pk}>
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a local preview of the chosen photo
                <img src={photo.url} alt="Your photo" className={s.ph} />
              ) : (
                <div className={`${s.ph} ${s.phEmpty}`} aria-hidden="true" />
              )}
              <div className={s.pkText}>
                {photo ? (
                  <>
                    <b>
                      <FileName>{photo.name}</FileName>
                    </b>
                    <span>{photo.meta}</span>
                  </>
                ) : null}
                <button type="button" className={`lk ${s.replace}`} onClick={() => file.current?.click()}>
                  {photo ? 'Replace' : 'Choose a photo'}
                </button>
                <input ref={file} type="file" accept="image/jpeg,image/png" className="sr-only" onChange={(e) => void choose(e)} aria-label="Photo file" tabIndex={-1} />
              </div>
            </div>
          </div>
          <div className="f" style={{ marginTop: 20 }}>
            <label className="lb" htmlFor="story">
              A few lines about you
            </label>
            <textarea
              id="story"
              className={`${b.ta} ${s.ta}`}
              value={story}
              onChange={(e) => {
                setStory(e.target.value);
                touch();
              }}
              aria-describedby="story-count"
            />
            <div className={s.ct} id="story-count">
              <span className="mu">{saved}</span>
              <b className={over ? s.overCount : undefined}>
                {words} of {LIMIT} words
              </b>
            </div>
            <div className={s.consent}>
              <Checkbox checked={agree} onChange={setAgree} text="BTX can show my photo and story on its website." />
            </div>
          </div>
        </div>
        <div className={s.actions}>
          <Button size="xl" onClick={() => void send()} disabled={busy}>
            Send to BTX
          </Button>
          <span className="mu">{saved}</span>
        </div>
      </div>
    </JourneyPage>
  );
}
