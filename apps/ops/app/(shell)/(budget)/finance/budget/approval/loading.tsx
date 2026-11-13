// Shown at once while the approval page loads (Next.js loading file for /finance/budget/approval): the grey title and panels.
import { BudgetSkeleton } from '@/components/budget/budget-skeleton';

// The skeleton.
export default function BudgetApprovalLoading() {
  return <BudgetSkeleton approval />;
}
