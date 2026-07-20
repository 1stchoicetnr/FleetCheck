"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { getVehicleByPlate, getVehicleByQR } from "@/lib/storage";
import { Vehicle, STATUS_LABELS, FLEET_TYPE_LABELS } from "@/lib/types";
import { StatusBadge } from "@/components/ui/status-badge";
import { QrCode, Search, ArrowRight, Camera } from "lucide-react";
import Link from "next/link";
import { QrScanner } from "@/components/qr-scanner";

export default function CheckInPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"scan" | "plate">("plate");
  const [plate, setPlate] = useState("");
  const [qr, setQr] = useState("");
  const [vehicle, setVehicle] = useState<Vehicle | null>(null);
  const [error, setError] = useState("");
  const [searching, setSearching] = useState(false);
  const [showScanner, setShowScanner] = useState(false);

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
        setVehicle(found);
      }
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <AppHeader title="Check In / Out" />
      <div className="max-w-lg mx-auto px-4 py-6 space-y-6">
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

        {vehicle && (
          <Card className="border-brand-200 bg-brand-50/50">
            <CardContent className="py-5 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-xl">{vehicle.plate}</CardTitle>
                  <p className="text-gray-600">
                    {vehicle.year} {vehicle.make} {vehicle.model}
                  </p>
                </div>
                <StatusBadge status={vehicle.status} />
              </div>
              <div className="text-sm text-gray-500 space-y-1">
                <p>Status: {STATUS_LABELS[vehicle.status]}</p>
                {vehicle.lastMileage && (
                  <p>Last mileage: {vehicle.lastMileage.toLocaleString()} mi</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Link href={`/check-in/${vehicle.id}?type=check_in`}>
                  <Button size="lg" className="w-full">
                    Check In
                    <ArrowRight className="h-4 w-4 ml-2" />
                  </Button>
                </Link>
                <Link href={`/check-in/${vehicle.id}?type=check_out`}>
                  <Button size="lg" variant="outline" className="w-full">
                    Check Out
                  </Button>
                </Link>
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
              setVehicle(found);
            }
            setSearching(false);
          }}
          onClose={() => setShowScanner(false)}
        />
      )}
    </div>
  );
}
