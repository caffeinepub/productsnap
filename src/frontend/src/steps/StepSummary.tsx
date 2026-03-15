import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Hash,
  Image,
  Loader2,
  RotateCcw,
  Search,
  Tag,
} from "lucide-react";
import { motion } from "motion/react";
import { toast } from "sonner";
import { useActor } from "../hooks/useActor";
import { useCreateEntry } from "../hooks/useQueries";

interface StepSummaryProps {
  sku: string;
  productName: string;
  capturedImageUrls: string[];
  searchImageUrls: string[];
  onSaved: () => void;
  onStartNew: () => void;
}

type FieldIcon = typeof Hash;

interface SummaryField {
  icon: FieldIcon;
  label: string;
  value: string;
  hasValue: boolean;
  count?: number;
  mono?: boolean;
}

export function StepSummary({
  sku,
  productName,
  capturedImageUrls,
  searchImageUrls,
  onSaved,
  onStartNew,
}: StepSummaryProps) {
  const createEntry = useCreateEntry();
  const { actor, isFetching: isActorLoading } = useActor();

  const handleSave = async () => {
    if (!actor) {
      toast.error(
        "Still connecting to backend. Please wait a moment and try again.",
      );
      return;
    }
    try {
      await createEntry.mutateAsync({
        sku,
        productName,
        capturedImageUrls: capturedImageUrls.join(";"),
        searchImageUrls: searchImageUrls.join(";"),
      });
      toast.success("Product entry saved!");
      onSaved();
    } catch (err) {
      console.error("[Save] Failed:", err);
      toast.error("Failed to save. Please try again.");
    }
  };

  const fields: SummaryField[] = [
    { icon: Hash, label: "SKU", value: sku || "\u2014", hasValue: !!sku },
    {
      icon: Tag,
      label: "Product Name",
      value: productName || "\u2014",
      hasValue: !!productName,
    },
    {
      icon: Image,
      label: "Captured Images",
      value: capturedImageUrls.length ? capturedImageUrls.join(";") : "\u2014",
      hasValue: capturedImageUrls.length > 0,
      count: capturedImageUrls.length,
      mono: capturedImageUrls.length > 0,
    },
    {
      icon: Search,
      label: "Search Images",
      value: searchImageUrls.length ? searchImageUrls.join(";") : "\u2014",
      hasValue: searchImageUrls.length > 0,
      count: searchImageUrls.length,
      mono: searchImageUrls.length > 0,
    },
  ];

  const hasAnyData =
    sku ||
    productName ||
    capturedImageUrls.length > 0 ||
    searchImageUrls.length > 0;

  if (createEntry.isSuccess) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex flex-col items-center justify-center h-full gap-6 px-6"
      >
        <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center">
          <CheckCircle2 className="w-10 h-10 text-primary-foreground" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-display font-700">Entry Saved!</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Your product data has been saved successfully.
          </p>
        </div>
        <Button
          data-ocid="summary.secondary_button"
          className="w-full max-w-xs h-12 bg-primary text-primary-foreground font-600"
          onClick={onStartNew}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Capture New Product
        </Button>
      </motion.div>
    );
  }

  const isSaveDisabled = createEntry.isPending || isActorLoading || !actor;

  return (
    <div className="flex flex-col h-full px-4 gap-4 overflow-y-auto pb-2">
      <motion.div
        className="pt-4 text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h1 className="text-2xl font-display font-700 tracking-tight">
          Review &amp; Save
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Confirm your product details
        </p>
      </motion.div>

      <motion.div
        data-ocid="summary.panel"
        className="flex flex-col gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        {fields.map((field) => (
          <div
            key={field.label}
            className="flex gap-3 p-4 rounded-xl bg-card border border-border"
          >
            <div
              className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                field.hasValue ? "bg-primary/10" : "bg-muted"
              }`}
            >
              <field.icon
                className={`w-5 h-5 ${
                  field.hasValue ? "text-primary" : "text-muted-foreground"
                }`}
              />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <p className="text-xs font-600 text-muted-foreground">
                  {field.label}
                </p>
                {field.count !== undefined && field.count > 0 && (
                  <span className="text-xs font-600 text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {field.count}
                  </span>
                )}
              </div>
              <p
                className={`text-sm mt-0.5 break-all ${
                  field.hasValue
                    ? "text-foreground font-500"
                    : "text-muted-foreground"
                } ${field.mono ? "font-mono text-xs text-primary" : ""}`}
              >
                {field.value}
              </p>
            </div>
          </div>
        ))}
      </motion.div>

      <motion.div
        className="flex flex-col gap-3 mt-auto pb-2"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        {!hasAnyData && (
          <p className="text-sm text-muted-foreground text-center bg-muted/50 rounded-xl py-3 px-4">
            No data captured yet. You can still save an empty entry or start
            over.
          </p>
        )}

        {isActorLoading && (
          <p
            data-ocid="summary.loading_state"
            className="text-xs text-muted-foreground text-center flex items-center justify-center gap-1.5"
          >
            <Loader2 className="w-3 h-3 animate-spin" />
            Connecting to backend...
          </p>
        )}

        <Button
          data-ocid="summary.primary_button"
          className="w-full h-12 bg-primary text-primary-foreground font-600"
          onClick={handleSave}
          disabled={isSaveDisabled}
        >
          {createEntry.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving...
            </>
          ) : isActorLoading || !actor ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Connecting...
            </>
          ) : (
            "Save Entry"
          )}
        </Button>
        <Button
          data-ocid="summary.secondary_button"
          variant="outline"
          className="w-full h-12"
          onClick={onStartNew}
        >
          <RotateCcw className="w-4 h-4 mr-2" />
          Start New
        </Button>
      </motion.div>
    </div>
  );
}
