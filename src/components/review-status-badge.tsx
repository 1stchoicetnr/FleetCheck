import { cn } from "@/lib/utils";
import {
  CHECKOUT_REVIEW_COLORS,
  CHECKOUT_REVIEW_LABELS,
  CheckoutReviewStatus,
} from "@/lib/types";

export function ReviewStatusBadge({
  status,
  className,
}: {
  status: CheckoutReviewStatus;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        CHECKOUT_REVIEW_COLORS[status],
        className
      )}
    >
      {CHECKOUT_REVIEW_LABELS[status]}
    </span>
  );
}
