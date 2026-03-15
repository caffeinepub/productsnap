import { Input } from "@/components/ui/input";
import { Hash, ScanBarcode } from "lucide-react";
import { useState } from "react";

interface StepSKUProps {
  value: string;
  onChange: (v: string) => void;
}

export function StepSKU({ value, onChange }: StepSKUProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-8 gap-8 min-h-full justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <ScanBarcode className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Product SKU
        </h1>
        <p className="text-muted-foreground text-sm max-w-xs">
          Enter the SKU or barcode for this product. You can skip this if you
          don&apos;t have one.
        </p>
      </div>

      <div className="w-full max-w-sm">
        <div className="relative">
          <Hash className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            data-ocid="sku.input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="e.g. PROD-001, 123456789"
            className={`pl-12 h-14 text-lg bg-card border-border transition-all duration-200 ${focused ? "border-primary" : ""}`}
            autoComplete="off"
            autoCapitalize="characters"
            inputMode="text"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground text-center">
          Tip: Scan a barcode with your camera app first, then paste it here
        </p>
      </div>

      {value && (
        <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 border border-primary/20">
          <div className="w-2 h-2 rounded-full bg-primary" />
          <span className="text-sm font-medium text-primary">{value}</span>
        </div>
      )}
    </div>
  );
}
