import type { Principal } from "@icp-sdk/core/principal";
export interface Some<T> {
    __kind__: "Some";
    value: T;
}
export interface None {
    __kind__: "None";
}
export type Option<T> = Some<T> | None;
export interface http_header {
    value: string;
    name: string;
}
export interface TransformationOutput {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface ProductEntry {
    id: bigint;
    sku: string;
    searchImageUrls: string;
    createdAt: bigint;
    productName: string;
    capturedImageUrls: string;
}
export interface TransformationInput {
    context: Uint8Array;
    response: http_request_result;
}
export interface http_request_result {
    status: bigint;
    body: Uint8Array;
    headers: Array<http_header>;
}
export interface backendInterface {
    createEntry(sku: string, productName: string, capturedImageUrls: string, searchImageUrls: string): Promise<ProductEntry>;
    deleteEntry(id: bigint): Promise<void>;
    getAllEntries(): Promise<Array<ProductEntry>>;
    getCloudflareConfigured(): Promise<boolean>;
    getEntriesByDateRange(fromTimestamp: bigint, toTimestamp: bigint): Promise<Array<ProductEntry>>;
    getEntry(id: bigint): Promise<ProductEntry>;
    searchImages(searchQuery: string): Promise<string>;
    setCloudflareConfig(accountId: string, apiToken: string): Promise<void>;
    transform(input: TransformationInput): Promise<TransformationOutput>;
    updateEntry(id: bigint, sku: string, productName: string, capturedImageUrls: string, searchImageUrls: string): Promise<ProductEntry>;
    uploadImageToCloudflare(imageData: Uint8Array): Promise<string>;
}
