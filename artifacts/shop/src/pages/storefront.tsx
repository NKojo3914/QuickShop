import { useState, useMemo } from "react";
import { useRoute } from "wouter";
import {
  Store,
  ShoppingBag,
  Image as ImageIcon,
  ShoppingCart,
  Plus,
  Check,
  PackageX,
  Search,
  X,
} from "lucide-react";
import {
  useGetStoreBySlug,
  getGetStoreBySlugQueryKey,
  useListProducts,
  getListProductsQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useCart } from "@/hooks/use-cart";
import { CartDrawer } from "@/components/CartDrawer";

export default function Storefront() {
  const [match, params] = useRoute("/store/:slug");
  const slug = params?.slug ?? "";

  const { data: store, isLoading: isStoreLoading, error: storeError } = useGetStoreBySlug(slug, {
    query: { enabled: !!slug, queryKey: getGetStoreBySlugQueryKey(slug) }
  });

  const { data: products, isLoading: isProductsLoading } = useListProducts(store?.id || 0, {
    query: { enabled: !!store?.id, queryKey: getListProductsQueryKey(store?.id || 0) }
  });

  const { items, addItem, removeItem, updateQuantity, clearCart, totalItems } = useCart(slug);
  const [cartOpen, setCartOpen] = useState(false);
  const [addedIds, setAddedIds] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products?.filter(p =>
      p.name.toLowerCase().includes(q) ||
      (p.description ?? "").toLowerCase().includes(q)
    );
  }, [products, searchQuery]);

  type ProductRow = NonNullable<typeof products>[number];
  const handleAddToCart = (product: ProductRow) => {
    addItem({
      id: product.id,
      name: product.name,
      price: product.price,
      imageUrl: product.imageUrl,
    });
    setAddedIds(prev => {
      const next = new Set(prev);
      next.add(product.id);
      return next;
    });
    setTimeout(() => {
      setAddedIds(prev => {
        const next = new Set(prev);
        next.delete(product.id);
        return next;
      });
    }, 1500);
  };

  if (!match) return null;

  if (storeError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4 text-center">
        <div className="bg-muted p-4 rounded-full mb-4">
          <Store className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-2xl font-serif font-bold mb-2">Store not found</h2>
        <p className="text-muted-foreground max-w-md">This store doesn't exist or has been removed.</p>
      </div>
    );
  }

  if (isStoreLoading) {
    return (
      <div className="min-h-[100dvh] bg-background">
        <div className="bg-primary/5 border-b border-primary/10">
          <div className="container mx-auto px-4 py-16 max-w-5xl text-center">
            <Skeleton className="h-12 w-64 mx-auto mb-4" />
            <Skeleton className="h-4 w-96 mx-auto" />
          </div>
        </div>
        <div className="container mx-auto px-4 py-12 max-w-5xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3, 4, 5, 6].map(i => <Skeleton key={i} className="h-96 rounded-3xl" />)}
          </div>
        </div>
      </div>
    );
  }

  const hasTelegram = !!(store?.telegramBotUsername);

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Store header */}
      <div className="bg-card border-b pt-16 pb-12 shadow-sm">
        <div className="container mx-auto px-4 max-w-5xl text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary text-primary-foreground mb-6 shadow-md overflow-hidden">
            {store?.logoUrl ? (
              <img src={`/api/storage${store.logoUrl}`} alt={store.name} className="w-full h-full object-cover" />
            ) : (
              <ShoppingBag className="w-8 h-8" />
            )}
          </div>
          <h1 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-4">{store?.name}</h1>
          {store?.description && (
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              {store.description}
            </p>
          )}
        </div>
      </div>

      {/* Sticky cart button */}
      {totalItems > 0 && (
        <div className="sticky top-4 z-30 flex justify-end px-4 max-w-5xl mx-auto mt-4">
          <Button
            onClick={() => setCartOpen(true)}
            className="rounded-full shadow-lg gap-2 pr-5"
            size="lg"
          >
            <ShoppingCart className="w-5 h-5" />
            View Cart
            <span className="bg-white text-primary text-xs font-bold px-2 py-0.5 rounded-full ml-1">
              {totalItems}
            </span>
          </Button>
        </div>
      )}

      {/* Products */}
      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Search bar */}
        {!isProductsLoading && (products?.length ?? 0) > 0 && (
          <div className="relative max-w-sm mb-8">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <Input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search products..."
              className="pl-9 pr-9 rounded-xl"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {isProductsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-96 rounded-3xl" />)}
          </div>
        ) : products?.length === 0 ? (
          <div className="text-center py-20">
            <h3 className="text-xl font-medium text-foreground mb-2">No products yet</h3>
            <p className="text-muted-foreground">This store hasn't added any products yet.</p>
          </div>
        ) : filteredProducts?.length === 0 ? (
          <div className="text-center py-20">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-foreground mb-1">No products match "{searchQuery}"</h3>
            <button onClick={() => setSearchQuery("")} className="text-sm text-primary underline underline-offset-4">Clear search</button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-8 sm:gap-x-8 sm:gap-y-12">
            {filteredProducts?.map(product => {
              const inCart = items.find(i => i.id === product.id);
              const justAdded = addedIds.has(product.id);
              const outOfStock = product.inStock === false;

              return (
                <Card key={product.id} className={`overflow-hidden rounded-3xl border-border shadow-sm flex flex-col h-full bg-card ${outOfStock ? "opacity-70" : ""}`}>
                  {product.imageUrl ? (
                    <div className="aspect-square w-full bg-muted relative overflow-hidden">
                      <img
                        src={`/api/storage${product.imageUrl}`}
                        alt={product.name}
                        className="w-full h-full object-cover transition-transform hover:scale-105 duration-500"
                      />
                      {outOfStock && (
                        <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
                          <span className="bg-background border text-foreground text-sm font-semibold px-4 py-1.5 rounded-full flex items-center gap-2">
                            <PackageX className="w-4 h-4" /> Out of Stock
                          </span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="aspect-square w-full bg-muted flex items-center justify-center relative">
                      <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                      {outOfStock && (
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="bg-background border text-foreground text-sm font-semibold px-4 py-1.5 rounded-full flex items-center gap-2">
                            <PackageX className="w-4 h-4" /> Out of Stock
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                  <CardContent className="p-4 sm:p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-3 gap-4">
                      <h3 className="font-bold text-xl text-foreground">{product.name}</h3>
                      <span className="font-bold text-primary bg-primary/10 px-3 py-1 rounded-full whitespace-nowrap">{store?.currency} {product.price}</span>
                    </div>
                    {product.description && (
                      <p className="text-muted-foreground text-sm leading-relaxed mb-6 flex-1">
                        {product.description}
                      </p>
                    )}

                    <div className="mt-auto pt-2">
                      <Button
                        onClick={() => !outOfStock && handleAddToCart(product)}
                        className="w-full rounded-2xl h-12"
                        size="lg"
                        disabled={outOfStock}
                        variant={justAdded ? "default" : inCart ? "secondary" : "default"}
                      >
                        {outOfStock ? (
                          <><PackageX className="w-5 h-5 mr-2" /> Out of Stock</>
                        ) : justAdded ? (
                          <><Check className="w-5 h-5 mr-2" /> Added!</>
                        ) : inCart ? (
                          <><Plus className="w-5 h-5 mr-2" /> Add Again ({inCart.quantity} in cart)</>
                        ) : (
                          <><ShoppingCart className="w-5 h-5 mr-2" /> Add to Cart</>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <footer className="bg-muted py-12 border-t text-center">
        <p className="text-muted-foreground flex items-center justify-center gap-2">
          Powered by <ShoppingBag className="w-4 h-4" /> <span className="font-serif font-bold text-foreground">QuickShop</span>
        </p>
      </footer>

      {/* Cart Drawer */}
      <CartDrawer
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        items={items}
        onUpdateQuantity={updateQuantity}
        onRemove={removeItem}
        onClear={clearCart}
        storeName={store?.name ?? ""}
        whatsappNumber={store?.whatsappNumber ?? ""}
        telegramBotUsername={store?.telegramBotUsername}
        currency={store?.currency ?? "GHS"}
      />
    </div>
  );
}
