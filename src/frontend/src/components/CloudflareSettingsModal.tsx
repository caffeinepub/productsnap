import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  Loader2,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { backendInterface } from "../backend";

interface CloudflareActor extends backendInterface {
  setCloudflareConfig(accountId: string, apiToken: string): Promise<void>;
  getCloudflareConfigured(): Promise<boolean>;
}

interface CloudflareSettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actor: backendInterface | null;
  configured: boolean;
  onConfigChange: () => void;
}

export function CloudflareSettingsModal({
  open,
  onOpenChange,
  actor,
  configured,
  onConfigChange,
}: CloudflareSettingsModalProps) {
  const [accountId, setAccountId] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    if (open) {
      setAccountId("");
      setApiToken("");
    }
  }, [open]);

  const handleSave = async () => {
    if (!actor) return;
    if (!accountId.trim() || !apiToken.trim()) {
      toast.error("Both Account ID and API Token are required.");
      return;
    }
    setSaving(true);
    try {
      await (actor as CloudflareActor).setCloudflareConfig(
        accountId.trim(),
        apiToken.trim(),
      );
      toast.success("Cloudflare Images configured!");
      onConfigChange();
      onOpenChange(false);
    } catch (err) {
      console.error(err);
      toast.error("Failed to save Cloudflare config. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const handleClear = async () => {
    if (!actor) return;
    setClearing(true);
    try {
      await (actor as CloudflareActor).setCloudflareConfig("", "");
      toast.success("Cloudflare config cleared.");
      onConfigChange();
      setAccountId("");
      setApiToken("");
    } catch (err) {
      console.error(err);
      toast.error("Failed to clear config.");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-ocid="cloudflare.dialog"
        className="max-w-sm rounded-2xl"
      >
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
              <CloudUpload className="w-4 h-4 text-orange-500" />
            </div>
            <DialogTitle className="text-base">Cloudflare Images</DialogTitle>
          </div>
          <DialogDescription className="text-xs leading-relaxed">
            Upload product images directly to Cloudflare for clean, CDN-backed
            URLs that end with{" "}
            <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">
              /public
            </code>{" "}
            — recognised by Wix and most platforms.{" "}
            <a
              href="https://developers.cloudflare.com/images/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-0.5 text-primary hover:underline"
            >
              Learn more
              <ExternalLink className="w-2.5 h-2.5" />
            </a>
          </DialogDescription>
        </DialogHeader>

        {/* Status badge */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Status:</span>
          {configured ? (
            <Badge
              variant="outline"
              className="text-green-600 border-green-300 bg-green-50 gap-1 text-[11px]"
            >
              <CheckCircle2 className="w-3 h-3" />
              Configured
            </Badge>
          ) : (
            <Badge
              variant="outline"
              className="text-muted-foreground gap-1 text-[11px]"
            >
              <XCircle className="w-3 h-3" />
              Not configured
            </Badge>
          )}
        </div>

        <div className="flex flex-col gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="cf-account-id" className="text-xs font-medium">
              Account ID
            </Label>
            <Input
              id="cf-account-id"
              data-ocid="cloudflare.input"
              placeholder="e.g. a1b2c3d4e5f6..."
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              autoComplete="off"
              className="text-sm h-10"
            />
            <p className="text-[10px] text-muted-foreground">
              Found in your Cloudflare dashboard → Images
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="cf-api-token" className="text-xs font-medium">
              Images API Token
            </Label>
            <Input
              id="cf-api-token"
              data-ocid="cloudflare.input"
              type="password"
              placeholder="Your Images API token"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              autoComplete="off"
              className="text-sm h-10"
            />
            <p className="text-[10px] text-muted-foreground">
              Must have permission: Account → Cloudflare Images → Edit
            </p>
          </div>

          {/* URL format note */}
          <div className="rounded-xl bg-muted/50 border border-border p-3 text-[10px] text-muted-foreground leading-relaxed space-y-1">
            <p>
              <span className="font-semibold text-foreground">URL format:</span>{" "}
              Uploaded images will use{" "}
              <code className="font-mono bg-background px-1 rounded">
                https://imagedelivery.net/…/public
              </code>
            </p>
            <p>
              If Wix rejects the URL, append{" "}
              <code className="font-mono bg-background px-1 rounded">
                /avif
              </code>{" "}
              to request the AVIF variant explicitly, e.g.{" "}
              <code className="font-mono bg-background px-1 rounded">
                …/public/avif
              </code>
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            {configured && (
              <Button
                data-ocid="cloudflare.delete_button"
                variant="outline"
                size="sm"
                className="text-destructive hover:text-destructive border-destructive/30 hover:bg-destructive/10"
                onClick={handleClear}
                disabled={clearing || saving}
              >
                {clearing ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                ) : null}
                Clear
              </Button>
            )}
            <Button
              data-ocid="cloudflare.cancel_button"
              variant="outline"
              size="sm"
              className="flex-1"
              onClick={() => onOpenChange(false)}
              disabled={saving || clearing}
            >
              Cancel
            </Button>
            <Button
              data-ocid="cloudflare.save_button"
              size="sm"
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white"
              onClick={handleSave}
              disabled={
                saving || clearing || !accountId.trim() || !apiToken.trim()
              }
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
              ) : null}
              Save
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
