import { Input } from "@/components/ui/input";
import { Tag } from "lucide-react";
import { useState } from "react";

interface StepNameProps {
  value: string;
  onChange: (v: string) => void;
  sku: string;
}

export function StepName({ value, onChange, sku }: StepNameProps) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="flex flex-col items-center px-6 pt-12 pb-8 gap-8 min-h-full justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
          <Tag className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">
          Product Name
        </h1>
        {sku && (
          <span className="text-xs text-muted-foreground bg-muted px-3 py-1 rounded-full">
            SKU: {sku}
          </span>
        )}
        <p className="text-muted-foreground text-sm max-w-xs">
          What is this product called? This will be used to search for images
          online.
        </p>
      </div>

      <div className="w-full max-w-sm">
        <div className="relative">
          <Tag className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            data-ocid="name.input"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="e.g. Wireless Bluetooth Speaker"
            className={`pl-12 h-14 text-lg bg-card border-border transition-all duration-200 ${focused ? "border-primary" : ""}`}
            autoComplete="off"
            inputMode="text"
          />
        </div>
      </div>

      {value && (
        <div className="px-4 py-2 rounded-xl bg-card border border-border text-center">
          <span className="text-base font-semibold text-foreground">
            {value}
          </span>
        </div>
      )}
    </div>
  );
}
