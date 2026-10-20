"use client";

import { FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  createFleet,
  fetchCompanies,
  fetchFleets,
  fetchVehicles,
  updateFleet,
  type SharedFleet,
  type SharedVehicle,
} from "@/lib/checkout-api";
import { activeCountByFleetId, activeCountLabel, fleetSubtitle, fleetTitle } from "@/lib/fleet-rows";
import { getCompanies, getFleets, getVehicles } from "@/lib/storage";
import { Company, FLEET_TYPE_LABELS, Fleet, FleetType } from "@/lib/types";

const TYPE_OPTIONS: FleetType[] = ["taxi", "tow", "turo", "service_vehicle"];

export function FleetManager({ canEdit }: { canEdit: boolean }) {
  const [ready, setReady] = useState(false);
  const [fleets, setFleets] = useState<SharedFleet[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [vehicles, setVehicles] = useState<SharedVehicle[]>([]);
  const [offline, setOffline] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [draftName, setDraftName] = useState("");
  const [name, setName] = useState("");
  const [type, setType] = useState<FleetType>("taxi");
  const [companyId, setCompanyId] = useState("");

  async function load() {
    try {
      const [nextFleets, nextVehicles, nextCompanies] = await Promise.all([
        fetchFleets({ includeArchived: true }),
        fetchVehicles(undefined, { includeArchived: true }),
        fetchCompanies(),
      ]);
      setFleets(nextFleets);
      setVehicles(nextVehicles);
      setCompanies(nextCompanies);
      setCompanyId((current) => current || nextCompanies[0]?.id || "");
      setOffline(false);
      setError("");
      setReady(true);
    } catch (err) {
      const [cachedFleets, cachedVehicles, cachedCompanies] = await Promise.all([
        getFleets(),
        getVehicles(),
        getCompanies(),
      ]);
      setFleets(cachedFleets.map(asSharedFleet));
      setVehicles(cachedVehicles.map(asSharedVehicle));
      setCompanies(cachedCompanies);
      setOffline(true);
      setError(err instanceof Error ? err.message : "Showing fleets saved on this phone.");
      setReady(true);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  const counts = activeCountByFleetId(fleets, vehicles);
  const visible = fleets.filter((fleet) => showArchived || !fleet.archivedAt);

  async function onAdd(event: FormEvent) {
    event.preventDefault();
    if (!canEdit) return;
    setBusy(true);
    setError("");
    try {
      await createFleet({ name, type, companyId });
      setName("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add that fleet.");
    } finally {
      setBusy(false);
    }
  }

  async function onRename(id: string) {
    setBusy(true);
    setError("");
    try {
      await updateFleet(id, { name: draftName });
      setEditingId("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not rename that fleet.");
    } finally {
      setBusy(false);
    }
  }

  async function onArchive(id: string, archived: boolean) {
    setBusy(true);
    setError("");
    try {
      await updateFleet(id, { archived });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update that fleet.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="py-5 space-y-3">
        <CardTitle>Fleets</CardTitle>
        <p className="text-xs text-gray-500">
          The server keeps the fleet list. This phone uses its saved copy when it is offline.
        </p>
        {offline ? (
          <p className="text-sm text-gray-600">Showing the fleets saved on this phone.</p>
        ) : null}
        {error ? <p className="text-sm text-red-700">{error}</p> : null}
        {canEdit ? (
          <form onSubmit={onAdd} className="space-y-3 border-b border-gray-100 pb-4">
            <Input
              id="fleet-name"
              label="Fleet name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
            />
            <label className="block text-base font-semibold text-gray-900" htmlFor="fleet-type">
              Type
            </label>
            <select
              id="fleet-type"
              className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
              value={type}
              onChange={(event) => setType(event.target.value as FleetType)}
            >
              {TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {FLEET_TYPE_LABELS[option]}
                </option>
              ))}
            </select>
            <label className="block text-base font-semibold text-gray-900" htmlFor="fleet-company">
              Company
            </label>
            <select
              id="fleet-company"
              className="w-full rounded-xl border border-line bg-surface px-3 py-3 text-ink"
              value={companyId}
              onChange={(event) => setCompanyId(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
            <Button type="submit" disabled={busy || !name.trim() || !companyId}>
              Add fleet
            </Button>
          </form>
        ) : null}
        {fleets.some((fleet) => fleet.archivedAt) ? (
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
            />
            Show archived
          </label>
        ) : null}
        {!ready ? <p className="text-sm text-gray-600">Loading fleets…</p> : null}
        {ready ? visible.map((fleet) => {
          const company = companies.find((item) => item.id === fleet.companyId);
          const title = fleetTitle(fleet, company?.name);
          const subtitle = fleetSubtitle(title, fleet.type);
          return (
            <div key={fleet.id} className="py-2 border-b border-gray-100 last:border-0 space-y-2">
              <div className="flex justify-between items-center gap-3">
                <div>
                  <p className="font-medium">{title}</p>
                  {subtitle ? <p className="text-xs text-gray-500">{subtitle}</p> : null}
                  {fleet.archivedAt ? <p className="text-xs text-gray-500">Archived</p> : null}
                </div>
                <span className="text-sm text-gray-400 text-right">
                  {activeCountLabel(counts[fleet.id] ?? 0)}
                </span>
              </div>
              {canEdit && !offline ? (
                editingId === fleet.id ? (
                  <div className="flex gap-2">
                    <Input
                      id={`rename-${fleet.id}`}
                      label="New name"
                      value={draftName}
                      onChange={(event) => setDraftName(event.target.value)}
                      maxLength={80}
                    />
                    <Button type="button" size="sm" disabled={busy} onClick={() => void onRename(fleet.id)}>
                      Save
                    </Button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditingId(fleet.id);
                        setDraftName(fleet.name);
                      }}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={busy}
                      onClick={() => void onArchive(fleet.id, !fleet.archivedAt)}
                    >
                      {fleet.archivedAt ? "Restore" : "Archive"}
                    </Button>
                  </div>
                )
              ) : null}
            </div>
          );
        }) : null}
        {ready && visible.length === 0 ? <p className="text-sm text-gray-600">No fleets yet.</p> : null}
      </CardContent>
    </Card>
  );
}

function asSharedFleet(fleet: Fleet): SharedFleet {
  return {
    id: fleet.id,
    name: fleet.name,
    type: fleet.type,
    companyId: fleet.companyId,
    archivedAt: fleet.archivedAt,
    createdAt: fleet.createdAt,
  };
}

function asSharedVehicle(vehicle: {
  id: string;
  companyId: string;
  fleetId?: string;
  unitNumber: string;
  plate: string;
  make: string;
  model: string;
  year: number;
  archivedAt?: string;
  createdAt: string;
}): SharedVehicle {
  return {
    id: vehicle.id,
    companyId: vehicle.companyId,
    fleetId: vehicle.fleetId,
    unitNumber: vehicle.unitNumber,
    plate: vehicle.plate,
    make: vehicle.make,
    model: vehicle.model,
    year: vehicle.year,
    archivedAt: vehicle.archivedAt,
    createdAt: vehicle.createdAt,
  };
}
