import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import {
  ChevronLeft,
  ChevronRight,
  FileDown,
  Settings,
  SkipForward,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { backendInterface } from "./backend";
import { CloudflareSettingsModal } from "./components/CloudflareSettingsModal";
import { CsvExportModal } from "./components/CsvExportModal";
import { StepIndicator } from "./components/StepIndicator";
import { useActor } from "./hooks/useActor";
import { StepImage } from "./steps/StepImage";
import { StepName } from "./steps/StepName";
import { StepSKU } from "./steps/StepSKU";
import { StepSearch } from "./steps/StepSearch";
import { StepSummary } from "./steps/StepSummary";

interface CloudflareActor extends backendInterface {
  getCloudflareConfigured(): Promise<boolean>;
}

const STEP_LABELS = ["SKU", "Name", "Image", "Search", "Review"];
const TOTAL_STEPS = 5;

interface WizardState {
  sku: string;
  productName: string;
  capturedImageUrls: string[];
  searchImageUrls: string[];
}

const DEFAULT_STATE: WizardState = {
  sku: "",
  productName: "",
  capturedImageUrls: [],
  searchImageUrls: [],
};

export default function App() {
  const [step, setStep] = useState(0);
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [csvOpen, setCsvOpen] = useState(false);
  const [cfOpen, setCfOpen] = useState(false);
  const [cloudflareConfigured, setCloudflareConfigured] = useState(false);

  const { actor, isFetching } = useActor();

  const checkCloudflareConfig = useCallback(async () => {
    if (!actor || isFetching) return;
    try {
      const configured = await (
        actor as CloudflareActor
      ).getCloudflareConfigured();
      setCloudflareConfigured(configured);
    } catch {
      setCloudflareConfigured(false);
    }
  }, [actor, isFetching]);

  useEffect(() => {
    checkCloudflareConfig();
  }, [checkCloudflareConfig]);

  const goNext = useCallback(() => {
    if (step < TOTAL_STEPS - 1) setStep((s) => s + 1);
  }, [step]);

  const goBack = useCallback(() => {
    if (step > 0) setStep((s) => s - 1);
  }, [step]);

  const handleStartNew = useCallback(() => {
    setState(DEFAULT_STATE);
    setStep(0);
  }, []);

  const handleSaved = useCallback(() => {}, []);

  const handleStepClick = useCallback(
    (i: number) => {
      if (i !== step) setStep(i);
    },
    [step],
  );

  const showNav = step < 4;
  const isImageStep = step === 2;

  return (
    <div className="dvh w-full flex flex-col bg-background">
      {/* Header */}
      <header className="flex-shrink-0 flex items-center justify-between px-4 safe-area-top pt-2 pb-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-primary-foreground text-xs font-bold">
              PS
            </span>
          </div>
          <span className="text-sm font-bold text-foreground">ProductSnap</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-ocid="settings.open_modal_button"
            onClick={() => setCfOpen(true)}
            title="Cloudflare Images settings"
            className={`flex items-center justify-center w-8 h-8 rounded-lg transition-colors ${
              cloudflareConfigured
                ? "bg-orange-100 text-orange-600 hover:bg-orange-200"
                : "bg-secondary text-muted-foreground hover:bg-muted"
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            data-ocid="csv.open_modal_button"
            onClick={() => setCsvOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-secondary hover:bg-muted transition-colors text-xs font-semibold text-muted-foreground"
          >
            <FileDown className="w-3.5 h-3.5" />
            Export CSV
          </button>
        </div>
      </header>

      {/* Step Indicator */}
      <div className="flex-shrink-0">
        <StepIndicator
          currentStep={step}
          totalSteps={TOTAL_STEPS}
          labels={STEP_LABELS}
          onStepClick={handleStepClick}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {step === 0 && (
          <StepSKU
            value={state.sku}
            onChange={(v) => setState((s) => ({ ...s, sku: v }))}
          />
        )}
        {step === 1 && (
          <StepName
            value={state.productName}
            onChange={(v) => setState((s) => ({ ...s, productName: v }))}
            sku={state.sku}
          />
        )}
        {step === 2 && (
          <StepImage
            capturedImageUrls={state.capturedImageUrls}
            onUpdate={(urls) =>
              setState((s) => ({ ...s, capturedImageUrls: urls }))
            }
            cloudflareConfigured={cloudflareConfigured}
            actor={actor}
            onCloudflareConfigChange={checkCloudflareConfig}
          />
        )}
        {step === 3 && (
          <StepSearch
            productName={state.productName}
            selectedUrls={state.searchImageUrls}
            onUpdate={(urls) =>
              setState((s) => ({ ...s, searchImageUrls: urls }))
            }
          />
        )}
        {step === 4 && (
          <StepSummary
            sku={state.sku}
            productName={state.productName}
            capturedImageUrls={state.capturedImageUrls}
            searchImageUrls={state.searchImageUrls}
            onSaved={handleSaved}
            onStartNew={handleStartNew}
          />
        )}
      </main>

      {/* Bottom Navigation */}
      {showNav && (
        <nav className="flex-shrink-0 safe-area-bottom bg-background border-t border-border px-4 pt-3">
          {isImageStep ? (
            <div className="flex gap-3">
              <Button
                variant="outline"
                size="icon"
                className="h-12 w-12"
                onClick={goBack}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
              <Button className="flex-1 h-12 font-semibold" onClick={goNext}>
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          ) : (
            <div className="flex gap-3">
              {step > 0 && (
                <Button
                  variant="outline"
                  size="icon"
                  className="h-12 w-12"
                  onClick={goBack}
                >
                  <ChevronLeft className="w-5 h-5" />
                </Button>
              )}
              <Button
                data-ocid={
                  step === 0
                    ? "sku.secondary_button"
                    : step === 3
                      ? "search.secondary_button"
                      : "name.secondary_button"
                }
                variant="outline"
                className="h-12 px-4 text-muted-foreground hover:text-foreground"
                onClick={goNext}
              >
                <SkipForward className="w-4 h-4 mr-1.5" />
                Skip
              </Button>
              <Button
                data-ocid={
                  step === 0
                    ? "sku.primary_button"
                    : step === 3
                      ? "search.primary_button"
                      : "name.primary_button"
                }
                className="flex-1 h-12 font-semibold"
                onClick={goNext}
              >
                Next <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          )}
        </nav>
      )}

      <CsvExportModal open={csvOpen} onOpenChange={setCsvOpen} />
      <CloudflareSettingsModal
        open={cfOpen}
        onOpenChange={setCfOpen}
        actor={actor}
        configured={cloudflareConfigured}
        onConfigChange={checkCloudflareConfig}
      />
      <Toaster position="top-center" richColors />

      <footer className="flex-shrink-0 py-2 text-center">
        <p className="text-[10px] text-muted-foreground">
          &copy; {new Date().getFullYear()}. Built with &#10084; using{" "}
          <a
            href={`https://caffeine.ai?utm_source=caffeine-footer&utm_medium=referral&utm_content=${encodeURIComponent(window.location.hostname)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline"
          >
            caffeine.ai
          </a>
        </p>
      </footer>
    </div>
  );
}
