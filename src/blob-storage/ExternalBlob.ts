// Caffeine platform blob-storage module stub
export class ExternalBlob {
  private _bytes: Uint8Array<ArrayBuffer> | null = null;
  private _url: string | null = null;
  private _progressCallback: ((percentage: number) => void) | null = null;

  private constructor() {}

  static fromURL(url: string): ExternalBlob {
    const blob = new ExternalBlob();
    blob._url = url;
    return blob;
  }

  static fromBytes(data: Uint8Array<ArrayBuffer>): ExternalBlob {
    const blob = new ExternalBlob();
    blob._bytes = data;
    return blob;
  }

  withUploadProgress(onProgress: (percentage: number) => void): ExternalBlob {
    const clone = new ExternalBlob();
    clone._bytes = this._bytes;
    clone._url = this._url;
    clone._progressCallback = onProgress;
    return clone;
  }

  async getBytes(): Promise<Uint8Array<ArrayBuffer>> {
    if (this._bytes) return this._bytes;
    if (this._url) {
      const res = await fetch(this._url);
      const buf = await res.arrayBuffer();
      return new Uint8Array(buf);
    }
    return new Uint8Array(0);
  }

  getDirectURL(): string {
    if (this._url) return this._url;
    if (this._bytes) {
      if (this._progressCallback) {
        const cb = this._progressCallback;
        setTimeout(() => cb(50), 100);
        setTimeout(() => cb(100), 300);
      }
      const blob = new Blob([this._bytes]);
      return URL.createObjectURL(blob);
    }
    return "";
  }
}
