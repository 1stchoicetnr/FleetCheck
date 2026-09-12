import {
  activeIssueFlagLabels,
  CheckoutInspectionForm,
  DAMAGE_SIDES,
  formatCheckResult,
  INSPECTION_CHECK_ITEMS,
} from "@/lib/inspection-form";
import { cn } from "@/lib/utils";

export function InspectionFormSummary({
  form,
  compact = false,
}: {
  form: CheckoutInspectionForm;
  compact?: boolean;
}) {
  const flags = activeIssueFlagLabels(form);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs font-semibold">
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
                    state.na
                      ? "text-gray-500"
                      : state.checked
                        ? "text-green-700"
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
          const note = form.damage[side.id]?.trim();
          const marked = form.damage.marks?.includes(side.id);
          if (!note && !marked) return null;
          return (
            <p key={side.id} className="text-red-800">
              <span className="font-semibold">{side.label}:</span>{" "}
              {marked ? "marked" : ""}
              {marked && note ? " — " : ""}
              {note}
            </p>
          );
        })}
      </div>

      {form.additionalComments?.trim() && (
        <p className="text-sm text-gray-800 bg-gray-50 rounded-xl px-3 py-2">
          {form.additionalComments}
        </p>
      )}
    </div>
  );
}
