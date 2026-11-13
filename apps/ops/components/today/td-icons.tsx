// Today's icons are the shared refresh set (components/refresh/icons.tsx); this file keeps Today's names for them and maps
// an area's app icon name to the demo's mark.
import type { OpsIconName } from '@/components/icons';
import type { IconName } from '@/components/refresh/icons';

export { Icon as TdIcon, type IconName as TdIconName } from '@/components/refresh/icons';

/** The demo's icon for an area's app icon name (the contract carries the app's names). */
export const AREA_ICON: Partial<Record<OpsIconName, IconName>> = {
  scholarships: 'cap',
  money: 'money',
  programs: 'flag',
  outreach: 'mega',
  tasks: 'task',
  calendar: 'cal',
  approval: 'approve',
  scoring: 'scoring',
};
