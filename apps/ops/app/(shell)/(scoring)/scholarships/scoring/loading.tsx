// Shown at once while the Scoring data loads (Next.js loading file for /scholarships/scoring).
import { ScoringSkeleton } from '@/components/scoring/scoring-skeleton';

// The skeleton.
export default function ScoringLoading() {
  return <ScoringSkeleton />;
}
