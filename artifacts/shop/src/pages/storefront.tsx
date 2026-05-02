import { useState, useMemo } from "react";
import { useRoute, Link } from "wouter";
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
  ChevronLeft,
  ChevronRight,
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

// ── Carousel ──────────────────────────────────────────────────────────────────

function ImageCarousel({ urls, alt, outOfStock }: { urls: string[]; alt: string; outOfStock: boolean }) {
  const [idx, setIdx] = useState(0);
  const total = urls.length;

  if (total === 0) {
    return (
      <div className="aspect-square w-full bg-muted flex items-center justify-center relative">
        <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
        {outOfStock && <OosBadge />}
      </div>
    );
  }

  const prev = (e: React.MouseEvent) => { e.stopPropagation(); setIdx(i => (i - 1 + total) % total); };
  const next = (e: React.MouseEvent) => { e.stopPropagation(); setIdx(i => (i + 1) % total); };

  return (
    <div className="aspect-square w-full bg-muted relative overflow-hidden group/carousel">
      <img
        src={`/api/storage${urls[idx]}`}
        alt={`${alt} — photo ${idx + 1}`}
        className="w-full h-full object-cover transition-transform hover:scale-105 duration-500"
      />

      {outOfStock && <OosBadge />}

      {/* Arrow nav — only shown when multiple images */}
      {total > 1 && (
        <>
          <button
            onClick={prev}
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 opacity-0 group-hover/carousel:opacity-100 transition-opacity"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 opacity-0 group-hover/carousel:opacity-100 transition-opacity"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          {/* Dot indicators */}
          <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
            {urls.map((_, i) => (
              <button
                key={i}
                onClick={e => { e.stopPropagation(); setIdx(i); }}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? "bg-white scale-125" : "bg-white/50"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function OosBadge() {
  return (
    <div className="absolute inset-0 bg-background/50 flex items-center justify-center">
      <span className="bg-background border text-foreground text-sm font-semibold px-4 py-1.5 rounded-full flex items-center gap-2">
        <PackageX className="w-4 h-4" /> Out of Stock
      </span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Storefront() {
  const [match, params] = useRoute("/store/:slug");
  const slug = params?.slug ?? "";

  const { data: store, isLoading: isStoreLoading, error: storeError } = useGetStoreBySlug(slug, {
    query: { enabled: !!slug, queryKey: getGetStoreBySlugQueryKey(slug) }
  });

  const { data: products, isLoading: isProductsLoading, error: productsError } = useListProducts(store?.id || 0, {
    query: { enabled: !!store?.id, queryKey: getListProductsQueryKey(store?.id || 0) }
  });

  const { items, addItem, removeItem, updateQuantity, clearCart, totalItems } = useCart(slug);
  const [cartOpen, setCartOpen] = useState(false);
  const [selectedVariants, setSelectedVariants] = useState<Record<number, string>>({});
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());
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

  const handleAddToCart = (product: ProductRow, variantLabel?: string) => {
    addItem({ id: product.id, name: product.name, price: product.price, imageUrl: product.imageUrl, variantLabel });
    const key = variantLabel ? `${product.id}:${variantLabel}` : `${product.id}`;
    setAddedKeys(prev => { const n = new Set(prev); n.add(key); return n; });
    setTimeout(() => setAddedKeys(prev => { const n = new Set(prev); n.delete(key); return n; }), 1500);
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

  return (
    <div className="min-h-[100dvh] bg-background">
      {/* Store header */}
      <div className="bg-card border-b pt-10 pb-12 shadow-sm">
        <div className="container mx-auto px-4 max-w-5xl">
          <Link href="/" className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6">
            <ShoppingBag className="w-3.5 h-3.5" />
            <span className="font-serif font-semibold">QuickShop</span>
            <span className="opacity-50">·</span>
            <span>Browse all stores</span>
          </Link>
        </div>
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
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">{store.description}</p>
          )}
        </div>
      </div>

      {/* Sticky cart button */}
      {totalItems > 0 && (
        <div className="sticky top-4 z-30 flex justify-end px-4 max-w-5xl mx-auto mt-4">
          <Button onClick={() => setCartOpen(true)} className="rounded-full shadow-lg gap-2 pr-5" size="lg">
            <ShoppingCart className="w-5 h-5" />
            View Cart
            <span className="bg-white text-primary text-xs font-bold px-2 py-0.5 rounded-full ml-1">{totalItems}</span>
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
              <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {isProductsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-96 rounded-3xl" />)}
          </div>
        ) : productsError ? (
          <div className="text-center py-20">
            <PackageX className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <h3 className="text-xl font-medium text-foreground mb-2">Couldn't load products</h3>
            <p className="text-muted-foreground">Something went wrong. Please refresh the page to try again.</p>
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
              const p = product as typeof product & { images?: { url: string }[] };
              // Build full image list: gallery images, fall back to imageUrl
              const galleryUrls = (p.images ?? []).map((img: { url: string }) => img.url);
              const imageUrls = galleryUrls.length > 0 ? galleryUrls : (product.imageUrl ? [product.imageUrl] : []);

              const hasVariants = product.hasVariants && product.variants.length > 0;
              const selectedLabel = selectedVariants[product.id];
              const selectedVariant = hasVariants ? product.variants.find(v => v.label === selectedLabel) : undefined;
              const anyVariantInStock = hasVariants ? product.variants.some(v => v.inStock) : true;
              const outOfStock = hasVariants ? !anyVariantInStock : product.inStock === false;
              const selectedVariantOos = hasVariants && selectedLabel ? selectedVariant?.inStock === false : false;
              const cartKey = selectedLabel ? `${product.id}:${selectedLabel}` : `${product.id}`;
              const inCart = items.find(i => i.id === product.id && i.variantLabel === (selectedLabel || undefined));
              const justAdded = addedKeys.has(cartKey);
              const canAdd = !outOfStock && (!hasVariants || (!!selectedLabel && !selectedVariantOos));

              return (
                <Card key={product.id} className={`overflow-hidden rounded-3xl border-border shadow-sm flex flex-col h-full bg-card ${outOfStock ? "opacity-70" : ""}`}>
                  <ImageCarousel urls={imageUrls} alt={product.name} outOfStock={outOfStock} />

                  <CardContent className="p-4 sm:p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-3 gap-4">
                      <h3 className="font-bold text-xl text-foreground">{product.name}</h3>
                      <span className="font-bold text-primary bg-primary/10 px-3 py-1 rounded-full whitespace-nowrap">{store?.currency} {product.price}</span>
                    </div>
                    {product.description && (
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4 flex-1">{product.description}</p>
                    )}

                    {/* Variant picker */}
                    {hasVariants && (
                      <div className="mb-4">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Select Size / Option</p>
                        <div className="flex flex-wrap gap-2">
                          {product.variants.map(variant => {
                            const isSelected = selectedLabel === variant.label;
                            const isOos = !variant.inStock;
                            return (
                              <button
                                key={variant.id}
                                onClick={() => {
                                  if (isOos) return;
                                  setSelectedVariants(prev => ({ ...prev, [product.id]: isSelected ? "" : variant.label }));
                                }}
                                className={[
                                  "relative px-3 py-1.5 rounded-lg text-sm font-medium border transition-all select-none",
                                  isOos
                                    ? "opacity-40 cursor-not-allowed border-border text-muted-foreground line-through"
                                    : isSelected
                                    ? "bg-primary text-primary-foreground border-primary shadow-sm"
                                    : "bg-background border-border text-foreground hover:border-primary/60",
                                ].join(" ")}
                                title={isOos ? "Out of stock" : undefined}
                              >
                                {variant.label}
                              </button>
                            );
                          })}
                        </div>
                        {hasVariants && !selectedLabel && (
                          <p className="text-xs text-muted-foreground mt-1.5">Pick a size to add to cart</p>
                        )}
                        {selectedVariantOos && (
                          <p className="text-xs text-destructive mt-1.5 flex items-center gap-1">
                            <PackageX className="w-3 h-3" /> This size is out of stock
                          </p>
                        )}
                      </div>
                    )}

                    <div className="mt-auto pt-2">
                      <Button
                        onClick={() => canAdd && handleAddToCart(product, selectedLabel || undefined)}
                        className="w-full rounded-2xl h-12"
                        size="lg"
                        disabled={!canAdd}
                        variant={justAdded ? "default" : inCart ? "secondary" : "default"}
                      >
                        {outOfStock ? (
                          <><PackageX className="w-5 h-5 mr-2" /> Out of Stock</>
                        ) : hasVariants && !selectedLabel ? (
                          <><ShoppingCart className="w-5 h-5 mr-2" /> Select a Size</>
                        ) : selectedVariantOos ? (
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
        <Link href="/" className="text-muted-foreground flex items-center justify-center gap-2 hover:text-foreground transition-colors">
          Powered by <ShoppingBag className="w-4 h-4" /> <span className="font-serif font-bold text-foreground">QuickShop</span>
        </Link>
      </footer>

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
