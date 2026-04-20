import { Copy, Download, QrCode } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export interface QrCodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  storeSlug: string | undefined;
  copyStoreLink: () => void;
  downloadQr: () => void;
}

export function QrCodeDialog({ open, onOpenChange, storeSlug, copyStoreLink, downloadQr }: QrCodeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[360px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif flex items-center gap-2">
            <QrCode className="w-5 h-5" /> Your Store QR Code
          </DialogTitle>
          <DialogDescription>
            Print this and stick it on your stall — customers scan to browse and order.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-6 py-4">
          <div className="bg-white p-5 rounded-2xl border shadow-sm">
            <QRCodeSVG
              id="store-qr-code"
              value={`${window.location.origin}/store/${storeSlug ?? ""}`}
              size={200}
              level="H"
              includeMargin={false}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center break-all">
            {window.location.origin}/store/{storeSlug}
          </p>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" className="rounded-full flex-1" onClick={copyStoreLink}>
            <Copy className="w-4 h-4 mr-2" /> Copy Link
          </Button>
          <Button className="rounded-full flex-1" onClick={downloadQr}>
            <Download className="w-4 h-4 mr-2" /> Download PNG
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
