"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, X } from "lucide-react";
import { Button } from "./ui/button";

interface QrScannerProps {
  onScan: (code: string) => void;
  onClose: () => void;
}

export function QrScanner({ onScan, onClose }: QrScannerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState("");
  const [scanning, setScanning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval>;

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setScanning(true);

        const Detector = (
          window as unknown as {
            BarcodeDetector?: new (opts: { formats: string[] }) => {
              detect: (source: HTMLVideoElement) => Promise<{ rawValue: string }[]>;
            };
          }
        ).BarcodeDetector;

        if (Detector) {
          const detector = new Detector({ formats: ["qr_code"] });
          intervalId = setInterval(async () => {
            if (!videoRef.current || cancelled) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0) {
                onScan(codes[0].rawValue);
                onClose();
              }
            } catch {
              // ignore frame errors
            }
          }, 500);
        } else {
          setError(
            "Camera QR scanning not supported in this browser. Enter the code manually."
          );
        }
      } catch {
        setError("Camera access denied. Enter the QR code manually.");
      }
    }

    start();

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [onScan, onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">
      <div className="flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-2">
          <Camera className="h-5 w-5" />
          <span className="font-medium">Scan QR Code</span>
        </div>
        <button onClick={onClose} aria-label="Close scanner">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="relative w-full max-w-sm aspect-square rounded-2xl overflow-hidden border-4 border-white/30">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          {scanning && !error && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-48 h-48 border-2 border-brand-400 rounded-xl animate-pulse" />
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 text-center">
          <p className="text-white/80 text-sm mb-3">{error}</p>
          <Button variant="secondary" onClick={onClose}>
            Enter Manually
          </Button>
        </div>
      )}
    </div>
  );
}
