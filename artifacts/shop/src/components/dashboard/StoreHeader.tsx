import { Copy, Plus, QrCode, Link as LinkIcon } from "lucide-react";
import type { Store } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";

interface StoreSummary {
  totalProducts: number;
  totalOrders: number;
  pendingOrders: number;
  completedOrders: number;
}

export interface StoreHeaderProps {
  store: Store;
  summary: StoreSummary | undefined;
  copyStoreLink: () => void;
  onQrOpen: () => void;
  onAddProduct: () => void;
}

export function StoreHeader({ store, summary, copyStoreLink, onQrOpen, onAddProduct }: StoreHeaderProps) {
  return (
    <>
      <div className="bg-card border rounded-3xl p-5 sm:p-8 mb-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-2">{store.name}</h1>
          <p className="text-muted-foreground flex items-center gap-2 text-sm truncate">
            <LinkIcon className="w-4 h-4 shrink-0" /> quickshop.com/store/{store.slug}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <Button onClick={copyStoreLink} variant="outline" className="rounded-full px-4 sm:px-6 flex-1 md:flex-none">
            <Copy className="w-4 h-4 mr-2" /> Copy Link
          </Button>
          <Button onClick={onQrOpen} variant="outline" className="rounded-full px-4 sm:px-6 flex-1 md:flex-none">
            <QrCode className="w-4 h-4 mr-2" /> QR Code
          </Button>
          <Button onClick={onAddProduct} className="rounded-full px-4 sm:px-6 w-full sm:w-auto">
            <Plus className="w-4 h-4 mr-2" /> Add Product
          </Button>
        </div>
      </div>

      {/* Analytics */}
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
          <div className="bg-card border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Products</p>
            <p className="text-2xl font-bold text-foreground">{summary.totalProducts}</p>
          </div>
          <div className="bg-card border rounded-2xl p-4">
            <p className="text-xs text-muted-foreground mb-1">Total Orders</p>
            <p className="text-2xl font-bold text-foreground">{summary.totalOrders}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
            <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">Pending</p>
            <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{summary.pendingOrders}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-4">
            <p className="text-xs text-green-700 dark:text-green-400 mb-1">Completed</p>
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{summary.completedOrders}</p>
          </div>
        </div>
      )}
    </>
  );
}
