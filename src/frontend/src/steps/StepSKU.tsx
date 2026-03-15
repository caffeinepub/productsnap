import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Hash, ScanBarcode, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

interface StepSKUProps {
  value: string;
  onChange: (v: string) => void;
}

declare class BarcodeDetector {
  constructor(options?: { formats?: string[] });
  detect(
    image: HTMLVideoElement | HTMLCanvasElement | ImageBitmap,
  ): Promise<Array<{ rawValue: string; format: string }>>;
  static getSupportedFormats(): Promise<string[]>;
}

export function StepSKU({ value, onChange }: StepSKUProps) {
  const [focused, setFocused] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectorRef = useRef<BarcodeDetector | null>(null);

  const stopScanner = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (streamRef.current) {
      for (const t of streamRef.current.getTracks()) {
        t.stop();
      }
      streamRef.current = null;
    }
    setScanning(false);
  }, []);

  useEffect(() => {
    return () => stopScanner();
  }, [stopScanner]);

  const handleStartScan = async () => {
    setScanError(null);
    if (typeof BarcodeDetector === "undefined") {
      setScanError(
        "Barcode scanning not supported on this device. Please type manually.",
      );
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setScanning(true);

      // Wait for video to mount before assigning stream
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => {});
        }
      }, 100);

      detectorRef.current = new BarcodeDetector({
        formats: [
          "ean_13",
          "ean_8",
          "code_128",
          "code_39",
          "qr_code",
          "upc_a",
          "upc_e",
          "itf",
        ],
      });

      pollRef.current = setInterval(async () => {
        if (!videoRef.current || !detectorRef.current) return;
        if (videoRef.current.readyState < 2) return;
        try {
          const barcodes = await detectorRef.current.detect(videoRef.current);
          if (barcodes.length > 0) {
            const raw = barcodes[0].rawValue;
            onChange(raw);
            stopScanner();
            toast.success(`Barcode scanned: ${raw}`);
          }
        } catch {
          // ignore per-frame errors
        }
      }, 300);
    } catch {
      setScanError("Camera access denied. Please allow camera permissions.");
    }
  };

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-8 gap-8 min-h-full justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <ScanBarcode className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Product SKU
        </h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Enter the SKU or barcode for this product. You can skip this if you
          don&apos;t have one.
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        <div className="relative">
          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            data-ocid="sku.input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="e.g. 123456789"
            className={`pl-12 h-14 text-lg bg-card border-border transition-all duration-200 ${focused ? "border-primary" : ""}`}
            autoComplete="off"
            autoCapitalize="off"
            inputMode="numeric"
          />
        </div>

        <Button
          data-ocid="sku.secondary_button"
          variant="outline"
          className="w-full h-12 gap-2 border-primary/40 text-primary hover:bg-primary/10"
          onClick={handleStartScan}
          type="button"
        >
          <ScanBarcode className="w-5 h-5" />
          Scan Barcode
        </Button>

        {scanError && (
          <p className="text-sm text-destructive text-center px-2">
            {scanError}
          </p>
        )}
      </div>

      {value && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm font-medium text-primary">{value}</span>
        </div>
      )}

      {/* Barcode scanner overlay */}
      {scanning && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/85">
          <div className="relative w-full max-w-sm mx-4">
            <div
              className="relative rounded-2xl overflow-hidden bg-black"
              style={{ aspectRatio: "4/3" }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full h-full object-cover"
              />
              {/* Scan guide frame */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div
                  className="border-2 border-white rounded-lg"
                  style={{
                    width: "70%",
                    height: "40%",
                    boxShadow: "0 0 0 9999px rgba(0,0,0,0.45)",
                  }}
                />
              </div>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center">
                <span className="text-white text-sm font-medium bg-black/50 px-3 py-1 rounded-full">
                  Scanning...
                </span>
              </div>
            </div>

            <p className="text-white/70 text-sm text-center mt-3">
              Align the barcode within the frame
            </p>
          </div>

          <Button
            data-ocid="sku.cancel_button"
            variant="outline"
            className="mt-6 h-12 px-8 border-white/30 text-white hover:bg-white/10"
            onClick={stopScanner}
          >
            <X className="w-4 h-4 mr-2" />
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
