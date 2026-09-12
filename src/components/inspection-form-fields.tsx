"use client";

import {
  applyPowertrainToForm,
  CheckoutInspectionForm,
  DAMAGE_SIDES,
  DamageSide,
  INSPECTION_CHECK_ITEMS,
  ISSUE_FLAG_ITEMS,
  Powertrain,
  toggleDamageMark,
  validateInspectionForm,
} from "@/lib/inspection-form";
import { cn } from "@/lib/utils";
import { VehicleSilhouette } from "./vehicle-silhouette";

function YesNoButtons({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "yes" | "no" | "";
  onChange: (next: "yes" | "no") => void;
}) {
  return (
    <div>
      <p className="block text-base font-semibold text-gray-900 mb-1.5">
        {label}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {(
          [
            ["yes", "Yes"],
            ["no", "No"],
          ] as const
        ).map(([next, text]) => (
          <button
            key={next}
            type="button"
            onClick={() => onChange(next)}
            className={cn(
              "min-h-[52px] rounded-xl border-2 font-semibold",
              value === next
                ? next === "yes"
                  ? "border-green-600 bg-green-50 text-green-800"
                  : "border-red-600 bg-red-50 text-red-800"
                : "border-gray-200 bg-white text-gray-700"
            )}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

export function InspectionFormFields({
  form,
  powertrain,
  onChange,
}: {
  form: CheckoutInspectionForm;
  powertrain: Powertrain;
  onChange: (next: CheckoutInspectionForm) => void;
}) {
  const synced = applyPowertrainToForm(form, powertrain);
  const validation = validateInspectionForm(synced, powertrain);

  const update = (next: CheckoutInspectionForm) => {
    onChange(applyPowertrainToForm(next, powertrain));
  };

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2 text-sm text-brand-900">
        {powertrain === "ev"
          ? "EV unit — Oil and Fuel Level are N/A. Other checks are required."
          : "Gas unit — Oil and Fuel Level are required, same as the paper form."}
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-bold text-gray-900">Walkaround checks</h3>
        {INSPECTION_CHECK_ITEMS.map((item) => {
          const state = synced.checks[item.id];
          const skipped = Boolean(state.na);
          return (
            <div
              key={item.id}
              className={cn(
                "rounded-2xl border p-3 space-y-2",
                skipped
                  ? "border-gray-200 bg-gray-50"
                  : state.checked
                    ? "border-green-300 bg-green-50/40"
                    : "border-gray-200 bg-white"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-gray-900">{item.label}</p>
                  {item.hint && !skipped && (
                    <p className="text-xs text-gray-500">Prompt: {item.hint}</p>
                  )}
                  {skipped && (
                    <p className="text-xs font-semibold text-gray-500">
                      N/A for EV
                    </p>
                  )}
                </div>
                {skipped ? (
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500 bg-gray-200 rounded-full px-3 py-1">
                    N/A
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      update({
                        ...synced,
                        checks: {
                          ...synced.checks,
                          [item.id]: {
                            ...state,
                            checked: !state.checked,
                          },
                        },
                      })
                    }
                    className={cn(
                      "min-h-[44px] min-w-[96px] rounded-xl border-2 text-sm font-semibold",
                      state.checked
                        ? "border-green-600 bg-green-600 text-white"
                        : "border-gray-300 bg-white text-gray-700"
                    )}
                  >
                    {state.checked ? "Checked" : "Check"}
                  </button>
                )}
              </div>
              {!skipped && (
                <input
                  value={state.note ?? ""}
                  onChange={(e) =>
                    update({
                      ...synced,
                      checks: {
                        ...synced.checks,
                        [item.id]: { ...state, note: e.target.value },
                      },
                    })
                  }
                  placeholder={
                    item.id === "tirePressure"
                      ? "Notes — e.g. 35 Psi"
                      : "Optional note"
                  }
                  className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm min-h-[44px]"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-bold text-gray-900">Vehicle clean?</h3>
        <YesNoButtons
          label="Interior"
          value={synced.interiorClean}
          onChange={(interiorClean) => update({ ...synced, interiorClean })}
        />
        <YesNoButtons
          label="Exterior"
          value={synced.exteriorClean}
          onChange={(exteriorClean) => update({ ...synced, exteriorClean })}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-bold text-gray-900">Damage</h3>
        <p className="text-sm text-gray-600">
          Photo walkaround still has per-photo DAMAGE flags. Use this for the
          paper left/right diagram — mark a side and describe it.
        </p>
        <VehicleSilhouette
          marked={synced.damage.marks ?? []}
          onToggle={(side: DamageSide) =>
            update(toggleDamageMark(synced, side))
          }
        />
        {DAMAGE_SIDES.map((side) => (
          <label key={side.id} className="block">
            <span className="block text-sm font-semibold text-gray-800 mb-1">
              {side.label}
              {synced.damage.marks?.includes(side.id) ? " · marked" : ""}
            </span>
            <input
              value={synced.damage[side.id] ?? ""}
              onChange={(e) =>
                update({
                  ...synced,
                  damage: { ...synced.damage, [side.id]: e.target.value },
                })
              }
              placeholder={`${side.label} damage note`}
              className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm min-h-[44px]"
            />
          </label>
        ))}
      </div>

      <label className="block">
        <span className="block text-base font-semibold text-gray-900 mb-1.5">
          Additional comments
        </span>
        <textarea
          value={synced.additionalComments ?? ""}
          onChange={(e) =>
            update({ ...synced, additionalComments: e.target.value })
          }
          rows={4}
          placeholder="Safety, repairs, or anything office should see…"
          className="w-full rounded-xl border-2 border-gray-300 px-3 py-3 text-sm min-h-[96px]"
        />
      </label>

      <div className="space-y-2">
        <p className="text-base font-semibold text-gray-900">Issue flags</p>
        <div className="grid grid-cols-2 gap-2">
          {ISSUE_FLAG_ITEMS.map((item) => {
            const on = Boolean(synced.issueFlags?.[item.id]);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  update({
                    ...synced,
                    issueFlags: {
                      ...synced.issueFlags,
                      [item.id]: on ? undefined : true,
                    },
                  })
                }
                className={cn(
                  "min-h-[48px] rounded-xl border-2 text-sm font-semibold px-2",
                  on
                    ? "border-red-600 bg-red-50 text-red-800"
                    : "border-gray-200 bg-white text-gray-700"
                )}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>

      {validation.ok === false && (
        <p className="text-sm text-amber-800 bg-amber-50 rounded-xl px-3 py-2">
          {validation.error}
        </p>
      )}
    </div>
  );
}
