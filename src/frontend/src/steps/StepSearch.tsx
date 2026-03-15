import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Check,
  Copy,
  ImageOff,
  Loader2,
  RefreshCw,
  Search,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSearchImages } from "../hooks/useQueries";

type ImageResult = { url: string; thumbnail: string; title: string };

function parseResults(raw: string): ImageResult[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item: unknown) => {
        if (typeof item === "string") {
          return { url: item, thumbnail: item, title: "" };
        }
        const obj = item as Record<string, string>;
        const url = obj.url ?? obj.link ?? obj.image ?? "";
        const thumbnail = obj.thumbnail ?? obj.image ?? url;
        const title = obj.title ?? "";
        return { url, thumbnail, title };
      })
      .filter((r) => r.url);
  } catch {
    return [];
  }
}

interface StepSearchProps {
  productName: string;
  selectedUrls: string[];
  onUpdate: (urls: string[]) => void;
}

export function StepSearch({
  productName,
  selectedUrls,
  onUpdate,
}: StepSearchProps) {
  const [query, setQuery] = useState(productName);
  const [activeQuery, setActiveQuery] = useState(productName);
  const [enabled, setEnabled] = useState(productName.trim().length > 0);

  const {
    data: rawData,
    isLoading,
    isError,
    refetch,
  } = useSearchImages(activeQuery, enabled);
  const results = rawData ? parseResults(rawData) : [];

  useEffect(() => {
    if (productName.trim()) {
      setQuery(productName);
      setActiveQuery(productName);
      setEnabled(true);
    }
  }, [productName]);

  const toggleSelect = (url: string) => {
    if (selectedUrls.includes(url)) {
      onUpdate(selectedUrls.filter((u) => u !== url));
    } else {
      onUpdate([...selectedUrls, url]);
    }
  };

  const copyUrls = () => {
    navigator.clipboard
      .writeText(selectedUrls.join(";"))
      .then(() => toast.success("URLs copied!"));
  };

  const handleSearch = () => {
    if (!query.trim()) return;
    setActiveQuery(query);
    setEnabled(true);
  };

  return (
    <div className="flex flex-col h-full gap-4 px-4 overflow-y-auto pb-2">
      <motion.div
        className="pt-4 text-center"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <h1 className="text-2xl font-display font-700 tracking-tight">
          Image Search
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Find reference images from the web
        </p>
      </motion.div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            data-ocid="search.search_input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search product images..."
            className="pl-10 h-11 bg-card"
          />
        </div>
        <Button
          size="icon"
          className="h-11 w-11 bg-primary text-primary-foreground"
          onClick={handleSearch}
          disabled={isLoading}
        >
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </Button>
      </div>

      <AnimatePresence mode="wait">
        {isLoading && (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-12 gap-3"
          >
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
            <p className="text-sm text-muted-foreground">
              Searching the web...
            </p>
          </motion.div>
        )}

        {isError && (
          <motion.div
            key="error"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-10 gap-3"
          >
            <ImageOff className="w-8 h-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Search failed</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-3.5 h-3.5 mr-2" /> Retry
            </Button>
          </motion.div>
        )}

        {!isLoading && !isError && results.length === 0 && enabled && (
          <motion.div
            key="empty"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center py-10 gap-3 text-center"
          >
            <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center">
              <Search className="w-6 h-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              No images found for &quot;{activeQuery}&quot;
            </p>
            <p className="text-xs text-muted-foreground">
              Try a different search term
            </p>
          </motion.div>
        )}

        {!isLoading && results.length > 0 && (
          <motion.div
            key="results"
            data-ocid="search.canvas_target"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="grid grid-cols-3 gap-2"
          >
            {results.slice(0, 18).map((result, i) => {
              const isSelected = selectedUrls.includes(result.url);
              const ocid = i < 6 ? `search.item.${i + 1}` : undefined;
              return (
                <button
                  type="button"
                  key={`result-${result.url.slice(-32)}`}
                  data-ocid={ocid}
                  onClick={() => toggleSelect(result.url)}
                  className={`relative rounded-xl overflow-hidden border-2 transition-all ${
                    isSelected ? "border-primary" : "border-border"
                  }`}
                  style={{ aspectRatio: "1" }}
                >
                  <img
                    src={result.thumbnail}
                    alt={result.title || "Product image"}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100'%3E%3Crect fill='%23222' width='100' height='100'/%3E%3C/svg%3E";
                    }}
                  />
                  {isSelected && (
                    <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                      <div className="w-7 h-7 rounded-full bg-primary flex items-center justify-center">
                        <Check className="w-4 h-4 text-primary-foreground" />
                      </div>
                    </div>
                  )}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>

      {selectedUrls.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-card border border-border p-3 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs font-600 text-muted-foreground">
              {selectedUrls.length} URL{selectedUrls.length > 1 ? "s" : ""}{" "}
              selected
            </p>
            <Button
              data-ocid="search.primary_button"
              size="sm"
              variant="outline"
              className="h-7 text-xs border-primary/40 text-primary hover:bg-primary/10"
              onClick={copyUrls}
            >
              <Copy className="w-3 h-3 mr-1" />
              Copy URLs
            </Button>
          </div>
          <p className="text-xs text-primary break-all font-mono leading-relaxed">
            {selectedUrls.join(";")}
          </p>
        </motion.div>
      )}
    </div>
  );
}
