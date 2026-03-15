# ProductSnap

## Current State
StepImage.tsx attempts a dynamic import of `@imgly/background-removal` in `processFile`, but the package is not listed in package.json. The import throws immediately, the catch block runs, and `setPhase('background')` is called — skipping the 'confirm-removal' comparison screen entirely. The user sees the background-selection screen ("next screen") instantly after capture with no background removal.

## Requested Changes (Diff)

### Add
- `@imgly/background-removal` to package.json dependencies (version ^1.4.5)
- Proper `publicPath` CDN config in the `removeBackground()` call so WASM/model files load from jsDelivr

### Modify
- `processFile` in StepImage.tsx: pass `{ publicPath }` config to `removeBackground` so the ML models can load in the browser
- Show a clear error/fallback toast only after a genuine timeout/failure, not on missing module

### Remove
- Nothing

## Implementation Plan
1. Add `@imgly/background-removal` ^1.4.5 to `src/frontend/package.json` dependencies
2. In `processFile`, pass `publicPath: 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.4.5/dist/'` as config to `removeBackground`
3. Validate and build
