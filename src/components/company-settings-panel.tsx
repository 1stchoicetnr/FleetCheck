"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchCompanies, fetchCompanySettings, saveCompanySettings } from "@/lib/checkout-api";
import type { PublicCompanySettings } from "@/lib/company-settings";
import { PHOTO_ANGLES, walkaroundPhotoSteps, type FleetType } from "@/lib/types";
import type { Company } from "@/lib/types";

const ANGLES = walkaroundPhotoSteps(PHOTO_ANGLES);

export function CompanySettingsPanel() {
  const [settings, setSettings] = useState<PublicCompanySettings | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [fleetType, setFleetType] = useState<FleetType>("taxi");
  const [webhook, setWebhook] = useState("");
  const [clearWebhook, setClearWebhook] = useState(false);
  const [logo, setLogo] = useState<string | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void Promise.all([fetchCompanySettings(), fetchCompanies()])
      .then(([next, list]) => {
        setSettings(next);
        setLogo(next.pdfLogoDataUrl);
        setCompanies(list);
        setError("");
      })
      .catch((err: Error) => setError(err.message || "Could not load settings"));
  }, []);

  async function onLogo(file: File) {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 240 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    if (dataUrl.length > 180_000) {
      setError("That logo is still too large. Use a simpler image.");
      return;
    }
    setLogo(dataUrl);
    setClearLogo(false);
    setSaved("");
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!settings) return;
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const next = await saveCompanySettings({
        fleetTypes: settings.fleetTypes,
        photos: settings.photos,
        cloverCompanyIds: settings.cloverCompanyIds,
        ...(webhook.trim() ? { slackWebhook: webhook.trim() } : {}),
        ...(clearWebhook ? { clearSlackWebhook: true } : {}),
        ...(clearLogo ? { clearPdfLogo: true } : {}),
        ...(logo && logo !== settings.pdfLogoDataUrl ? { pdfLogoDataUrl: logo } : {}),
      });
      setSettings(next);
      setLogo(next.pdfLogoDataUrl);
      setWebhook("");
      setClearWebhook(false);
      setClearLogo(false);
      setSaved(next.usingDefaults ? "Saved. This company is back to the current defaults." : "Saved.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save settings");
    } finally {
      setBusy(false);
    }
  }

  const selected = settings?.fleetTypes.find((item) => item.id === fleetType);

  return (
        <form id="company" onSubmit={onSubmit} className="space-y-4">
          <div>
            <h2 className="text-lg font-bold text-ink">Company</h2>
            <p className="text-sm text-muted mt-1">
              Fleet types, required photos, the PDF logo, and Clover. Leave them as they are and checkout stays the same.
            </p>
          </div>
          {error && <p className="text-sm font-medium text-red-700">{error}</p>}
          {saved && <p className="text-sm font-medium text-emerald-800">{saved}</p>}

          {settings && (
            <>
              <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <h3 className="font-semibold text-gray-900">Fleet types</h3>
                <p className="text-sm text-gray-600">
                  Turning a type off hides those fleets from new checkouts. Reports already sent stay put.
                </p>
                {settings.fleetTypes.map((item) => (
                  <label key={item.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={(event) => {
                        const enabled = event.target.checked;
                        setSettings({
                          ...settings,
                          fleetTypes: settings.fleetTypes.map((row) =>
                            row.id === item.id ? { ...row, enabled } : row
                          ),
                        });
                      }}
                    />
                    <input
                      value={item.label}
                      onChange={(event) => {
                        const label = event.target.value;
                        setSettings({
                          ...settings,
                          fleetTypes: settings.fleetTypes.map((row) =>
                            row.id === item.id ? { ...row, label } : row
                          ),
                        });
                      }}
                      className="flex-1 rounded-lg border border-gray-300 px-3 py-2"
                    />
                  </label>
                ))}
              </section>

              <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <h3 className="font-semibold text-gray-900">Photos</h3>
                <label className="block text-sm text-gray-700">
                  Fleet type
                  <select
                    value={fleetType}
                    onChange={(event) => setFleetType(event.target.value as FleetType)}
                    className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                  >
                    {settings.fleetTypes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="text-sm text-gray-600">
                  {selected?.label}: checked photos are required. Unchecked photos stay optional.
                </p>
                <div className="max-h-80 overflow-auto space-y-2">
                  {ANGLES.map((step) => (
                    <label key={step.angle} className="flex items-center gap-3 text-sm">
                      <input
                        type="checkbox"
                        checked={settings.photos[fleetType]?.[step.angle] !== false}
                        onChange={(event) => {
                          const required = event.target.checked;
                          setSettings({
                            ...settings,
                            photos: {
                              ...settings.photos,
                              [fleetType]: {
                                ...settings.photos[fleetType],
                                [step.angle]: required,
                              },
                            },
                          });
                        }}
                      />
                      <span>{step.label}</span>
                    </label>
                  ))}
                </div>
              </section>

              <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <h3 className="font-semibold text-gray-900">Slack webhook</h3>
                <p className="text-sm text-gray-600">
                  {settings.slackWebhookSet
                    ? "A webhook is saved for this company."
                    : "Checkout notices use the server webhook until you paste a different one."}
                  {" "}Saving does not send a message.
                </p>
                <input
                  type="password"
                  autoComplete="off"
                  value={webhook}
                  onChange={(event) => {
                    setWebhook(event.target.value);
                    setClearWebhook(false);
                  }}
                  placeholder="Paste a Slack incoming webhook"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
                {settings.slackWebhookSet && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={clearWebhook}
                      onChange={(event) => setClearWebhook(event.target.checked)}
                    />
                    Use the server webhook instead
                  </label>
                )}
              </section>

              <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <h3 className="font-semibold text-gray-900">Clover</h3>
                <p className="text-sm text-gray-600">
                  Fleets with this on ask for the Clover serial during precheck.
                </p>
                {companies.map((company) => (
                  <label key={company.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="checkbox"
                      checked={settings.cloverCompanyIds.includes(company.id)}
                      onChange={(event) => {
                        const on = event.target.checked;
                        const ids = on
                          ? [...settings.cloverCompanyIds, company.id]
                          : settings.cloverCompanyIds.filter((id) => id !== company.id);
                        setSettings({ ...settings, cloverCompanyIds: ids });
                      }}
                    />
                    {company.name}
                  </label>
                ))}
              </section>

              <section className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                <h3 className="font-semibold text-gray-900">PDF logo</h3>
                <p className="text-sm text-gray-600">
                  Blank keeps the Inspekt mark on PDFs.
                </p>
                {logo && !clearLogo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt="PDF logo preview" className="h-16 w-16 rounded-lg object-contain bg-gray-900" />
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void onLogo(file);
                  }}
                />
                {logo && (
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={clearLogo}
                      onChange={(event) => setClearLogo(event.target.checked)}
                    />
                    Use the Inspekt mark instead
                  </label>
                )}
              </section>

              <Button type="submit" size="lg" className="w-full" disabled={busy}>
                {busy ? "Saving…" : "Save settings"}
              </Button>
            </>
          )}
        </form>
  );
}
