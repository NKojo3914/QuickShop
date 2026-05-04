import { useState, useMemo, useRef, useEffect } from "react";
import { useRoute, Link } from "wouter";
import {
  Store,
  ShoppingBag,
  Image as ImageIcon,
  ShoppingCart,
  PackageX,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Star,
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
import { ProductDetailDialog, type DetailProduct } from "@/components/ProductDetailDialog";

// ── Card carousel ────────────────────────────────────────────────────────────

function ImageCarousel({ urls, alt, outOfStock }: { urls: string[]; alt: string; outOfStock: boolean }) {
  const [idx, setIdx] = useState(0);
  const total = urls.length;
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);

  if (total === 0) {
    return (
      <div className="aspect-square w-full bg-muted flex items-center justify-center relative">
        <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
        {outOfStock && <OosBadge />}
      </div>
    );
  }

  const goTo = (next: number) => setIdx(((next % total) + total) % total);

  // Stop click bubbling so carousel buttons don't trigger the card's "open dialog"
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const prev = (e: React.MouseEvent) => { stop(e); goTo(idx - 1); };
  const next = (e: React.MouseEvent) => { stop(e); goTo(idx + 1); };

  const onTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchDeltaX.current = 0;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    touchDeltaX.current = e.touches[0].clientX - touchStartX.current;
    setDragOffset(touchDeltaX.current);
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const width = (e.currentTarget as HTMLElement).clientWidth;
    const delta = touchDeltaX.current;
    if (Math.abs(delta) > width * 0.15) {
      goTo(idx + (delta < 0 ? 1 : -1));
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
    setDragOffset(0);
  };

  return (
    <div
      className="aspect-square w-full bg-muted relative overflow-hidden group/carousel"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      <div
        className="flex h-full w-full will-change-transform"
        style={{
          transform: `translateX(calc(-${idx * 100}% + ${dragOffset}px))`,
          transition: dragOffset === 0 ? "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
        }}
      >
        {urls.map((url, i) => (
          <div key={url + i} className="w-full h-full shrink-0 overflow-hidden">
            <img
              src={`/api/storage${url}`}
              alt={`${alt} — photo ${i + 1}`}
              draggable={false}
              loading={i === 0 ? "eager" : "lazy"}
              className="w-full h-full object-cover select-none transition-transform duration-700 group-hover/carousel:scale-105"
            />
          </div>
        ))}
      </div>

      {outOfStock && <OosBadge />}

      {total > 1 && (
        <>
          <button
            onClick={prev}
            aria-label="Previous photo"
            className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 hover:scale-110 active:scale-95"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={next}
            aria-label="Next photo"
            className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-1.5 opacity-0 group-hover/carousel:opacity-100 transition-all duration-300 hover:scale-110 active:scale-95"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
            {urls.map((_, i) => (
              <button
                key={i}
                onClick={(e) => { e.stopPropagation(); goTo(i); }}
                aria-label={`Go to photo ${i + 1}`}
                className={[
                  "h-1.5 rounded-full transition-all duration-300 ease-out",
                  i === idx ? "w-5 bg-white shadow-md" : "w-1.5 bg-white/60 hover:bg-white/80",
                ].join(" ")}
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
    <div className="absolute inset-0 bg-background/50 flex items-center justify-center pointer-events-none">
      <span className="bg-background border text-foreground text-sm font-semibold px-4 py-1.5 rounded-full flex items-center gap-2">
        <PackageX className="w-4 h-4" /> Out of Stock
      </span>
    </div>
  );
}

// Convert a hex colour to the "H S% L%" format shadcn CSS variables use
function hexToHslVars(hex: string): string | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i);
  if (!m) return null;
  const r = parseInt(m[1].slice(0, 2), 16) / 255;
  const g = parseInt(m[1].slice(2, 4), 16) / 255;
  const b = parseInt(m[1].slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function Storefront() {
  const [match, params] = useRoute("/store/:slug");
  const slug = params?.slug ?? "";

  const { data: store, isLoading: isStoreLoading, error: storeError } = useGetStoreBySlug(slug, {
    query: { enabled: !!slug, queryKey: getGetStoreBySlugQueryKey(slug) },
  });

  const { data: products, isLoading: isProductsLoading, error: productsError } = useListProducts(store?.id || 0, {
    query: { enabled: !!store?.id, queryKey: getListProductsQueryKey(store?.id || 0) },
  });

  const { items, addItem, removeItem, updateQuantity, clearCart, totalItems } = useCart(slug);
  const [cartOpen, setCartOpen] = useState(false);
  const [openProductId, setOpenProductId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Reviews summary + recent list (fetched once when the slug resolves)
  type ReviewItem = { id: number; rating: number; body: string | null; customerName: string | null; createdAt: string };
  const [reviews, setReviews] = useState<{ count: number; average: number; reviews: ReviewItem[] } | null>(null);
  useEffect(() => {
    if (!slug) return;
    (async () => {
      try {
        const r = await fetch(`/api/stores/${encodeURIComponent(slug)}/reviews`);
        if (!r.ok) return;
        setReviews(await r.json());
      } catch { /* non-blocking */ }
    })();
  }, [slug]);

  // Apply store's brand accent colour as a CSS variable override
  useEffect(() => {
    const accent = store?.accentColor;
    if (!accent) return;
    const hsl = hexToHslVars(accent);
    if (!hsl) return;
    document.documentElement.style.setProperty("--primary", hsl);
    // White foreground for dark colours, dark for light ones
    const lightness = parseFloat(hsl.split(" ")[2]);
    document.documentElement.style.setProperty(
      "--primary-foreground",
      lightness < 55 ? "0 0% 100%" : "222.2 47.4% 11.2%",
    );
    return () => {
      document.documentElement.style.removeProperty("--primary");
      document.documentElement.style.removeProperty("--primary-foreground");
    };
  }, [store?.accentColor]);

  const filteredProducts = useMemo(() => {
    if (!searchQuery.trim()) return products;
    const q = searchQuery.toLowerCase();
    return products?.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.description ?? "").toLowerCase().includes(q),
    );
  }, [products, searchQuery]);

  // Group products by category if any have one set
  type ProductRow = NonNullable<typeof products>[number];
  const categorized = useMemo<Array<{ name: string; items: ProductRow[] }> | null>(() => {
    if (!filteredProducts) return null;
    const map = new Map<string, ProductRow[]>();
    const uncategorized: ProductRow[] = [];
    for (const p of filteredProducts) {
      const cat = (p as ProductRow & { category?: string | null }).category?.trim();
      if (cat) {
        if (!map.has(cat)) map.set(cat, []);
        map.get(cat)!.push(p);
      } else {
        uncategorized.push(p);
      }
    }
    if (map.size === 0) return null; // no categories at all — use flat grid
    const sections = [...map.entries()].map(([name, items]) => ({ name, items }));
    if (uncategorized.length > 0) sections.push({ name: "Other", items: uncategorized });
    return sections;
  }, [filteredProducts]);

  // The product currently selected for the detail dialog
  const openProduct = useMemo<DetailProduct | null>(() => {
    if (openProductId === null || !products) return null;
    const p = products.find((x) => x.id === openProductId) as (ProductRow & { images?: { url: string }[] }) | undefined;
    if (!p) return null;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      price: p.price,
      imageUrl: p.imageUrl,
      inStock: p.inStock,
      hasVariants: p.hasVariants,
      variants: p.variants,
      images: p.images,
    };
  }, [openProductId, products]);

  // Sum cart quantity for the open product across all variants (used as "X in cart" hint)
  const inCartQuantityForOpen = useMemo(() => {
    if (!openProduct) return 0;
    return items.filter((i) => i.id === openProduct.id).reduce((s, i) => s + i.quantity, 0);
  }, [items, openProduct]);

  const handleAddFromDialog = (variantLabel?: string) => {
    if (!openProduct) return;
    addItem({
      id: openProduct.id,
      name: openProduct.name,
      price: openProduct.price,
      imageUrl: openProduct.imageUrl,
      variantLabel,
    });
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
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-96 rounded-3xl" />
            ))}
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
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6"
          >
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
          {reviews && reviews.count > 0 && (
            <a
              href="#reviews"
              className="inline-flex items-center gap-1.5 mb-4 px-3 py-1 rounded-full bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
            >
              <Star className="w-4 h-4 fill-amber-400 text-amber-400" />
              <span className="font-semibold text-sm">{reviews.average.toFixed(1)}</span>
              <span className="text-xs text-amber-700/80 dark:text-amber-400/80">
                ({reviews.count} {reviews.count === 1 ? "review" : "reviews"})
              </span>
            </a>
          )}
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
              onChange={(e) => setSearchQuery(e.target.value)}
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
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-96 rounded-3xl" />
            ))}
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
            <button onClick={() => setSearchQuery("")} className="text-sm text-primary underline underline-offset-4">
              Clear search
            </button>
          </div>
        ) : (
          (() => {
            // Reusable card renderer
            const renderCard = (product: ProductRow, productIdx: number) => {
              const p = product as typeof product & { images?: { url: string }[] };
              const galleryUrls = (p.images ?? []).map((img: { url: string }) => img.url);
              const imageUrls = galleryUrls.length > 0 ? galleryUrls : product.imageUrl ? [product.imageUrl] : [];
              const hasVariants = product.hasVariants && product.variants.length > 0;
              const anyVariantInStock = hasVariants ? product.variants.some((v) => v.inStock) : true;
              const outOfStock = hasVariants ? !anyVariantInStock : product.inStock === false;
              const inCartCount = items.filter((i) => i.id === product.id).reduce((s, i) => s + i.quantity, 0);
              return (
                <Card
                  key={product.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setOpenProductId(product.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setOpenProductId(product.id); } }}
                  style={{ animationDelay: `${Math.min(productIdx, 8) * 60}ms` }}
                  className={`qs-card-in cursor-pointer overflow-hidden rounded-3xl border-border shadow-sm flex flex-col h-full bg-card transition-all duration-300 hover:shadow-lg hover:-translate-y-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 ${outOfStock ? "opacity-70" : ""}`}
                >
                  <ImageCarousel urls={imageUrls} alt={product.name} outOfStock={outOfStock} />
                  <CardContent className="p-4 sm:p-6 flex-1 flex flex-col">
                    <div className="flex justify-between items-start mb-2 gap-3">
                      <h3 className="font-bold text-lg sm:text-xl text-foreground line-clamp-1">{product.name}</h3>
                      <span className="font-bold text-primary bg-primary/10 px-3 py-1 rounded-full whitespace-nowrap text-sm">
                        {store?.currency} {product.price}
                      </span>
                    </div>
                    {product.description && (
                      <p className="text-muted-foreground text-sm leading-relaxed mb-4 line-clamp-2 flex-1">{product.description}</p>
                    )}
                    <div className="mt-auto pt-2 flex items-center justify-between text-sm">
                      <span className="text-muted-foreground flex items-center gap-1.5">
                        {hasVariants ? (<><span className="font-medium">{product.variants.length}</span> options</>)
                          : outOfStock ? (<span className="text-destructive flex items-center gap-1"><PackageX className="w-3.5 h-3.5" /> Out of stock</span>)
                          : inCartCount > 0 ? (<span className="text-primary font-medium">{inCartCount} in cart</span>)
                          : <>Tap for details</>}
                      </span>
                      <span className="text-primary font-semibold flex items-center gap-1">
                        View <ChevronsRight className="w-4 h-4" />
                      </span>
                    </div>
                  </CardContent>
                </Card>
              );
            };

            const grid = (prods: ProductRow[]) => (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-8 sm:gap-x-8 sm:gap-y-10">
                {prods.map((p, i) => renderCard(p, i))}
              </div>
            );

            if (categorized) {
              return (
                <div className="space-y-12">
                  {categorized.map(({ name, items: catItems }) => (
                    <section key={name}>
                      <div className="flex items-center gap-4 mb-6">
                        <h2 className="text-xl font-serif font-bold whitespace-nowrap">{name}</h2>
                        <div className="flex-1 h-px bg-border" />
                        <span className="text-sm text-muted-foreground whitespace-nowrap">
                          {catItems.length} {catItems.length === 1 ? "item" : "items"}
                        </span>
                      </div>
                      {grid(catItems)}
                    </section>
                  ))}
                </div>
              );
            }

            return grid(filteredProducts ?? []);
          })()
        )}
      </div>

      {/* Reviews section */}
      {reviews && reviews.count > 0 && (
        <div id="reviews" className="container mx-auto px-4 pb-16 max-w-5xl">
          <div className="border-t pt-12">
            <div className="flex items-end justify-between mb-6 gap-4">
              <div>
                <h2 className="text-2xl sm:text-3xl font-serif font-bold mb-1">What buyers say</h2>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <div className="flex">
                    {[1, 2, 3, 4, 5].map((n) => (
                      <Star
                        key={n}
                        className={`w-4 h-4 ${
                          n <= Math.round(reviews.average) ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm">
                    <span className="font-semibold text-foreground">{reviews.average.toFixed(1)}</span>{" "}
                    · {reviews.count} {reviews.count === 1 ? "review" : "reviews"}
                  </span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviews.reviews.slice(0, 8).map((r) => (
                <div key={r.id} className="bg-card border rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <Star
                          key={n}
                          className={`w-3.5 h-3.5 ${
                            n <= r.rating ? "fill-amber-400 text-amber-400" : "text-muted-foreground/30"
                          }`}
                        />
                      ))}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  {r.body && (
                    <p className="text-sm text-foreground/90 leading-relaxed mb-2 whitespace-pre-line">
                      {r.body}
                    </p>
                  )}
                  {r.customerName && (
                    <p className="text-xs text-muted-foreground">— {r.customerName}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <footer className="bg-muted py-12 border-t text-center">
        <Link
          href="/"
          className="text-muted-foreground flex items-center justify-center gap-2 hover:text-foreground transition-colors"
        >
          Powered by <ShoppingBag className="w-4 h-4" />{" "}
          <span className="font-serif font-bold text-foreground">QuickShop</span>
        </Link>
      </footer>

      {/* Product detail dialog (handles options + add to cart) */}
      <ProductDetailDialog
        open={openProductId !== null}
        onOpenChange={(o) => { if (!o) setOpenProductId(null); }}
        product={openProduct}
        currency={store?.currency ?? "GHS"}
        inCartQuantity={inCartQuantityForOpen}
        onAddToCart={handleAddFromDialog}
      />

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
