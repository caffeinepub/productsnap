declare module "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/dist/transformers.min.js" {
  export const env: unknown;
  export const AutoModel: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    from_pretrained(
      model: string,
      opts?: unknown,
    ): Promise<(inputs: unknown) => Promise<{ output: any[] }>>;
  };
  export const AutoProcessor: {
    from_pretrained(
      model: string,
      opts?: unknown,
    ): Promise<(image: unknown) => Promise<unknown>>;
  };
  export const RawImage: {
    fromURL(
      url: string,
    ): Promise<{ width: number; height: number; data: Uint8Array }>;
    fromTensor(tensor: unknown): {
      data: Uint8Array;
      resize(w: number, h: number): Promise<{ data: Uint8Array }>;
    };
  };
}
