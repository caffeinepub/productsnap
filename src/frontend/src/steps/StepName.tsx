import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Camera,
  CheckCircle2,
  ImageIcon,
  Loader2,
  RefreshCw,
  ScanLine,
  Tag,
  X,
} from "lucide-react";
import { useRef, useState } from "react";
import { createWorker } from "tesseract.js";

interface StepNameProps {
  value: string;
  onChange: (v: string) => void;
  sku: string;
}

type ScanState = "idle" | "chooser" | "scanning" | "success" | "error";

function toTitleCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function stripFillerPhrases(text: string): string {
  return text
    .replace(
      /^(a photo of|an image of|a picture of|a close up of|a close-up of|this is a|this is an)\s+/i,
      "",
    )
    .trim();
}

function isMeaningfulText(text: string): boolean {
  const t = text.trim();
  if (t.length <= 3) return false;
  if (!/[a-zA-Z]/.test(t)) return false;
  // Require at least one word of 3+ consecutive letters (not random chars)
  const words = t.split(/\s+/).filter((w) => /^[a-zA-Z]{3,}$/.test(w));
  return words.length >= 1;
}

async function queryBLIPWithRetry(file: File, maxRetries = 3): Promise<string> {
  // Convert to blob to ensure proper binary transfer
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: file.type || "image/jpeg" });

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(
      "https://api-inference.huggingface.co/models/Salesforce/blip-image-captioning-large",
      {
        method: "POST",
        headers: { "Content-Type": blob.type },
        body: blob,
      },
    );

    if (response.status === 503) {
      // Model is loading, wait and retry
      await new Promise((r) => setTimeout(r, 8000));
      continue;
    }

    if (!response.ok) throw new Error(`HuggingFace error: ${response.status}`);

    const result = await response.json();
    const caption: string = Array.isArray(result)
      ? (result[0]?.generated_text ?? "")
      : (result?.generated_text ?? "");

    if (caption) return caption;
    throw new Error("No caption returned");
  }

  throw new Error("Model not ready after retries");
}

export function StepName({ value, onChange, sku }: StepNameProps) {
  const [focused, setFocused] = useState(false);
  const [scanState, setScanState] = useState<ScanState>("idle");
  const [scanStatus, setScanStatus] = useState("");
  const [scanResult, setScanResult] = useState("");
  const [autoFilled, setAutoFilled] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const slowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleScanClick = () => {
    setScanState("chooser");
  };

  const handleTakePhoto = () => {
    setScanState("idle");
    cameraInputRef.current?.click();
  };

  const handleChooseGallery = () => {
    setScanState("idle");
    galleryInputRef.current?.click();
  };

  const handleDismissChooser = () => {
    setScanState("idle");
  };

  const processFile = async (file: File) => {
    setScanState("scanning");
    setScanResult("");
    setScanStatus("Reading text from image...");

    try {
      // Step 1: OCR with confidence threshold
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(file);
      await worker.terminate();

      const ocrText = data.text?.trim() ?? "";
      const ocrConfidence: number =
        (data as { confidence?: number }).confidence ?? 0;

      // Only trust OCR if confidence is high enough (>= 60) AND text is meaningful
      if (ocrConfidence >= 60 && isMeaningfulText(ocrText)) {
        const lines = ocrText
          .split("\n")
          .filter((l) => /^[a-zA-Z\s]{3,}$/.test(l.trim()));
        if (lines.length > 0) {
          const bestLine = lines.sort((a, b) => b.length - a.length)[0];
          const named = toTitleCase(bestLine.slice(0, 80));
          if (isMeaningfulText(named)) {
            setScanResult(named);
            setScanState("success");
            return;
          }
        }
      }

      // Step 2: AI image recognition via BLIP
      setScanStatus("Identifying product...");

      slowTimerRef.current = setTimeout(() => {
        setScanStatus("Analyzing image (first use may take ~15s)...");
      }, 3000);

      const caption = await queryBLIPWithRetry(file);

      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }

      const cleaned = toTitleCase(stripFillerPhrases(caption).slice(0, 80));

      if (!isMeaningfulText(cleaned)) throw new Error("Caption not useful");

      setScanResult(cleaned);
      setScanState("success");
    } catch {
      if (slowTimerRef.current) {
        clearTimeout(slowTimerRef.current);
        slowTimerRef.current = null;
      }
      setScanState("error");
      setScanStatus(
        "Could not detect text or recognize image. Please type the name manually.",
      );
    }
  };

  const handleCameraFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (!file) return;
    await processFile(file);
  };

  const handleGalleryFileSelected = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (galleryInputRef.current) galleryInputRef.current.value = "";
    if (!file) return;
    await processFile(file);
  };

  const handleUseThisName = () => {
    onChange(scanResult);
    setAutoFilled(true);
    setScanState("idle");
    setScanResult("");
  };

  const handleRescan = () => {
    setScanState("chooser");
    setScanResult("");
  };

  const handleDismissError = () => {
    setScanState("idle");
    setScanStatus("");
  };

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-8 gap-8 min-h-full justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Tag className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Product Name
        </h1>
        {sku && (
          <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
            SKU: {sku}
          </span>
        )}
        <p className="text-muted-foreground text-sm max-w-xs">
          What is this product called? This will be used to search for images
          online.
        </p>
      </div>

      <div className="w-full max-w-sm flex flex-col gap-3">
        <div className="relative">
          <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            data-ocid="name.input"
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              if (autoFilled) setAutoFilled(false);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="e.g. Wireless Bluetooth Speaker"
            className={`pl-12 h-14 text-lg bg-card border-border transition-all duration-200 ${focused ? "border-primary" : ""}`}
            autoComplete="off"
            inputMode="text"
          />
          {autoFilled && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold bg-primary/10 text-primary px-2 py-0.5 rounded-full border border-primary/20">
              Auto-filled
            </span>
          )}
        </div>

        {/* Scan Image Button */}
        <Button
          data-ocid="name.scan_image_button"
          variant="outline"
          className="w-full h-11 gap-2 border-dashed border-border text-muted-foreground hover:text-foreground hover:border-primary/50 transition-all"
          onClick={handleScanClick}
          disabled={scanState === "scanning"}
          type="button"
        >
          <ScanLine className="w-4 h-4" />
          Scan Image for Name
        </Button>

        {/* Camera file input (directly invokes camera) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handleCameraFileSelected}
        />

        {/* Gallery file input (opens photo library) */}
        <input
          ref={galleryInputRef}
          data-ocid="name.upload_button"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handleGalleryFileSelected}
        />

        {/* Source chooser */}
        {scanState === "chooser" && (
          <div
            data-ocid="name.dialog"
            className="flex flex-col gap-2 px-4 py-4 rounded-xl bg-card border border-border shadow-sm"
          >
            <p className="text-sm font-medium text-foreground text-center mb-1">
              Choose image source
            </p>
            <Button
              data-ocid="name.camera_button"
              variant="outline"
              className="w-full h-11 gap-2"
              onClick={handleTakePhoto}
              type="button"
            >
              <Camera className="w-4 h-4" />
              Take Photo
            </Button>
            <Button
              data-ocid="name.gallery_button"
              variant="outline"
              className="w-full h-11 gap-2"
              onClick={handleChooseGallery}
              type="button"
            >
              <ImageIcon className="w-4 h-4" />
              Choose from Gallery
            </Button>
            <button
              type="button"
              onClick={handleDismissChooser}
              className="text-xs text-muted-foreground hover:text-foreground text-center mt-1 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}

        {/* Scanning spinner */}
        {scanState === "scanning" && (
          <div
            data-ocid="name.loading_state"
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-muted/50 border border-border"
          >
            <Loader2 className="w-5 h-5 text-primary animate-spin flex-shrink-0" />
            <span className="text-sm text-muted-foreground">{scanStatus}</span>
          </div>
        )}

        {/* Success card */}
        {scanState === "success" && scanResult && (
          <div
            data-ocid="name.success_state"
            className="flex flex-col gap-3 px-4 py-4 rounded-xl bg-card border border-primary/20 shadow-sm"
          >
            <div className="flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
              <div className="flex flex-col gap-0.5">
                <span className="text-xs text-muted-foreground">
                  Suggested name
                </span>
                <span className="text-base font-semibold text-foreground leading-tight">
                  {scanResult}
                </span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 h-9 text-sm"
                onClick={handleUseThisName}
                type="button"
              >
                Use This Name
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3 text-sm gap-1"
                onClick={handleRescan}
                type="button"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Re-scan
              </Button>
            </div>
          </div>
        )}

        {/* Error state */}
        {scanState === "error" && (
          <div
            data-ocid="name.error_state"
            className="flex items-start gap-3 px-4 py-3 rounded-xl bg-destructive/10 border border-destructive/20"
          >
            <span className="text-sm text-destructive flex-1">
              {scanStatus}
            </span>
            <button
              type="button"
              onClick={handleDismissError}
              className="text-destructive/60 hover:text-destructive transition-colors flex-shrink-0 mt-0.5"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {value && (
        <div className="px-4 py-2 rounded-xl bg-card border border-border text-center">
          <span className="text-base font-semibold text-foreground">
            {value}
          </span>
        </div>
      )}
    </div>
  );
}
