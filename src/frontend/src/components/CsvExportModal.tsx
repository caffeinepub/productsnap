import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import type { ProductEntry } from "../backend.d";
import {
  useGetAllEntries,
  useGetEntriesByDateRange,
} from "../hooks/useQueries";

type FilterKey = "all" | "today" | "yesterday" | "week" | "month";

function getDateRange(filter: FilterKey): { from: bigint; to: bigint } | null {
  if (filter === "all") return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let from: Date;
  let to: Date = new Date(today.getTime() + 86400000);

  switch (filter) {
    case "today":
      from = today;
      break;
    case "yesterday": {
      from = new Date(today.getTime() - 86400000);
      to = today;
      break;
    }
    case "week": {
      const dayOfWeek = today.getDay();
      const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      from = new Date(today.getTime() - diff * 86400000);
      break;
    }
    case "month":
      from = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    default:
      from = today;
  }

  return {
    from: BigInt(from.getTime()) * BigInt(1_000_000),
    to: BigInt(to.getTime()) * BigInt(1_000_000),
  };
}

function generateCsv(entries: ProductEntry[]): string {
  const headers = [
    "SKU",
    "Product Name",
    "Captured Image URLs",
    "Search Image URLs",
    "Date Captured",
  ];
  const rows = entries.map((e) => [
    e.sku,
    e.productName,
    e.capturedImageUrls,
    e.searchImageUrls,
    new Date(Number(e.createdAt) / 1_000_000).toLocaleString(),
  ]);
  return [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const FILTER_LABELS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
];

interface CsvExportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CsvExportModal({ open, onOpenChange }: CsvExportModalProps) {
  const [filter, setFilter] = useState<FilterKey>("all");

  const range = getDateRange(filter);
  const allEntries = useGetAllEntries();
  const rangeEntries = useGetEntriesByDateRange(
    range?.from ?? BigInt(0),
    range?.to ?? BigInt(0),
    open && filter !== "all",
  );

  const entries =
    filter === "all" ? (allEntries.data ?? []) : (rangeEntries.data ?? []);
  const isLoading =
    filter === "all" ? allEntries.isLoading : rangeEntries.isLoading;

  const handleDownload = () => {
    if (!entries.length) return;
    const csv = generateCsv(entries);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadCsv(csv, `productsnap-${filter}-${dateStr}.csv`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-ocid="csv.dialog"
        className="max-w-sm mx-auto w-[calc(100vw-2rem)] bg-card border-border"
      >
        <DialogHeader>
          <DialogTitle className="font-display font-700 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" />
            Export CSV
          </DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <Tabs value={filter} onValueChange={(v) => setFilter(v as FilterKey)}>
            <TabsList
              data-ocid="csv.tab"
              className="w-full bg-muted p-1 h-auto flex-wrap gap-1"
            >
              {FILTER_LABELS.map(({ key, label }) => (
                <TabsTrigger
                  key={key}
                  value={key}
                  className="flex-1 text-xs min-w-0 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {label}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="rounded-xl bg-background border border-border p-4 text-center">
            {isLoading ? (
              <div className="flex flex-col items-center gap-2 py-2">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">
                  Loading entries...
                </p>
              </div>
            ) : (
              <div>
                <p className="text-3xl font-display font-800 text-primary">
                  {entries.length}
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  {entries.length === 1 ? "entry" : "entries"} found
                </p>
              </div>
            )}
          </div>

          <Button
            data-ocid="csv.primary_button"
            className="w-full h-12 bg-primary text-primary-foreground font-600"
            onClick={handleDownload}
            disabled={isLoading || entries.length === 0}
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Loading...
              </>
            ) : (
              <>
                <Download className="w-4 h-4 mr-2" /> Download CSV
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
