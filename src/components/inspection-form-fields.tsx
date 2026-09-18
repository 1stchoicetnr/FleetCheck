"use client";

import {
  applyPowertrainToForm,
  asTreadByTire,
  CheckoutInspectionForm,
  CLOVER_SERIAL_HINT,
  CLOVER_SERIAL_LABEL,
  cloverSerialOf,
  DAMAGE_SIDES,
  DamageSide,
  evSkipsCheck,
  INSPECTION_CHECK_ITEMS,
  InspectionFieldKey,
  ISSUE_FLAG_ITEMS,
  Powertrain,
  precheckNote,
  suggestedTrafficLight,
  TRAFFIC_LIGHT_ITEMS,
  TREAD_LEVEL_ITEMS,
  TREAD_TIRE_ITEMS,
  TreadLevel,
  TreadTireId,
  toggleDamageMark,
  TrafficLight,
  UNIT_NUMBER_LABEL,
  validateInspectionForm,
} from "@/lib/inspection-form";
import { cn } from "@/lib/utils";
import { VehicleSilhouette } from "./vehicle-silhouette";

function YesNoButtons({
  label,
  value,
  onChange,
  error,
  fieldKey,
}: {
  label: string;
  value: "yes" | "no" | "";
  onChange: (next: "yes" | "no") => void;
  error?: boolean;
  fieldKey?: InspectionFieldKey;
}) {
  return (
    <div data-precheck-field={fieldKey}>
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
              "min-h-[48px] rounded-xl border-2 font-semibold",
              value === next
                ? next === "yes"
                  ? "border-green-600 bg-green-50 text-green-800"
                  : "border-red-600 bg-red-50 text-red-800"
                : error
                  ? "border-red-500 bg-red-50 text-red-800"
                  : "border-gray-200 bg-white text-gray-700"
            )}
          >
            {text}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-1.5 text-sm font-medium text-red-600">
          Required — pick Yes or No.
        </p>
      )}
    </div>
  );
}

export function InspectionFormFields({
  form,
  powertrain,
  unitNumber,
  onChange,
  showErrors = false,
}: {
  form: CheckoutInspectionForm;
  powertrain: Powertrain;
  unitNumber?: string;
  onChange: (next: CheckoutInspectionForm) => void;
  showErrors?: boolean;
}) {
  const synced = applyPowertrainToForm(form, powertrain);
  const validation = validateInspectionForm(synced, powertrain);
  const missing = new Set(showErrors ? validation.missing : []);
  const suggested = suggestedTrafficLight(synced);
  const tread = asTreadByTire(synced.treadByTire, synced.treadLevel);

  const update = (next: CheckoutInspectionForm) => {
    onChange(applyPowertrainToForm(next, powertrain));
  };

  const setTread = (tire: TreadTireId, level: TreadLevel) => {
    update({
      ...synced,
      treadByTire: { ...tread, [tire]: level },
    });
  };

  const setTrafficLight = (trafficLight: TrafficLight) => {
    update({
      ...synced,
      trafficLight,
      issueFlags:
        trafficLight === "red"
          ? { ...synced.issueFlags, needsRepair: true }
          : synced.issueFlags,
    });
  };

  const fieldError = (key: InspectionFieldKey) => missing.has(key);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-200 bg-brand-50/70 px-3 py-2 text-sm text-brand-900">
        {powertrain === "ev"
          ? "EV unit — Oil and Fuel level are N/A and will not block Precheck. Aim for about a minute."
          : "Gas unit — Oil and Fuel level are required. Aim for about a minute."}
      </div>

      <div className="space-y-3">
        {unitNumber ? (
          <div>
            <p className="block text-base font-semibold text-gray-900 mb-1">
              {UNIT_NUMBER_LABEL}
            </p>
            <p className="rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-lg font-semibold text-gray-900">
              {unitNumber}
            </p>
            <p className="mt-1.5 text-sm text-gray-500">
              Vehicle number for this van — not the Clover.
            </p>
          </div>
        ) : null}
        <label className="block" data-precheck-field="cloverSerial">
          <span className="block text-base font-semibold text-gray-900 mb-1.5">
            {CLOVER_SERIAL_LABEL}{" "}
            <span className="font-medium text-gray-500">(optional)</span>
          </span>
          <input
            value={cloverSerialOf(synced)}
            onChange={(e) =>
              update({ ...synced, cloverSerial: e.target.value })
            }
            inputMode="numeric"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={8}
            placeholder="e.g. 4821"
            className={cn(
              "w-full rounded-xl border-2 px-4 py-3 text-lg min-h-[52px]",
              fieldError("cloverSerial")
                ? "border-red-500 bg-red-50"
                : "border-gray-300"
            )}
          />
          <span
            className={cn(
              "mt-1.5 block text-sm",
              fieldError("cloverSerial")
                ? "font-medium text-red-600"
                : "text-gray-500"
            )}
          >
            {fieldError("cloverSerial")
              ? "If you enter a Clover serial, use about 3–4 letters/digits."
              : CLOVER_SERIAL_HINT}
          </span>
        </label>
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-bold text-gray-900">Walkaround checks</h3>
        {INSPECTION_CHECK_ITEMS.map((item) => {
          const state = synced.checks[item.id];
          const skipped = evSkipsCheck(item.id, powertrain) || state.result === "na";
          const okLabel = item.id === "tirePressure" ? "Yes" : "OK";
          const issueLabel = item.id === "tirePressure" ? "No" : "Issue";
          const error = !skipped && fieldError(item.id);
          return (
            <div
              key={item.id}
              data-precheck-field={item.id}
              className={cn(
                "rounded-2xl border p-3 space-y-2",
                skipped
                  ? "border-gray-200 bg-gray-50"
                  : error
                    ? "border-red-500 bg-red-50"
                    : state.result === "ok"
                      ? "border-green-300 bg-green-50/40"
                      : state.result === "not_ok"
                        ? "border-amber-300 bg-amber-50/50"
                        : "border-gray-200 bg-white"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{item.label}</p>
                  {item.hint && !skipped && (
                    <p className="text-xs text-gray-500">{item.hint}</p>
                  )}
                  {skipped && (
                    <p className="text-xs font-semibold text-gray-500">
                      N/A for EV — skipped
                    </p>
                  )}
                  {error && (
                    <p className="text-xs font-medium text-red-600 mt-1">
                      Required — pick {okLabel} or {issueLabel}.
                    </p>
                  )}
                </div>
                {skipped ? (
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500 bg-gray-200 rounded-full px-3 py-1 shrink-0">
                    N/A
                  </span>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          ...synced,
                          checks: {
                            ...synced.checks,
                            [item.id]: { ...state, result: "ok" },
                          },
                        })
                      }
                      className={cn(
                        "min-h-[44px] min-w-[72px] rounded-xl border-2 text-sm font-semibold px-3",
                        state.result === "ok"
                          ? "border-green-600 bg-green-600 text-white"
                          : error
                            ? "border-red-400 bg-white text-red-800"
                            : "border-gray-300 bg-white text-gray-700"
                      )}
                    >
                      {okLabel}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        update({
                          ...synced,
                          checks: {
                            ...synced.checks,
                            [item.id]: { ...state, result: "not_ok" },
                          },
                        })
                      }
                      className={cn(
                        "min-h-[44px] min-w-[72px] rounded-xl border-2 text-sm font-semibold px-3",
                        state.result === "not_ok"
                          ? "border-amber-600 bg-amber-500 text-white"
                          : error
                            ? "border-red-400 bg-white text-red-800"
                            : "border-gray-300 bg-white text-gray-700"
                      )}
                    >
                      {issueLabel}
                    </button>
                  </div>
                )}
              </div>
              {!skipped && state.result === "not_ok" && (
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
                  placeholder="Optional note"
                  className="w-full rounded-xl border-2 border-gray-200 px-3 py-2.5 text-sm min-h-[44px]"
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-bold text-gray-900">Tread level</h3>
        <p className="text-sm text-gray-600">
          Rate each tire (LF / RF / LR / RR). Replaces the four tire-tread photos.
        </p>
        <div className="space-y-3">
          {TREAD_TIRE_ITEMS.map((tire) => {
            const error = fieldError(`tread.${tire.id}`);
            return (
              <div
                key={tire.id}
                data-precheck-field={`tread.${tire.id}`}
                className={cn(
                  "rounded-2xl border p-3 space-y-2",
                  error
                    ? "border-red-500 bg-red-50"
                    : "border-gray-200 bg-white"
                )}
              >
                <p className="font-semibold text-gray-900">
                  {tire.label}{" "}
                  <span className="font-medium text-gray-500">
                    · {tire.longLabel}
                  </span>
                </p>
                {error && (
                  <p className="text-xs font-medium text-red-600">
                    Required — pick Good, Fair, Low, or Bald.
                  </p>
                )}
                <div className="grid grid-cols-4 gap-1.5">
                  {TREAD_LEVEL_ITEMS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setTread(tire.id, item.id as TreadLevel)}
                      className={cn(
                        "min-h-[48px] rounded-xl border-2 px-1 py-1 text-center text-sm font-bold",
                        tread[tire.id] === item.id
                          ? item.id === "good"
                            ? "border-green-600 bg-green-50 text-green-800"
                            : item.id === "fair"
                              ? "border-sky-600 bg-sky-50 text-sky-800"
                              : item.id === "low"
                                ? "border-amber-500 bg-amber-50 text-amber-900"
                                : "border-red-600 bg-red-50 text-red-800"
                          : error
                            ? "border-red-300 bg-white text-red-800"
                            : "border-gray-200 bg-white text-gray-800"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-bold text-gray-900">Vehicle clean?</h3>
        <YesNoButtons
          label="Interior"
          value={synced.interiorClean}
          fieldKey="interiorClean"
          error={fieldError("interiorClean")}
          onChange={(interiorClean) => update({ ...synced, interiorClean })}
        />
        <YesNoButtons
          label="Exterior"
          value={synced.exteriorClean}
          fieldKey="exteriorClean"
          error={fieldError("exteriorClean")}
          onChange={(exteriorClean) => update({ ...synced, exteriorClean })}
        />
      </div>

      <div className="space-y-3">
        <h3 className="text-base font-bold text-gray-900">Damage notes</h3>
        <p className="text-sm text-gray-600">
          Mark a side and add a short note. Photo walkaround still has per-photo
          DAMAGE flags after Green or Yellow.
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
          Additional comments / issues
        </span>
        <textarea
          value={synced.additionalComments ?? ""}
          onChange={(e) =>
            update({ ...synced, additionalComments: e.target.value })
          }
          rows={3}
          placeholder="Anything Office should see…"
          className="w-full rounded-xl border-2 border-gray-300 px-3 py-3 text-sm min-h-[80px]"
        />
      </label>

      <div className="space-y-2">
        <p className="text-base font-semibold text-gray-900">Office flags</p>
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
                  "min-h-[44px] rounded-xl border-2 text-sm font-semibold px-2",
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

      <div
        className="space-y-2"
        data-precheck-field={
          fieldError("trafficNote") ? "trafficNote" : "trafficLight"
        }
      >
        <h3 className="text-base font-bold text-gray-900">Traffic light</h3>
        <p className="text-sm text-gray-600">
          Suggested:{" "}
          <span className="font-semibold">
            {TRAFFIC_LIGHT_ITEMS.find((item) => item.id === suggested)?.label}
          </span>{" "}
          — {TRAFFIC_LIGHT_ITEMS.find((item) => item.id === suggested)?.action}
        </p>
        {fieldError("trafficLight") && (
          <p className="text-sm font-medium text-red-600">
            Required — pick Green, Yellow, or Red.
          </p>
        )}
        <div className="grid grid-cols-3 gap-2">
          {TRAFFIC_LIGHT_ITEMS.map((item) => {
            const selected = synced.trafficLight === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTrafficLight(item.id)}
                className={cn(
                  "min-h-[72px] rounded-xl border-2 px-2 py-2",
                  selected
                    ? item.id === "green"
                      ? "border-green-600 bg-green-600 text-white"
                      : item.id === "yellow"
                        ? "border-amber-500 bg-amber-400 text-amber-950"
                        : "border-red-600 bg-red-600 text-white"
                    : fieldError("trafficLight")
                      ? "border-red-500 bg-red-50 text-red-800"
                    : item.id === "green"
                      ? "border-green-200 bg-green-50 text-green-800"
                      : item.id === "yellow"
                        ? "border-amber-200 bg-amber-50 text-amber-900"
                        : "border-red-200 bg-red-50 text-red-800"
                )}
              >
                <span className="block text-lg font-black">{item.label}</span>
                <span className="block text-[11px] leading-tight font-semibold opacity-90">
                  {item.action}
                </span>
              </button>
            );
          })}
        </div>
        {(synced.trafficLight === "yellow" || synced.trafficLight === "red") && (
          <input
            value={synced.trafficNote ?? ""}
            onChange={(e) =>
              update({ ...synced, trafficNote: e.target.value })
            }
            placeholder={
              synced.trafficLight === "red"
                ? "Why is this van parked? Office will see this."
                : "Short note — then you can drive and take photos."
            }
            className={cn(
              "w-full rounded-xl border-2 px-3 py-2.5 text-sm min-h-[48px]",
              fieldError("trafficNote")
                ? "border-red-500 bg-red-50"
                : "border-gray-300"
            )}
          />
        )}
        {fieldError("trafficNote") && (
          <p className="text-sm font-medium text-red-600">
            {synced.trafficLight === "red"
              ? "Add a short note for Red — park it."
              : "Add a short note for Yellow — note & drive."}
          </p>
        )}
        {synced.trafficLight === "red" && (
          <p className="text-sm text-red-800 bg-red-50 rounded-xl px-3 py-2">
            Park it. Do not continue to photos. Sign and send this Precheck to
            Office / repairs.
          </p>
        )}
        {synced.trafficLight === "yellow" && !precheckNote(synced) && (
          <p className="text-sm text-amber-900 bg-amber-50 rounded-xl px-3 py-2">
            Yellow needs a short note before photos.
          </p>
        )}
      </div>

      {showErrors && validation.ok === false && (
        <p className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
          {validation.error}
        </p>
      )}
    </div>
  );
}
