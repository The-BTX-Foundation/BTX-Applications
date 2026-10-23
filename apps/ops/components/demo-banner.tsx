// The thin strip on the sample-data copy of the Ops Hub (the one App Review opens). It never renders on the real Ops Hub.
import { DEMO_BANNER_TEXT, DEMO_COPY } from '@/lib/demo';

export function DemoBanner() {
  if (!DEMO_COPY) return null;
  return (
    <p className="o-demo" role="note">
      {DEMO_BANNER_TEXT}
    </p>
  );
}
