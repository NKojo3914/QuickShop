import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CurrencyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currency: string;
  setCurrency: (value: string) => void;
  onSave: () => void;
  isUpdatePending: boolean;
}

export function CurrencyDialog({ open, onOpenChange, currency, setCurrency, onSave, isUpdatePending }: CurrencyDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">Store Currency</DialogTitle>
          <DialogDescription>
            Set the currency code or symbol shown on all your product prices (e.g. GHS, USD, €, £).
          </DialogDescription>
        </DialogHeader>
        <div className="py-4">
          <label className="text-sm font-medium mb-2 block">Currency code / symbol</label>
          <Input
            placeholder="e.g. GHS, USD, €"
            value={currency}
            onChange={e => setCurrency(e.target.value)}
            maxLength={10}
          />
          <p className="text-xs text-muted-foreground mt-2">Preview: <span className="font-semibold text-foreground">{currency} 25.00</span></p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={onSave}
            disabled={isUpdatePending}
          >
            {isUpdatePending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
