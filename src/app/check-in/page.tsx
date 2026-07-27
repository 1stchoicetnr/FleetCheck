"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { canPerformCheckIn } from "@/lib/fleet-config";
import { getVehicleByPlate, getVehicleByQR, getVehicleById } from "@/lib/storage";
import { Vehicle, CheckType } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { QrCode, Search, ArrowRight, Camera, AlertTriangle } from "lucide-react";
import { QrScanner } from "@/components/qr-scanner";
import {
  getCheckOutBlockReason,
  getCheckOutOilWarning,
  estimateCheckOutMileage,
} from "@/lib/oil-change";
import { OilChangeStatusBadge } from "@/components/oil-change-status";
import {
  hasOpenKnownIssue,
  storeKnownIssueConsent,
  clearKnownIssueConsent,
} from "@/lib/known-issue";
import { KnownIssueConsentScreen } from "@/components/known-issue-consent-screen";
import { setReturnHref } from "@/lib/nav-return";

function CheckInPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, loading } = useAuth();
  const [mode, setMode] = useState<"scan" | "plate">("plate");
  const [plate, setPlate] = useState("");
  const [qr, setQr] = useState("");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [pendingCheckType, setPendingCheckType] = useState<CheckType | null>(null);
  const [preloadedFromList, setPreloadedFromList] = useState(false);
  const [loadingVehicle, setLoadingVehicle] = useState(false);

  const vehicleIdParam = searchParams.get("vehicleId");

  useEffect(() => {
    if (!loading && !user) router.replace("/");
    if (user && !canPerformCheckIn(user.role)) router.replace("/dashboard");
  }, [user, loading, router]);

  useEffect(() => {
    if (!vehicleIdParam) {
      setPreloadedFromList(false);
      return;
    }
    let cancelled = false;
    setLoadingVehicle(true);
    setError("");
    getVehicleById(vehicleIdParam).then((found) => {
      if (cancelled) return;
      if (found) {
        setVehicle(found);
        setPlate(found.plate);
        setPreloadedFromList(true);
      } else {
        setError("Vehicle not found.");
        setVehicle(null);
        setPreloadedFromList(false);
      }
      setLoadingVehicle(false);
    });
    return () => {
      cancelled = true;
    };
  }, [vehicleIdParam]);

  const startCheck = (type: CheckType) => {
    if (!vehicle || !user) return;
    clearKnownIssueConsent();
    const returnTo = `${window.location.pathname}${window.location.search}`;
    setReturnHref(returnTo);
    if (hasOpenKnownIssue(vehicle)) {
      setPendingCheckType(type);
      return;
    }
    router.push(`/check-in/${vehicle.id}?type=${type}`);
  };

  const handleConsent = () => {
    if (!vehicle || !user || !pendingCheckType) return;
    const issueText = vehicle.knownIssue!.text.trim();
    storeKnownIssueConsent(vehicle.id, pendingCheckType, {
      issueText,
      driverName: user.name,
      consentedAt: new Date().toISOString(),
    });
    setReturnHref(`${window.location.pathname}${window.location.search}`);
    router.push(`/check-in/${vehicle.id}?type=${pendingCheckType}`);
  };

  const applyVehicle = async (found: Vehicle | undefined) => {
    if (!found) {
      setVehicle(null);
      return;
    }
    setVehicle(found);
    setPreloadedFromList(false);
  };

  const clearPreloadedVehicle = () => {
    setVehicle(null);
    setPreloadedFromList(false);
    setPlate("");
    setQr("");
    setError("");
    router.replace("/check-in");
  };

  const search = async () => {
    setError("");
    setSearching(true);
    try {
      let found: Vehicle | undefined;
      if (mode === "plate") {
        if (!plate.trim()) {
          setError("Please enter a license plate");
          return;
        }
        found = await getVehicleByPlate(plate);
      } else {
        if (!qr.trim()) {
          setError("Please enter a QR code");
          return;
        }
        found = await getVehicleByQR(qr);
      }
      if (!found) {
        setError("Vehicle not found. Check the plate or QR code.");
        setVehicle(null);
      } else {
        await applyVehicle(found);
      }
    } finally {
      setSearching(false);
    }
  };

  if (loading || !user) return null;

  if (vehicle && pendingCheckType && hasOpenKnownIssue(vehicle)) {
    return (
      <div className="min-h-screen bg-gray-50">
        <AppHeader title="Known Issue" backHref="/check-in" />
        <div className="max-w-lg mx-auto px-4 py-6">
          <KnownIssueConsentScreen
            vehicle={vehicle}
            checkType={pendingCheckType}
            issueText={vehicle.knownIssue!.text.trim()}
            onConsent={handleConsent}
            onCancel={() => setPendingCheckType(null)}
          />
        </div>
      </div>
    );
  }

  const showPlateSearch = !preloadedFromList || !vehicle;

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Check In / Out" backHref={preloadedFromList ? "/vehicles" : "/dashboard"} />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
        {loadingVehicle && (
          <p className="text-center text-sm text-gray-500 animate-pulse">
            Loading vehicle…
          </p>
        )}

        {showPlateSearch && !loadingVehicle && (
          <>
            <div className="flex gap-2">
              <Button
                variant={mode === "plate" ? "primary" : "secondary"}
                size="md"
                className="flex-1"
                onClick={() => {
                  setMode("plate");
                  setVehicle(null);
                  setError("");
                }}
              >
                <Search className="h-4 w-4 mr-2" />
                Enter Plate
              </Button>
              <Button
                variant={mode === "scan" ? "primary" : "secondary"}
                size="md"
                className="flex-1"
                onClick={() => {
                  setMode("scan");
                  setVehicle(null);
                  setError("");
                }}
              >
                <QrCode className="h-4 w-4 mr-2" />
                Scan QR
              </Button>
            </div>

            {mode === "plate" ? (
              <div className="space-y-4">
                <Input
                  label="License Plate"
                  placeholder="e.g. ABC-1234"
                  value={plate}
                  onChange={(e) => setPlate(e.target.value.toUpperCase())}
                  error={error}
                />
                <Button size="xl" className="w-full" onClick={search} disabled={searching}>
                  Find Vehicle
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                <Button
                  size="xl"
                  className="w-full"
                  onClick={() => setShowScanner(true)}
                >
                  <Camera className="h-5 w-5 mr-2" />
                  Open Camera Scanner
                </Button>
                <Input
                  label="QR Code"
                  placeholder="e.g. FC-ABC1234"
                  value={qr}
                  onChange={(e) => setQr(e.target.value.toUpperCase())}
                  error={error}
                />
                <Button size="xl" className="w-full" onClick={search} disabled={searching}>
                  Find Vehicle
                </Button>
              </div>
            )}
          </>
        )}

        {preloadedFromList && vehicle && (
          <Button variant="secondary" size="sm" onClick={clearPreloadedVehicle}>
            Choose a different vehicle
          </Button>
        )}

        {vehicle && !loadingVehicle && (
          <Card className="border-brand-200 bg-brand-50/50">
            <CardContent className="py-5 space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-xl">{vehicle.plate}</CardTitle>
                  <p className="text-gray-600">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </p>
                </div>
                <StatusBadge status={vehicle.status} />
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                {vehicle.lastMileage && (
                  <p>Last mileage: {vehicle.lastMileage.toLocaleString()} mi</p>
                )}
              </div>
              {vehicle.lastMileage != null && (
                <OilChangeStatusBadge
                  vehicle={vehicle}
                  currentMileage={vehicle.lastMileage}
                  compact
                />
              )}
              {hasOpenKnownIssue(vehicle) && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 flex gap-2 text-sm text-amber-950">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <p>
                    <span className="font-semibold">Known issue: </span>
                    {vehicle.knownIssue!.text.trim()}
                  </p>
                </div>
              )}
              {(() => {
                const mi = estimateCheckOutMileage(vehicle);
                const block = getCheckOutBlockReason(vehicle, mi);
                const warn = getCheckOutOilWarning(vehicle, mi);
                return (
                  <>
                    {warn && !block && (
                      <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        {warn}
                      </div>
                    )}
                    {block && (
                      <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900 font-medium">
                        {block}
                      </div>
                    )}
                  </>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                <Button size="lg" className="w-full" onClick={() => startCheck("check_in")}>
                  Check In
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="w-full"
                  disabled={
                    !!getCheckOutBlockReason(
                      vehicle,
                      estimateCheckOutMileage(vehicle)
                    )
                  }
                  onClick={() => startCheck("check_out")}
                >
                  Check Out
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {showScanner && (
        <QrScanner
          onScan={async (code) => {
            setQr(code);
            setSearching(true);
            setError("");
            const found = await getVehicleByQR(code);
            if (!found) {
              setError("Vehicle not found. Check the QR code.");
              setVehicle(null);
            } else {
              await applyVehicle(found);
            }
            setSearching(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}

export default function CheckInPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-pulse text-brand-600">Loading...</div>
        </div>
      }
    >
      <CheckInPageContent />
    </Suspense>
  );
}
