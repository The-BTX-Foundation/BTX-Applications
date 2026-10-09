// Photo and story for a winner. Mock only (`?demo=story`, `-stress`): the live schema has no place to keep them yet.
import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { ApplyLoadError } from '@/components/load-error-pages';
import { StoryView } from '@/components/story-view';
import { loadJourney } from '@/lib/journey-data';
import { STRESS } from '@/lib/stress';

export const metadata: Metadata = { title: 'Your photo and story' };

export default async function StoryPage({ searchParams }: { searchParams: Promise<{ demo?: string }> }) {
  const { demo } = await searchParams;
  const d = await loadJourney('/status/story', demo, 'story');
  if ('failed' in d) return <ApplyLoadError status />;
  if (!d.award || d.decision?.kind !== 'won') redirect('/status');
  if (!d.mock) {
    // live: the story she has saved so far; consent starts unticked unless she ticked it before
    return (
      <StoryView
        accountName={d.fullName}
        photo={d.award.photo && d.story?.photoPath ? { url: d.award.photo, name: d.story.photoPath.split('/').pop() ?? 'photo', meta: '' } : null}
        story={d.award.story}
        saved=""
        stress={false}
        live={d.awardId && d.userId ? { awardId: d.awardId, userId: d.userId, photoPath: d.story?.photoPath ?? null } : null}
        initialConsent={d.story?.consent ?? false}
      />
    );
  }
  return (
    <StoryView
      accountName={d.fullName}
      photo={{ url: '/sample-photo.png', name: d.stress ? `${STRESS.firstName}_Okonkwo-Whitfield_Portrait_2026.jpg` : 'Ebony_Coleman.jpg', meta: 'JPG, 1.2 MB' }}
      story={d.award.story}
      saved="Saved 10:42 AM"
      stress={d.stress}
      live={null}
      initialConsent
    />
  );
}
