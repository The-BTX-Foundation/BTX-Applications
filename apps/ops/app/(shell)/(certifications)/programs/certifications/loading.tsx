// Shown at once while the Certifications data loads (Next.js loading file for /programs/certifications): grey blocks
// shaped like the page.
import { CertSkeleton } from '@/components/certifications/cert-skeleton';

// The skeleton.
export default function CertificationsLoading() {
  return <CertSkeleton />;
}
