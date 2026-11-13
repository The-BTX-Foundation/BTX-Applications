// Shown at once while the Budget data loads (Next.js loading file for /finance/budget): the grey title and panels.
import { BudgetSkeleton } from '@/components/budget/budget-skeleton';

// The skeleton.
export default function BudgetLoading() {
  return <BudgetSkeleton />;
}
