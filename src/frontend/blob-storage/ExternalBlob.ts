// Stub for Caffeine platform blob-storage module
// This is replaced by the actual implementation in the Caffeine build pipeline

export class ExternalBlob {
  private bytes: Uint8Array<ArrayBuffer> | null = null;
  private url: string | null = null;
  private progressCallback: ((percentage: number) => void) | null = null;

  private constructor() {}

  static fromURL(url: string): ExternalBlob {
    const blob = new ExternalBlob();
    blob.url = url;
    return blob;
  }

  static fromBytes(data: Uint8Array<ArrayBuffer>): ExternalBlob {
    const blob = new ExternalBlob();
    blob.bytes = data;
    return blob;
  }

  withUploadProgress(onProgress: (percentage: number) => void): ExternalBlob {
    const clone = new ExternalBlob();
    clone.bytes = this.bytes;
    clone.url = this.url;
    clone.progressCallback = onProgress;
    return clone;
  }

  async getBytes(): Promise<Uint8Array<ArrayBuffer>> {
    if (this.bytes) return this.bytes;
    if (this.url) {
      const res = await fetch(this.url);
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
    return new Uint8Array(0);
  }

  getDirectURL(): string {
    // In production, this uploads to Caffeine blob storage and returns a URL
    // In development stub, create an object URL from the bytes
    if (this.url) return this.url;
    if (this.bytes) {
      if (this.progressCallback) {
        // Simulate progress
        setTimeout(() => this.progressCallback?.(50), 100);
        setTimeout(() => this.progressCallback?.(100), 200);
      }
      const blob = new Blob([this.bytes]);
      return URL.createObjectURL(blob);
    }
    return "";
  }
}
