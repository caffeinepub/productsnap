# ProductSnap

## Current State
Background removal uses `@imgly/background-removal` which relies on ONNX Runtime multi-threading. This requires `SharedArrayBuffer`, which is only available when the server sends `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` headers. ICP canisters do not send these headers, so every call fails and the user sees "background removal unavailable."

## Requested Changes (Diff)

### Add
- `@huggingface/transformers` dependency for RMBG background removal model
- Single-thread ONNX config (`numThreads: 1`) to avoid SharedArrayBuffer requirement
- `removeBackgroundHF()` utility that uses `briaai/RMBG-1.4` via AutoModel + AutoProcessor

### Modify
- `package.json`: add `@huggingface/transformers`, remove `@imgly/background-removal`
- `vite.config.ts`: add `@huggingface/transformers` to `optimizeDeps.exclude`
- `StepImage.tsx`: replace dynamic import of `@imgly/background-removal` with the new HuggingFace implementation

### Remove
- `@imgly/background-removal` dependency

## Implementation Plan
1. Update package.json: add `@huggingface/transformers ^3`, remove `@imgly/background-removal`
2. Update vite.config.ts: exclude `@huggingface/transformers` from optimizeDeps
3. Rewrite `processFile` in StepImage.tsx to call the RMBG model directly via transformers.js with numThreads=1
4. Validate build
