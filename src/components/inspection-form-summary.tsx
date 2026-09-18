import {
  activeIssueFlagLabels,
  CheckoutInspectionForm,
  CLOVER_SERIAL_LABEL,
  DAMAGE_SIDES,
  formatCheckResult,
  formatCloverSerial,
  INSPECTION_CHECK_ITEMS,
  trafficLightLabel,
  treadLevelLabel,
} from "@/lib/inspection-form";
import { cn } from "@/lib/utils";

export function TrafficLightBadge({
  form,
}: {
  form?: CheckoutInspectionForm | null;
}) {
  const light = form?.trafficLight;
  if (!light) return null;
  return (
    <span
      className={cn(
        "rounded-full px-2.5 py-1 text-xs font-bold",
        light === "green"
          ? "bg-green-100 text-green-800"
          : light === "yellow"
            ? "bg-amber-100 text-amber-900"
            : "bg-red-100 text-red-800"
      )}
    >
      {trafficLightLabel(light)}
    </span>
  );
}

export function InspectionFormSummary({
  form,
  compact = false,
}: {
  form: CheckoutInspectionForm;
  compact?: boolean;
}) {
  const flags = activeIssueFlagLabels(form);
  const traffic = form.trafficNote?.trim();
  const extra = form.additionalComments?.trim();
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-800">
        <span className="font-semibold">{CLOVER_SERIAL_LABEL}:</span>{" "}
        {formatCloverSerial(form)}
      </p>
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
        <TrafficLightBadge form={form} />
        <span
          className={cn(
            "rounded-full px-2.5 py-1",
            form.powertrain === "ev"
              ? "bg-sky-100 text-sky-800"
              : "bg-amber-100 text-amber-800"
          )}
        >
          {form.powertrain === "ev" ? "EV · oil/fuel N/A" : "Gas"}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1",
            form.treadLevel === "good"
              ? "bg-green-100 text-green-800"
              : form.treadLevel === "fair"
                ? "bg-sky-100 text-sky-800"
                : form.treadLevel === "low"
                  ? "bg-amber-100 text-amber-900"
                  : form.treadLevel === "bald"
                    ? "bg-red-100 text-red-800"
                    : "bg-gray-100 text-gray-600"
          )}
        >
          Tread {treadLevelLabel(form.treadLevel)}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1",
            form.interiorClean === "yes"
              ? "bg-green-100 text-green-800"
              : form.interiorClean === "no"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-600"
          )}
        >
          Interior {form.interiorClean === "yes" ? "Yes" : form.interiorClean === "no" ? "No" : "—"}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1",
            form.exteriorClean === "yes"
              ? "bg-green-100 text-green-800"
              : form.exteriorClean === "no"
                ? "bg-red-100 text-red-800"
                : "bg-gray-100 text-gray-600"
          )}
        >
          Exterior {form.exteriorClean === "yes" ? "Yes" : form.exteriorClean === "no" ? "No" : "—"}
        </span>
        {flags.map((label) => (
          <span
            key={label}
            className="rounded-full px-2.5 py-1 bg-red-100 text-red-800"
          >
            {label}
          </span>
        ))}
      </div>

      {form.trafficLight === "red" && (
        <p className="text-sm font-semibold text-red-800 bg-red-50 rounded-xl px-3 py-2">
          Park it — driver did not continue to photos. Flagged for Office /
          repairs.
        </p>
      )}
      {traffic && (
        <p className="text-sm text-gray-800 bg-gray-50 rounded-xl px-3 py-2">
          {form.trafficLight === "yellow" || form.trafficLight === "red"
            ? `${trafficLightLabel(form.trafficLight)}: ${traffic}`
            : traffic}
        </p>
      )}

      <div className={cn("grid gap-2", compact ? "grid-cols-1" : "sm:grid-cols-2")}>
        {INSPECTION_CHECK_ITEMS.map((item) => {
          const state = form.checks[item.id];
          return (
            <div
              key={item.id}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-800">{item.label}</span>
                <span
                  className={cn(
                    "text-xs font-bold",
                    state.result === "na" || state.na
                      ? "text-gray-500"
                      : state.result === "ok" || state.checked
                        ? "text-green-700"
                        : state.result === "not_ok"
                          ? "text-amber-800"
                          : "text-red-700"
                  )}
                >
                  {formatCheckResult(state)}
                </span>
              </div>
              {state.note?.trim() && (
                <p className="text-xs text-gray-600 mt-0.5">{state.note}</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-1 text-sm">
        {DAMAGE_SIDES.map((side) => {
          const noteText = form.damage[side.id]?.trim();
          const marked = form.damage.marks?.includes(side.id);
          if (!noteText && !marked) return null;
          return (
            <p key={side.id} className="text-red-800">
              <span className="font-semibold">{side.label}:</span>{" "}
              {marked ? "marked" : ""}
              {marked && noteText ? " — " : ""}
              {noteText}
            </p>
          );
        })}
      </div>

      {extra && extra !== traffic && (
        <p className="text-sm text-gray-800 bg-gray-50 rounded-xl px-3 py-2">
          {extra}
        </p>
      )}
    </div>
  );
}
