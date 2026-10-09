// The full application: every answer the applicant gave and the two PDFs (resume, transcript). Reviews are blind, so
// the page is headed by the code and initials; the identity fields (name, emails, phone, gender, race) appear only for
// an admin. The PDFs open through /file/<kind>, which makes a short-lived signed link to the private storage bucket.
import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PageHeader } from '@/components/page-header';
import { OIcon } from '@/components/icons';
import { loadApplication } from '@/lib/application';
import { requireStaff } from '@/lib/user';

type Props = { params: Promise<{ code: string }> };

// The tab title is the code.
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  return { title: code };
}

// The page.
export default async function ApplicationPage({ params }: Props) {
  const { code } = await params;
  const [app, user] = await Promise.all([loadApplication(decodeURIComponent(code)), requireStaff()]);
  if (!app) notFound();
  return (
    <>
      <PageHeader title={app.code} sub={`${app.initials} · Fall 2026 · submitted ${app.submitted}`}>
        <Link href="/scholarships/applicants" className="o-btn s lg">
          Back to applicants
        </Link>
      </PageHeader>
      <div className="o-app-grid">
        <section className="o-card o-app-sec">
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
        <section className="o-card o-app-sec">
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
        <section className="o-card o-app-sec o-app-wide">
          <h2 className="o-h2">Essay</h2>
          <p className="o-app-essay">{app.essay || 'No essay submitted.'}</p>
        </section>
        {user.role === 'admin' ? (
          <section className="o-card o-app-sec o-app-wide">
            <h2 className="o-h2">Identity (admins only)</h2>
            <p className="o-app-note">Reviewers see only the code and initials.</p>
            <dl className="o-app-dl">
              {app.identity.map((a) => (
                <div key={a.label}>
                  <dt>{a.label}</dt>
                  <dd>{a.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>
    </>
  );
}
