import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Camera,
  Check,
  Cloud,
  HardDrive,
  ImageIcon,
  Layers,
  Loader2,
  Plus,
  Sun,
  Upload,
  X,
  ZoomIn,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { ExternalBlob } from "../../blob-storage/ExternalBlob";
import { useCamera } from "../../camera/useCamera";
import type { backendInterface } from "../backend";

type Phase =
  | "capture"
  | "removing"
  | "bgcompare"
  | "background"
  | "shadow"
  | "uploading"
  | "done";
type ShadowType = "none" | "soft" | "hard" | "bottom";

interface CloudflareActor extends backendInterface {
  uploadImageToCloudflare(imageData: Uint8Array): Promise<string>;
}

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

async function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  const response = await fetch(blobUrl);
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * Canvas-based background removal using flood-fill from image corners.
 * Works reliably in all browsers without external dependencies.
 * Best for product photos with uniform/light backgrounds.
 */
async function removeBackgroundCanvas(imageDataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth;
      const h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas not supported"));
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, w, h);
      const data = imageData.data;

      // Sample background color from corners and edges
      const samplePixels = [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
        [Math.floor(w / 2), 0],
        [0, Math.floor(h / 2)],
        [w - 1, Math.floor(h / 2)],
        [Math.floor(w / 2), h - 1],
      ];
      let bgR = 0;
      let bgG = 0;
      let bgB = 0;
      for (const [x, y] of samplePixels) {
        const idx = (y * w + x) * 4;
        bgR += data[idx];
        bgG += data[idx + 1];
        bgB += data[idx + 2];
      }
      bgR = bgR / samplePixels.length;
      bgG = bgG / samplePixels.length;
      bgB = bgB / samplePixels.length;

      // Flood fill from all corners with tolerance
      const tolerance = 40;
      const visited = new Uint8Array(w * h);
      const stack: number[] = [];

      // Push all corner/edge seed pixels
      for (const [sx, sy] of [
        [0, 0],
        [w - 1, 0],
        [0, h - 1],
        [w - 1, h - 1],
      ]) {
        const seedIdx = sy * w + sx;
        if (!visited[seedIdx]) {
          visited[seedIdx] = 1;
          stack.push(seedIdx);
        }
      }

      while (stack.length > 0) {
        const pixIdx = stack.pop()!;
        const x = pixIdx % w;
        const y = Math.floor(pixIdx / w);
        const dataIdx = pixIdx * 4;

        const r = data[dataIdx];
        const g = data[dataIdx + 1];
        const b = data[dataIdx + 2];
        const diff = Math.sqrt(
          (r - bgR) ** 2 + (g - bgG) ** 2 + (b - bgB) ** 2,
        );

        if (diff > tolerance) continue;

        // Make transparent
        data[dataIdx + 3] = 0;

        const neighbors = [
          x > 0 ? pixIdx - 1 : -1,
          x < w - 1 ? pixIdx + 1 : -1,
          y > 0 ? pixIdx - w : -1,
          y < h - 1 ? pixIdx + w : -1,
        ];
        for (const n of neighbors) {
          if (n >= 0 && !visited[n]) {
            visited[n] = 1;
            stack.push(n);
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = imageDataUrl;
  });
}

/**
 * AI-based background removal using HuggingFace RMBG-1.4 model.
 * Falls back to canvas method on any failure.
 */
async function removeBackgroundAI(imageDataUrl: string): Promise<string> {
  const { AutoModel, AutoProcessor, RawImage, env } = await import(
    "@huggingface/transformers"
  );

  (env as Record<string, unknown>).allowLocalModels = false;
  if ((env as Record<string, unknown>).backends) {
    const backends = (env as Record<string, unknown>).backends as Record<
      string,
      unknown
    >;
    if (backends.onnx) {
      (backends.onnx as Record<string, unknown>).wasm = {
        ...((backends.onnx as Record<string, unknown>).wasm as object),
        numThreads: 1,
      };
    }
  }

  const model = await AutoModel.from_pretrained("briaai/RMBG-1.4", {
    config: { model_type: "custom" } as never,
  });
  const processor = await AutoProcessor.from_pretrained("briaai/RMBG-1.4", {
    config: {
      do_normalize: true,
      do_pad: false,
      do_rescale: true,
      do_resize: true,
      image_mean: [0.5, 0.5, 0.5],
      feature_extractor_type: "ImageFeatureExtractor",
      image_std: [1, 1, 1],
      resample: 2,
      rescale_factor: 0.00392156862745098,
      size: { width: 1024, height: 1024 },
    },
  });

  const image = await RawImage.fromURL(imageDataUrl);
  const inputs = await processor(image);
  const { output } = await model(inputs);

  const maskTensor = output[0].mul(255).to("uint8");
  const maskImage = await RawImage.fromTensor(maskTensor).resize(
    image.width,
    image.height,
  );
  const maskData = maskImage.data;

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = imageDataUrl;
  });
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < maskData.length; i++) {
    imgData.data[i * 4 + 3] = maskData[i];
  }
  ctx.putImageData(imgData, 0, 0);

  return canvas.toDataURL("image/png");
}

async function removeBackground(
  imageUrl: string,
  onStatus: (s: string) => void,
): Promise<string> {
  // Convert blob: URL to data URL first
  const dataUrl =
    imageUrl.startsWith("blob:") || imageUrl.startsWith("http")
      ? await blobUrlToDataUrl(imageUrl)
      : imageUrl;

  // Try AI model first
  try {
    onStatus("Loading AI model (~40 MB on first use)...");
    const result = await removeBackgroundAI(dataUrl);
    return result;
  } catch (aiErr) {
    console.warn("[BgRemoval] AI model failed, using canvas method:", aiErr);
    onStatus("AI model unavailable, using fast removal...");
    return removeBackgroundCanvas(dataUrl);
  }
}

async function compositeImageToAvif(
  imageUrl: string,
  bgIndex: number,
  shadow: ShadowType,
): Promise<{ blob: Blob; sizeKb: number; format: string }> {
  // Convert to data URL if needed
  const srcUrl =
    imageUrl.startsWith("blob:") || imageUrl.startsWith("http")
      ? await blobUrlToDataUrl(imageUrl)
      : imageUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
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

      // Try AVIF first; fall back to WebP if unsupported
      const tryEncode = (format: string, ext: string, quality: number) => {
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              if (format === "image/avif") {
                tryEncode("image/webp", "webp", 0.8);
              } else {
                reject(new Error("Failed to encode"));
              }
              return;
            }
            if (format === "image/avif" && blob.type !== "image/avif") {
              tryEncode("image/webp", "webp", 0.8);
              return;
            }
            const sizeKb = blob.size / 1024;
            if (sizeKb > 250 && quality > 0.3) {
              tryEncode(format, ext, Math.max(0.3, quality - 0.15));
            } else {
              resolve({ blob, sizeKb: Math.round(sizeKb), format: ext });
            }
          },
          format,
          quality,
        );
      };

      tryEncode("image/avif", "avif", 0.7);
    };
    img.onerror = reject;
    img.src = srcUrl;
  });
}

interface StepImageProps {
  capturedImageUrls: string[];
  onUpdate: (urls: string[]) => void;
  cloudflareConfigured?: boolean;
  actor?: backendInterface | null;
  onCloudflareConfigChange?: () => void;
}

export function StepImage({
  capturedImageUrls,
  onUpdate,
  cloudflareConfigured = false,
  actor = null,
}: StepImageProps) {
  const [phase, setPhase] = useState<Phase>("capture");
  const [capturedDataUrl, setCapturedDataUrl] = useState<string | null>(null);
  const [processedUrl, setProcessedUrl] = useState<string | null>(null);
  const [bgRemovedUrl, setBgRemovedUrl] = useState<string | null>(null);
  const [bgRemovalStatus, setBgRemovalStatus] = useState<string>("");
  const [selectedBg, setSelectedBg] = useState(0);
  const [selectedShadow, setSelectedShadow] = useState<ShadowType>("none");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lastSizeKb, setLastSizeKb] = useState<number | null>(null);
  const [showCamera, setShowCamera] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [nativeZoomSupported, setNativeZoomSupported] = useState<
    boolean | null
  >(null);
  const [usedCloudflare, setUsedCloudflare] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    isActive,
    isLoading,
    error,
    startCamera,
    stopCamera,
    capturePhoto,
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
    // Convert to data URL immediately so we have a stable, valid URL
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    setCapturedDataUrl(dataUrl);
    setProcessedUrl(dataUrl);
    setBgRemovedUrl(null);
    setPhase("removing");
    setBgRemovalStatus("Preparing...");

    try {
      const removedUrl = await removeBackground(dataUrl, setBgRemovalStatus);
      setBgRemovedUrl(removedUrl);
      setPhase("bgcompare");
    } catch {
      toast.info("Background removal unavailable — showing original image.");
      setPhase("background");
    }
  }, []);

  const handleUseRemoved = () => {
    if (bgRemovedUrl) {
      setProcessedUrl(bgRemovedUrl);
    }
    setPhase("background");
  };

  const handleKeepOriginal = () => {
    setPhase("background");
  };

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

      let url: string;

      if (cloudflareConfigured && actor) {
        // Upload via Cloudflare Images
        const jsonResponse = await (
          actor as CloudflareActor
        ).uploadImageToCloudflare(bytes);
        const data = JSON.parse(jsonResponse);
        if (data.success && data.result?.variants?.length > 0) {
          // Use Cloudflare URL directly — it serves the image from CDN
          // The variant URL is a valid https:// link openable in any browser
          url = data.result.variants[0] as string;
          setUsedCloudflare(true);
        } else {
          throw new Error(
            (data.errors?.[0]?.message as string) || "Cloudflare upload failed",
          );
        }
      } else {
        // Fallback: use ExternalBlob (Caffeine blob storage)
        const externalBlob = ExternalBlob.fromBytes(bytes).withUploadProgress(
          (pct) => setUploadProgress(pct),
        );
        // getDirectURL() uploads to Caffeine storage and returns a valid https:// URL
        url = externalBlob.getDirectURL();
        setUsedCloudflare(false);
      }

      onUpdate([...capturedImageUrls, url]);
      setPhase("done");
    } catch (err) {
      console.error("[Upload] Failed:", err);
      toast.error(
        err instanceof Error ? err.message : "Upload failed. Please try again.",
      );
      setPhase("shadow");
    }
  };

  const handleAddAnother = () => {
    setCapturedDataUrl(null);
    setProcessedUrl(null);
    setBgRemovedUrl(null);
    setSelectedBg(0);
    setSelectedShadow("none");
    setLastSizeKb(null);
    setUploadProgress(0);
    setUsedCloudflare(null);
    setPhase("capture");
  };

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
        <div className="flex items-center justify-center gap-2 mt-1">
          <p className="text-sm text-muted-foreground">
            {capturedImageUrls.length > 0
              ? `${capturedImageUrls.length} image${
                  capturedImageUrls.length > 1 ? "s" : ""
                } added`
              : "Take or upload a product photo"}
          </p>
          {cloudflareConfigured && (
            <Badge
              variant="outline"
              className="text-orange-600 border-orange-300 bg-orange-50 gap-1 text-[10px] py-0"
            >
              <Cloud className="w-2.5 h-2.5" />
              Cloudflare
            </Badge>
          )}
        </div>
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
                  <Button
                    className="flex-1 h-12 bg-primary text-primary-foreground font-600"
                    onClick={handleCapturePhoto}
                    disabled={!isActive || isLoading}
                  >
                    Capture
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  className="w-full rounded-2xl border-2 border-dashed border-border bg-card/50 flex flex-col items-center justify-center gap-3 py-10 hover:border-primary/50 hover:bg-primary/5 transition-all"
                  onClick={handleStartCamera}
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

        {phase === "removing" && (
          <motion.div
            key="removing"
            data-ocid="image.loading_state"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center gap-5 py-10"
          >
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <p className="font-display font-700 text-lg">
                Removing Background
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {bgRemovalStatus}
              </p>
            </div>
          </motion.div>
        )}

        {phase === "bgcompare" && capturedDataUrl && bgRemovedUrl && (
          <motion.div
            key="bgcompare"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex flex-col gap-4"
          >
            <p className="text-sm font-600 text-center text-muted-foreground">
              Background removed — which version would you like to use?
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-2">
                <div
                  className="w-full rounded-xl overflow-hidden flex items-center justify-center"
                  style={{
                    background:
                      "repeating-conic-gradient(#e5e7eb 0% 25%, #f9fafb 0% 50%) 0 0 / 16px 16px",
                    minHeight: 140,
                  }}
                >
                  <img
                    src={bgRemovedUrl}
                    alt="Background removed"
                    className="max-h-36 w-auto object-contain"
                  />
                </div>
                <Button
                  data-ocid="image.primary_button"
                  className="w-full h-10 bg-primary text-primary-foreground font-600"
                  onClick={handleUseRemoved}
                >
                  <Check className="w-4 h-4 mr-1.5" />
                  Use Removed
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <div
                  className="w-full rounded-xl overflow-hidden flex items-center justify-center bg-muted"
                  style={{ minHeight: 140 }}
                >
                  <img
                    src={capturedDataUrl}
                    alt="Original"
                    className="max-h-36 w-auto object-contain"
                  />
                </div>
                <Button
                  data-ocid="image.secondary_button"
                  variant="outline"
                  className="w-full h-10 font-600"
                  onClick={handleKeepOriginal}
                >
                  <X className="w-4 h-4 mr-1.5" />
                  Keep Original
                </Button>
              </div>
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
              {cloudflareConfigured ? (
                <Cloud className="w-4 h-4 mr-2" />
              ) : (
                <Layers className="w-4 h-4 mr-2" />
              )}
              Convert &amp;{" "}
              {cloudflareConfigured ? "Upload to Cloudflare" : "Upload"}
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
                  strokeDasharray={`${
                    cloudflareConfigured ? 113 : (uploadProgress / 100) * 226
                  } 226`}
                  style={{ transition: "stroke-dasharray 0.3s ease" }}
                />
              </svg>
            </div>
            <div className="text-center">
              <p className="font-display font-700 text-lg">
                {cloudflareConfigured
                  ? "Uploading to Cloudflare"
                  : "Converting & Uploading"}
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                {cloudflareConfigured
                  ? "Sending image to Cloudflare CDN..."
                  : `${uploadProgress}% complete`}
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
                <div className="flex items-center justify-center gap-2 mt-1">
                  {lastSizeKb !== null && (
                    <p className="text-sm text-muted-foreground">
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
                  {usedCloudflare !== null && (
                    <Badge
                      variant="outline"
                      className={`gap-1 text-[10px] py-0 ${
                        usedCloudflare
                          ? "text-orange-600 border-orange-300 bg-orange-50"
                          : "text-muted-foreground"
                      }`}
                    >
                      {usedCloudflare ? (
                        <Cloud className="w-2.5 h-2.5" />
                      ) : (
                        <HardDrive className="w-2.5 h-2.5" />
                      )}
                      {usedCloudflare ? "Cloudflare" : "Local storage"}
                    </Badge>
                  )}
                </div>
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
