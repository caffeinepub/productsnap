import { Button } from "@/components/ui/button";
import {
  Camera,
  Check,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  Sun,
  Upload,
  Wand2,
  ZoomIn,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalBlob } from "../../blob-storage/ExternalBlob";
import { useCamera } from "../../camera/useCamera";

type Phase =
  | "capture"
  | "processing"
  | "confirm-removal"
  | "background"
  | "shadow"
  | "uploading"
  | "done";
type ShadowType = "none" | "soft" | "hard" | "bottom";

const BACKGROUNDS = [
  { name: "White Studio", color: "#ffffff", gradient: null },
  { name: "Light Gray", color: "#f0f0f0", gradient: null },
  {
    name: "Warm Gradient",
    color: null,
    gradient: "linear-gradient(135deg, #ffecd2, #fcb69f)",
  },
  {
    name: "Cool Blue",
    color: null,
    gradient: "linear-gradient(135deg, #a8edea, #fed6e3)",
  },
  {
    name: "Outdoor Green",
    color: null,
    gradient: "linear-gradient(135deg, #d4edda, #a8e6cf)",
  },
  { name: "Dark Studio", color: "#1a1a2e", gradient: null },
  {
    name: "Soft Pink",
    color: null,
    gradient: "linear-gradient(135deg, #ffeef8, #f8c8e8)",
  },
  {
    name: "Golden Hour",
    color: null,
    gradient: "linear-gradient(135deg, #f6d365, #fda085)",
  },
];

const SHADOW_OPTIONS: { key: ShadowType; label: string }[] = [
  { key: "none", label: "None" },
  { key: "soft", label: "Soft" },
  { key: "hard", label: "Hard" },
  { key: "bottom", label: "Bottom" },
];

function getShadowStyle(shadow: ShadowType): string {
  switch (shadow) {
    case "soft":
      return "drop-shadow(0 8px 24px rgba(0,0,0,0.25))";
    case "hard":
      return "drop-shadow(4px 8px 4px rgba(0,0,0,0.6))";
    case "bottom":
      return "drop-shadow(0 16px 8px rgba(0,0,0,0.35))";
    default:
      return "none";
  }
}

async function compositeImageToAvif(
  imageUrl: string,
  bgIndex: number,
  shadow: ShadowType,
): Promise<{ blob: Blob; sizeKb: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      const bg = BACKGROUNDS[bgIndex];
      if (bg.gradient) {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = canvas.width;
        tempCanvas.height = canvas.height;
        const tCtx = tempCanvas.getContext("2d");
        if (tCtx) {
          const grad = tCtx.createLinearGradient(
            0,
            0,
            canvas.width,
            canvas.height,
          );
          const colorMatches = bg.gradient.match(/#[a-fA-F0-9]{6}/g);
          if (colorMatches && colorMatches.length >= 2) {
            grad.addColorStop(0, colorMatches[0]);
            grad.addColorStop(1, colorMatches[1]);
          }
          tCtx.fillStyle = grad;
          tCtx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(tempCanvas, 0, 0);
        }
      } else {
        ctx.fillStyle = bg.color ?? "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      if (shadow !== "none") {
        const params = {
          soft: { blur: 24, offsetX: 0, offsetY: 8, opacity: 0.25 },
          hard: { blur: 4, offsetX: 4, offsetY: 8, opacity: 0.6 },
          bottom: { blur: 8, offsetX: 0, offsetY: 16, opacity: 0.35 },
        }[shadow];
        ctx.shadowBlur = params.blur;
        ctx.shadowOffsetX = params.offsetX;
        ctx.shadowOffsetY = params.offsetY;
        ctx.shadowColor = `rgba(0,0,0,${params.opacity})`;
      }

      ctx.drawImage(img, 0, 0);
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
      ctx.shadowColor = "transparent";

      const tryEncode = (format: string, quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error("Failed to encode"));
              return;
            }
            const sizeKb = blob.size / 1024;
            if (sizeKb > 250 && quality > 0.3) {
              tryEncode(format, Math.max(0.3, quality - 0.15));
            } else {
              resolve({ blob, sizeKb: Math.round(sizeKb) });
            }
          },
          format,
          quality,
        );
      };

      const supportsAvif = canvas
        .toDataURL("image/avif")
        .startsWith("data:image/avif");
      if (supportsAvif) {
        tryEncode("image/avif", 0.7);
      } else {
        tryEncode("image/webp", 0.8);
      }
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
}

interface StepImageProps {
  capturedImageUrls: string[];
  onUpdate: (urls: string[]) => void;
}

export function StepImage({ capturedImageUrls, onUpdate }: StepImageProps) {
  const [phase, setPhase] = useState<Phase>("capture");
  const [capturedObjectUrl, setCapturedObjectUrl] = useState<string | null>(
    null,
  );
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [selectedBg, setSelectedBg] = useState(0);
  const [selectedShadow, setSelectedShadow] = useState<ShadowType>("none");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastSizeKb, setLastSizeKb] = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [nativeZoomSupported, setNativeZoomSupported] = useState<
    boolean | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isActive,
    isLoading,
    isSupported,
    error,
    startCamera,
    stopCamera,
    capturePhoto,
    switchCamera,
    videoRef,
    canvasRef,
  } = useCamera({
    facingMode: "environment",
    quality: 0.95,
    format: "image/jpeg",
  });

  const handleStartCamera = async () => {
    setShowCamera(true);
    setZoomLevel(1);
    await startCamera();
    // After camera starts, check native zoom support
    setTimeout(() => {
      if (videoRef.current) {
        const stream = (videoRef.current as HTMLVideoElement)
          .srcObject as MediaStream | null;
        if (stream) {
          const track = stream.getVideoTracks()[0];
          if (track) {
            const caps = track.getCapabilities() as Record<string, unknown>;
            setNativeZoomSupported("zoom" in caps);
          }
        }
      }
    }, 800);
  };

  const handleZoomChange = async (value: number) => {
    setZoomLevel(value);
    if (videoRef.current) {
      const stream = (videoRef.current as HTMLVideoElement)
        .srcObject as MediaStream | null;
      if (stream) {
        const track = stream.getVideoTracks()[0];
        if (track && nativeZoomSupported) {
          try {
            await track.applyConstraints({
              advanced: [{ zoom: value } as MediaTrackConstraintSet],
            });
            return;
          } catch {
            // fall through to CSS zoom
          }
        }
      }
    }
  };

  const handleCapturePhoto = async () => {
    const file = await capturePhoto();
    if (!file) return;
    await stopCamera();
    setShowCamera(false);
    setZoomLevel(1);
    processFile(file);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const processFile = useCallback(async (file: File) => {
    const objectUrl = URL.createObjectURL(file);
    setCapturedObjectUrl(objectUrl);
    setProcessedUrl(objectUrl);
    setPhase("processing");
    try {
      const { removeBackground } = await import("@imgly/background-removal");
      const resultBlob = await removeBackground(file, {
        publicPath:
          "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/dist/",
      });
      const resultUrl = URL.createObjectURL(resultBlob);
      setProcessedUrl(resultUrl);
      setPhase("confirm-removal");
    } catch {
      toast.info("Background removal unavailable \u2014 using original image.");
      setPhase("background");
    }
  }, []);

  const handleConvertAndUpload = async () => {
    if (!processedUrl) return;
    setPhase("uploading");
    setUploadProgress(0);
    try {
      const { blob, sizeKb } = await compositeImageToAvif(
        processedUrl,
        selectedBg,
        selectedShadow,
      );
      setLastSizeKb(sizeKb);
      const bytes = new Uint8Array(await blob.arrayBuffer());
      const externalBlob = ExternalBlob.fromBytes(bytes).withUploadProgress(
        (pct) => setUploadProgress(pct),
      );
      const url = externalBlob.getDirectURL();
      onUpdate([...capturedImageUrls, url]);
      setPhase("done");
    } catch {
      toast.error("Upload failed. Please try again.");
      setPhase("shadow");
    }
  };

  const handleAddAnother = () => {
    if (capturedObjectUrl) URL.revokeObjectURL(capturedObjectUrl);
    if (processedUrl && processedUrl !== capturedObjectUrl)
      URL.revokeObjectURL(processedUrl);
    setCapturedObjectUrl(null);
    setProcessedUrl(null);
    setSelectedBg(0);
    setSelectedShadow("none");
    setLastSizeKb(null);
    setUploadProgress(0);
    setPhase("capture");
  };

  // CSS zoom scale (used when native zoom not supported)
  const cssZoomScale = nativeZoomSupported === false ? zoomLevel : 1;

  return (
    <div className="flex flex-col h-full px-4 gap-4 overflow-y-auto pb-2">
      <motion.div
        className="text-center pt-4"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h1 className="text-2xl font-display font-700 tracking-tight">
          Capture Image
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          {capturedImageUrls.length > 0
            ? `${capturedImageUrls.length} image${
                capturedImageUrls.length > 1 ? "s" : ""
              } added`
            : "Take or upload a product photo"}
        </p>
      </motion.div>

      <AnimatePresence mode="wait">
        {phase === "capture" && (
          <motion.div
            key="capture"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col gap-4"
          >
            {showCamera ? (
              <div className="flex flex-col gap-3">
                <div
                  data-ocid="image.canvas_target"
                  className="relative w-full rounded-2xl overflow-hidden bg-black"
                  style={{ aspectRatio: "4/3", minHeight: 240 }}
                >
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className="w-full h-full object-cover transition-transform duration-200"
                    style={{
                      transform: `scale(${cssZoomScale})`,
                      transformOrigin: "center",
                    }}
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {isLoading && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/70">
                      <Loader2 className="w-8 h-8 animate-spin text-primary" />
                    </div>
                  )}
                  {error && (
                    <div className="absolute inset-0 flex items-center justify-center bg-background/90">
                      <p className="text-sm text-destructive text-center px-4">
                        {error.message}
                      </p>
                    </div>
                  )}
                </div>

                {/* Zoom slider */}
                <div className="flex items-center gap-3 px-1">
                  <ZoomIn className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <input
                    type="range"
                    min={1}
                    max={3}
                    step={0.1}
                    value={zoomLevel}
                    onChange={(e) => handleZoomChange(Number(e.target.value))}
                    className="flex-1 h-1.5 accent-primary cursor-pointer"
                    aria-label="Zoom"
                  />
                  <span className="text-xs text-muted-foreground w-8 text-right">
                    {zoomLevel.toFixed(1)}×
                  </span>
                </div>

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    className="flex-1 h-12"
                    onClick={() => {
                      stopCamera();
                      setShowCamera(false);
                      setZoomLevel(1);
                    }}
                  >
                    Cancel
                  </Button>
                  {isSupported && (
                    <Button
                      variant="outline"
                      size="icon"
                      className="h-12 w-12"
                      onClick={() => switchCamera()}
                      disabled={isLoading || !isActive}
                    >
                      <Camera className="w-4 h-4" />
                    </Button>
                  )}
                  <Button
                    className="flex-1 h-12 bg-primary text-primary-foreground font-600"
                    onClick={handleCapturePhoto}
                    disabled={!isActive || isLoading}
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    Capture
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="w-full rounded-2xl border-2 border-dashed border-border bg-card/50 flex flex-col items-center justify-center gap-3 py-10 hover:border-primary/50 hover:bg-primary/5 transition-all disabled:opacity-50"
                  onClick={handleStartCamera}
                  disabled={isSupported === false}
                >
                  <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                    <Camera className="w-7 h-7 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-display font-600 text-foreground">
                      Take a Photo
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Use your camera
                    </p>
                  </div>
                </button>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center">
                    <span className="bg-background px-3 text-xs text-muted-foreground">
                      or
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  data-ocid="image.upload_button"
                  className="w-full rounded-2xl border border-border bg-card flex items-center gap-4 px-5 py-4 hover:border-primary/40 hover:bg-primary/5 transition-all"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <div className="w-10 h-10 rounded-xl bg-secondary flex items-center justify-center flex-shrink-0">
                    <Upload className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div className="text-left">
                    <p className="font-600 text-sm text-foreground">
                      Upload from device
                    </p>
                    <p className="text-xs text-muted-foreground">
                      JPG, PNG, WebP supported
                    </p>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileUpload}
                />
              </div>
            )}
            {capturedImageUrls.length > 0 && (
              <div className="rounded-xl bg-card border border-border p-3">
                <p className="text-xs text-muted-foreground mb-2 font-500">
                  Added URLs
                </p>
                <p className="text-xs text-primary break-all font-mono">
                  {capturedImageUrls.join(";")}
                </p>
              </div>
            )}
          </motion.div>
        )}

        {phase === "processing" && (
          <motion.div
            key="processing"
            data-ocid="image.loading_state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-5 py-10"
          >
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
                <Wand2 className="w-8 h-8 text-primary" />
              </div>
              <Loader2 className="w-6 h-6 text-primary animate-spin absolute -bottom-1 -right-1" />
            </div>
            <div className="text-center">
              <p className="font-display font-700 text-lg">
                Removing Background
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                AI is isolating your product...
              </p>
            </div>
            {capturedObjectUrl && (
              <img
                src={capturedObjectUrl}
                alt="Original"
                className="w-32 h-32 object-contain rounded-xl border border-border opacity-50"
              />
            )}
          </motion.div>
        )}

        {phase === "confirm-removal" && (
          <motion.div
            key="confirm-removal"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col gap-5"
          >
            <div className="text-center">
              <div className="inline-flex items-center gap-1.5 bg-primary/10 text-primary text-xs font-600 px-3 py-1 rounded-full mb-2">
                <Wand2 className="w-3 h-3" />
                Background Removed
              </div>
              <p className="text-sm text-muted-foreground">
                Choose which version to use
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <div
                  className="rounded-xl overflow-hidden border-2 border-border bg-card flex items-center justify-center"
                  style={{ aspectRatio: "1", minHeight: 130 }}
                >
                  {capturedObjectUrl && (
                    <img
                      src={capturedObjectUrl}
                      alt="Original"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
                <p className="text-xs font-600 text-center text-muted-foreground">
                  Original
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <div
                  className="rounded-xl overflow-hidden border-2 border-primary/60 flex items-center justify-center"
                  style={{
                    aspectRatio: "1",
                    minHeight: 130,
                    backgroundImage:
                      "repeating-conic-gradient(#e5e7eb 0% 25%, #fff 0% 50%)",
                    backgroundSize: "16px 16px",
                  }}
                >
                  {processedUrl && (
                    <img
                      src={processedUrl}
                      alt="Background Removed"
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>
                <p className="text-xs font-600 text-center text-primary">
                  Removed
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button
                data-ocid="image.secondary_button"
                variant="outline"
                className="flex-1 h-12"
                onClick={() => {
                  if (capturedObjectUrl) setProcessedUrl(capturedObjectUrl);
                  setPhase("shadow");
                }}
              >
                Skip / Keep Original
              </Button>
              <Button
                data-ocid="image.primary_button"
                className="flex-1 h-12 bg-primary text-primary-foreground font-600"
                onClick={() => setPhase("background")}
              >
                <Wand2 className="w-4 h-4 mr-2" />
                Use Removed
              </Button>
            </div>
          </motion.div>
        )}

        {phase === "background" && (
          <motion.div
            key="background"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col gap-4"
          >
            {processedUrl && (
              <div
                data-ocid="image.canvas_target"
                className="relative w-full rounded-2xl overflow-hidden flex items-center justify-center"
                style={{
                  background:
                    BACKGROUNDS[selectedBg].gradient ??
                    BACKGROUNDS[selectedBg].color ??
                    "#fff",
                  minHeight: 200,
                }}
              >
                <img
                  src={processedUrl}
                  alt="Product"
                  className="max-h-48 w-auto object-contain"
                  style={{ filter: getShadowStyle(selectedShadow) }}
                />
              </div>
            )}
            <div>
              <p className="text-xs font-600 text-muted-foreground mb-2 uppercase tracking-wider">
                Choose Background
              </p>
              <div className="grid grid-cols-4 gap-2">
                {BACKGROUNDS.map((bg, i) => (
                  <button
                    type="button"
                    key={bg.name}
                    onClick={() => setSelectedBg(i)}
                    className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                      selectedBg === i ? "border-primary" : "border-border"
                    }`}
                    style={{ aspectRatio: "1" }}
                  >
                    <div
                      className="w-full h-full"
                      style={{ background: bg.gradient ?? bg.color ?? "#fff" }}
                    />
                    {selectedBg === i && (
                      <div className="absolute inset-0 flex items-center justify-center bg-primary/20">
                        <Check className="w-4 h-4 text-primary" />
                      </div>
                    )}
                    <p className="absolute bottom-0 left-0 right-0 text-[8px] font-600 text-center py-0.5 bg-black/40 text-white leading-tight">
                      {bg.name}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full h-12 bg-primary text-primary-foreground font-600"
              onClick={() => setPhase("shadow")}
            >
              <Sun className="w-4 h-4 mr-2" />
              Next: Shadows
            </Button>
          </motion.div>
        )}

        {phase === "shadow" && (
          <motion.div
            key="shadow"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col gap-4"
          >
            {processedUrl && (
              <div
                className="relative w-full rounded-2xl overflow-hidden flex items-center justify-center"
                style={{
                  background:
                    BACKGROUNDS[selectedBg].gradient ??
                    BACKGROUNDS[selectedBg].color ??
                    "#fff",
                  minHeight: 200,
                }}
              >
                <img
                  src={processedUrl}
                  alt="Product"
                  className="max-h-48 w-auto object-contain transition-all"
                  style={{ filter: getShadowStyle(selectedShadow) }}
                />
              </div>
            )}
            <div>
              <p className="text-xs font-600 text-muted-foreground mb-2 uppercase tracking-wider">
                Shadow Effect
              </p>
              <div className="grid grid-cols-4 gap-2">
                {SHADOW_OPTIONS.map((opt) => (
                  <button
                    type="button"
                    key={opt.key}
                    data-ocid="image.toggle"
                    onClick={() => setSelectedShadow(opt.key)}
                    className={`py-3 rounded-xl text-sm font-600 border-2 transition-all ${
                      selectedShadow === opt.key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border bg-card text-muted-foreground hover:border-primary/40"
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <Button
              className="w-full h-12 bg-primary text-primary-foreground font-600"
              onClick={handleConvertAndUpload}
            >
              <Layers className="w-4 h-4 mr-2" />
              Convert &amp; Upload
            </Button>
          </motion.div>
        )}

        {phase === "uploading" && (
          <motion.div
            key="uploading"
            data-ocid="image.loading_state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-5 py-10"
          >
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center relative">
              <ImageIcon className="w-8 h-8 text-primary" />
              <svg
                aria-hidden="true"
                className="absolute inset-0 w-full h-full -rotate-90"
                viewBox="0 0 80 80"
              >
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="oklch(0.26 0.03 245)"
                  strokeWidth="4"
                />
                <circle
                  cx="40"
                  cy="40"
                  r="36"
                  fill="none"
                  stroke="oklch(0.78 0.18 72)"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeDasharray={`${(uploadProgress / 100) * 226} 226`}
                  style={{ transition: "stroke-dasharray 0.3s ease" }}
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-display font-700 text-lg">
                Converting &amp; Uploading
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {uploadProgress}% complete
              </p>
            </div>
          </motion.div>
        )}

        {phase === "done" && (
          <motion.div
            key="done"
            data-ocid="image.success_state"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col gap-4"
          >
            <div className="flex flex-col items-center gap-3 py-4">
              <div className="w-16 h-16 rounded-full bg-primary flex items-center justify-center">
                <Check className="w-8 h-8 text-primary-foreground" />
              </div>
              <div className="text-center">
                <p className="font-display font-700 text-lg">Image Added!</p>
                {lastSizeKb !== null && (
                  <p className="text-sm text-muted-foreground mt-1">
                    File size:{" "}
                    <span className="text-primary font-600">
                      {lastSizeKb} KB
                    </span>
                    {lastSizeKb <= 100
                      ? " ✓ Optimal"
                      : lastSizeKb <= 250
                        ? " ✓ Good"
                        : " ⚠ Large"}
                  </p>
                )}
              </div>
            </div>
            <div className="rounded-xl bg-card border border-border p-4">
              <p className="text-xs font-600 text-muted-foreground mb-2">
                {capturedImageUrls.length} image URL
                {capturedImageUrls.length > 1 ? "s" : ""}
              </p>
              <p className="text-xs text-primary break-all font-mono leading-relaxed">
                {capturedImageUrls.join(";\n")}
              </p>
            </div>
            <Button
              data-ocid="image.primary_button"
              variant="outline"
              className="w-full h-12 border-primary/40 text-primary hover:bg-primary/10"
              onClick={handleAddAnother}
            >
              <Plus className="w-4 h-4 mr-2" />
              Add Another Image
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
