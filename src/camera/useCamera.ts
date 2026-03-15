// Caffeine platform camera module stub
import type { RefObject } from "react";
import { useRef, useState } from "react";

export interface CameraConfig {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
  quality?: number;
  format?: "image/jpeg" | "image/png" | "image/webp";
}

export interface CameraError {
  type: "permission" | "not-supported" | "not-found" | "unknown" | "timeout";
  message: string;
}

export interface UseCameraReturn {
  isActive: boolean;
  isSupported: boolean | null;
  error: CameraError | null;
  isLoading: boolean;
  currentFacingMode: "user" | "environment";
  startCamera: () => Promise<boolean>;
  stopCamera: () => Promise<void>;
  capturePhoto: () => Promise<File | null>;
  switchCamera: (newFacingMode?: "user" | "environment") => Promise<boolean>;
  retry: () => Promise<boolean>;
  videoRef: RefObject<HTMLVideoElement>;
  canvasRef: RefObject<HTMLCanvasElement>;
}

export function useCamera(config?: CameraConfig): UseCameraReturn {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isActive, setIsActive] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<CameraError | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const facingMode = config?.facingMode ?? "environment";

  const startCamera = async (): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode, width: config?.width, height: config?.height },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Camera error";
      setError({ type: "unknown", message });
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const stopCamera = async (): Promise<void> => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setIsActive(false);
  };

  const capturePhoto = async (): Promise<File | null> => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !isActive) return null;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0);
    return new Promise((resolve) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(null); return; }
          resolve(new File([blob], "photo.jpg", { type: "image/jpeg" }));
        },
        config?.format ?? "image/jpeg",
        config?.quality ?? 0.9,
      );
    });
  };

  const switchCamera = async (_?: "user" | "environment"): Promise<boolean> => {
    await stopCamera();
    return startCamera();
  };

  const retry = async (): Promise<boolean> => startCamera();

  const isSupported =
    typeof navigator !== "undefined" && !!navigator.mediaDevices ? true : false;

  return {
    isActive,
    isSupported,
    error,
    isLoading,
    currentFacingMode: facingMode,
    startCamera,
    stopCamera,
    capturePhoto,
    switchCamera,
    retry,
    videoRef,
    canvasRef,
  };
}
