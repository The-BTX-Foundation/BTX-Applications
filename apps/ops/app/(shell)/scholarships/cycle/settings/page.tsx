// Cycle settings: not built yet (its design is still being drawn). The "Cycle settings" button on the cycle page lands here.
import type { Metadata } from 'next';
import { NotBuilt } from '@/components/not-built';
import { PageHeader } from '@/components/page-header';

export const metadata: Metadata = { title: 'Cycle settings' };

// The placeholder page.
export default function CycleSettingsPage() {
  return (
    <>
      <PageHeader title="Cycle settings" />
      <NotBuilt />
    </>
  );
}
