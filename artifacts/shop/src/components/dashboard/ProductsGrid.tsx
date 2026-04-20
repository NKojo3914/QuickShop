import {
  Store,
  Plus,
  Pencil,
  Trash2,
  Image as ImageIcon,
  PackageX,
} from "lucide-react";
import type { Product } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface StoreSummary {
  totalProducts: number;
}

export interface ProductsGridProps {
  store: { currency?: string | null };
  summary: StoreSummary | undefined;
  products: Product[] | undefined;
  isProductsLoading: boolean;
  onAddProduct: () => void;
  onEditProduct: (product: Product) => void;
  onDeleteProduct: (id: number) => void;
  onToggleStock: (product: { id: number; inStock: boolean }) => void;
  isUpdatePending: boolean;
}

export function ProductsGrid({
  store,
  summary,
  products,
  isProductsLoading,
  onAddProduct,
  onEditProduct,
  onDeleteProduct,
  onToggleStock,
  isUpdatePending,
}: ProductsGridProps) {
  return (
    <div className="mb-10">
      <h2 className="text-2xl font-serif font-bold text-foreground mb-6">
        Products {summary ? `(${summary.totalProducts})` : ''}
      </h2>

      {isProductsLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-72 rounded-2xl" />)}
        </div>
      ) : products?.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed rounded-3xl bg-muted/50">
          <div className="mx-auto w-16 h-16 bg-background rounded-full flex items-center justify-center shadow-sm mb-4">
            <Store className="w-8 h-8 text-muted-foreground" />
          </div>
          <h3 className="text-xl font-medium text-foreground mb-2">No products yet</h3>
          <p className="text-muted-foreground mb-6 max-w-md mx-auto">
            Your stall is looking a bit empty. Add some products to start selling!
          </p>
          <Button onClick={onAddProduct} size="lg" className="rounded-full">
            <Plus className="w-4 h-4 mr-2" /> Add Your First Product
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {products?.map((product: Product) => (
            <Card key={product.id} className={`overflow-hidden rounded-2xl border-border shadow-sm group ${!product.inStock ? "opacity-60" : ""}`}>
              {product.imageUrl ? (
                <div className="aspect-square w-full bg-muted relative">
                  <img
                    src={`/api/storage${product.imageUrl}`}
                    alt={product.name}
                    className="w-full h-full object-cover"
                  />
                  {!product.inStock && (
                    <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                      <span className="bg-background border text-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5">
                        <PackageX className="w-3.5 h-3.5" /> Out of Stock
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="aspect-square w-full bg-muted flex items-center justify-center relative">
                  <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                  {!product.inStock && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="bg-background border text-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5">
                        <PackageX className="w-3.5 h-3.5" /> Out of Stock
                      </span>
                    </div>
                  )}
                </div>
              )}
              <CardContent className="p-5">
                <div className="flex justify-between items-start mb-2">
                  <h3 className="font-bold text-lg text-foreground line-clamp-1">{product.name}</h3>
                  <span className="font-medium text-primary shrink-0">{store?.currency} {product.price}</span>
                </div>
                {product.description && (
                  <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
                    {product.description}
                  </p>
                )}

                <div className="flex gap-2 mt-4 pt-4 border-t opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`rounded-full text-xs px-3 ${!product.inStock ? "text-amber-600 border-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-700" : "text-muted-foreground"}`}
                    onClick={() => onToggleStock(product)}
                    disabled={isUpdatePending}
                  >
                    <PackageX className="w-3 h-3 mr-1" />
                    {product.inStock ? "In Stock" : "Out of Stock"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 rounded-full"
                    onClick={() => onEditProduct(product)}
                  >
                    <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="outline" size="sm" className="rounded-full px-3 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete {product.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          This action cannot be undone. This product will be permanently removed from your store.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => onDeleteProduct(product.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                          Delete Product
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
