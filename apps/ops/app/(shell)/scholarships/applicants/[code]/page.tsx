// The full application: the applicant, the answers and the two PDFs (resume, transcript). No blind review (D2): every
// staff member sees the name (headed by the name, with the code beside it), contact details and every answer. The PDFs open through /file/<kind>, which makes a short-lived signed link to the private storage bucket.
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SHORT_ANSWER_QUESTIONS } from '@btx/data';
import { PageHeader } from '@/components/page-header';
import { OIcon } from '@/components/icons';
import { BoardTest } from '@/components/board-test-label';
import { loadApplication } from '@/lib/application';

type Props = { params: Promise<{ code: string }> };

// The tab title is the code.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return { title: code };
}

// The page.
export default async function ApplicationPage({ params }: Props) {
  const { code } = await params;
  const app = await loadApplication(decodeURIComponent(code));
  if (!app) notFound();
  return (
    <>
      <PageHeader title={app.name} sub={`${app.code} · ${app.term} · submitted ${app.submitted}`} reviewPrivate titleExtra={<BoardTest test={app.test} />}>
        <Link href="/scholarships/applicants" className="o-btn s lg">
          Back to applicants
        </Link>
      </PageHeader>
      <div className="o-app-grid">
        <section className="o-card o-app-sec o-app-wide" data-review="Applicant summary" data-review-private>
          <h2 className="o-h2">Applicant</h2>
          <dl className="o-app-dl">
            {app.identity.map((a) => (
              <div key={a.label}>
                <dt>{a.label}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="o-card o-app-sec" data-review="Applicant answers" data-review-private>
          <h2 className="o-h2">Answers</h2>
          <dl className="o-app-dl">
            {app.answers.map((a) => (
              <div key={a.label}>
                <dt>{a.label}</dt>
                <dd>{a.value}</dd>
              </div>
            ))}
          </dl>
        </section>
        <section className="o-card o-app-sec" data-review="Applicant documents" data-review-private>
          <h2 className="o-h2">Documents</h2>
          <ul className="o-app-files">
            {app.files.map((f) => (
              <li key={f.kind}>
                <OIcon name="file" size={20} />
                <span>
                  <b>{f.label}</b>
                  <i>{f.filename ?? 'Not uploaded'}</i>
                </span>
                {f.filename ? (
                  <a className="o-btn s" href={`/scholarships/applicants/${encodeURIComponent(app.code)}/file/${f.kind}`} target="_blank" rel="noreferrer">
                    Open PDF
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
        <section className="o-card o-app-sec o-app-wide" data-review="Applicant short answers" data-review-private>
          <h2 className="o-h2">Short answers</h2>
          {SHORT_ANSWER_QUESTIONS.map((q, i) => (
            <div key={q}>
              <p className="o-app-q">{q}</p>
              <p className={app.shortAnswers[i] ? 'o-app-answer' : 'o-app-answer empty'}>{app.shortAnswers[i] || 'Not answered'}</p>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
