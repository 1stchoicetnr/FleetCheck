import { deliveryView, DeliveryView } from "@/lib/delivery-status";
import { formatDate } from "@/lib/utils";

const TONE: Record<DeliveryView["state"], string> = {
  saved: "bg-amber-100 text-amber-900",
  uploading: "bg-sky-100 text-sky-900",
  sent: "bg-emerald-100 text-emerald-900",
  stuck: "bg-red-100 text-red-900",
};

export function DeliveryBadge({
  createdAt,
  sentAt,
  localOnly,
}: {
  createdAt: string;
  sentAt?: string | null;
  localOnly?: boolean;
}) {
  const view = deliveryView({ createdAt, sentAt, localOnly });
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${TONE[view.state]}`}>
      {view.label}
      {view.at ? ` · ${formatDate(view.at)}` : ""}
    </span>
  );
}
