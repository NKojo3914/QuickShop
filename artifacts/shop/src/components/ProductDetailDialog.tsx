import { useEffect, useRef, useState } from "react";
import {
  ShoppingCart,
  Plus,
  Check,
  PackageX,
  Pencil,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

// Match the storefront's product type loosely so we don't need to import generated types here
export interface DetailProduct {
  id: number;
  name: string;
  description?: string | null;
  price: string;
  imageUrl?: string | null;
  inStock: boolean;
  hasVariants: boolean;
  variants: { id: number; label: string; inStock: boolean }[];
  images?: { url: string }[];
}

export interface ProductDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product: DetailProduct | null;
  currency: string;
  /** Quantity already in the cart for the currently-selected variant (for "Add Again" hint) */
  inCartQuantity: number;
  onAddToCart: (variantLabel?: string) => void;
}

export function ProductDetailDialog({
  open,
  onOpenChange,
  product,
  currency,
  inCartQuantity,
  onAddToCart,
}: ProductDetailDialogProps) {
  // Local state — reset whenever a different product opens
  const [imageIdx, setImageIdx] = useState(0);
  const [selectedLabel, setSelectedLabel] = useState<string>("");
  const [isOtherSelected, setIsOtherSelected] = useState(false);
  const [otherText, setOtherText] = useState("");
  const [justAdded, setJustAdded] = useState(false);
  const otherInputRef = useRef<HTMLInputElement | null>(null);

  // Touch / swipe state for the dialog carousel
  const touchStartX = useRef<number | null>(null);
  const touchDeltaX = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);

  // Reset state when product changes or dialog closes
  useEffect(() => {
    if (!open || !product) {
      setImageIdx(0);
      setSelectedLabel("");
      setIsOtherSelected(false);
      setOtherText("");
      setJustAdded(false);
      setDragOffset(0);
    }
  }, [open, product?.id]);

  if (!product) return null;

  // Build full image list (gallery first, fall back to imageUrl)
  const galleryUrls = (product.images ?? []).map((img) => img.url);
  const imageUrls = galleryUrls.length > 0 ? galleryUrls : product.imageUrl ? [product.imageUrl] : [];
  const totalImages = imageUrls.length;

  // Variant logic
  const hasVariants = product.hasVariants && product.variants.length > 0;
  const selectedVariant = hasVariants && !isOtherSelected
    ? product.variants.find((v) => v.label === selectedLabel)
    : undefined;
  const anyVariantInStock = hasVariants ? product.variants.some((v) => v.inStock) : true;
  const outOfStock = hasVariants ? !anyVariantInStock : product.inStock === false;
  const selectedVariantOos =
    hasVariants && !isOtherSelected && selectedLabel ? selectedVariant?.inStock === false : false;

  const effectiveLabel = isOtherSelected ? otherText.trim() : selectedLabel;
  const hasValidSelection =
    !hasVariants ||
    (isOtherSelected ? otherText.trim().length > 0 : !!selectedLabel && !selectedVariantOos);
  const canAdd = !outOfStock && hasValidSelection;

  const goToImage = (next: number) => {
    if (totalImages === 0) return;
    setImageIdx(((next % totalImages) + totalImages) % totalImages);
  };

  const handleAdd = () => {
    if (!canAdd) return;
    onAddToCart(effectiveLabel || undefined);
    setJustAdded(true);
    setTimeout(() => setJustAdded(false), 1500);
  };

  // Touch swipe
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
      goToImage(imageIdx + (delta < 0 ? 1 : -1));
    }
    touchStartX.current = null;
    touchDeltaX.current = 0;
    setDragOffset(0);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] p-0 rounded-3xl overflow-hidden max-h-[92vh] overflow-y-auto">
        {/* Hidden a11y title/description so screen readers know what the dialog is */}
        <DialogTitle className="sr-only">{product.name}</DialogTitle>
        <DialogDescription className="sr-only">
          {product.description ?? `Choose options for ${product.name}`}
        </DialogDescription>

        {/* ── Image carousel ─────────────────────────────────────────────── */}
        <div
          className="aspect-square w-full bg-muted relative overflow-hidden"
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {totalImages === 0 ? (
            <div className="w-full h-full flex items-center justify-center">
              <ImageIcon className="w-14 h-14 text-muted-foreground/30" />
            </div>
          ) : (
            <div
              className="flex h-full w-full will-change-transform"
              style={{
                transform: `translateX(calc(-${imageIdx * 100}% + ${dragOffset}px))`,
                transition:
                  dragOffset === 0 ? "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)" : "none",
              }}
            >
              {imageUrls.map((url, i) => (
                <div key={url + i} className="w-full h-full shrink-0 overflow-hidden">
                  <img
                    src={`/api/storage${url}`}
                    alt={`${product.name} — photo ${i + 1}`}
                    draggable={false}
                    className="w-full h-full object-cover select-none"
                  />
                </div>
              ))}
            </div>
          )}

          {outOfStock && (
            <div className="absolute inset-0 bg-background/50 flex items-center justify-center pointer-events-none">
              <span className="bg-background border text-foreground text-sm font-semibold px-4 py-1.5 rounded-full flex items-center gap-2">
                <PackageX className="w-4 h-4" /> Out of Stock
              </span>
            </div>
          )}

          {/* Arrows + dots */}
          {totalImages > 1 && (
            <>
              <button
                onClick={() => goToImage(imageIdx - 1)}
                aria-label="Previous photo"
                className="absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => goToImage(imageIdx + 1)}
                aria-label="Next photo"
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-all duration-200 hover:scale-110 active:scale-95"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
              <div className="absolute bottom-3 left-0 right-0 flex justify-center gap-1.5">
                {imageUrls.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => goToImage(i)}
                    aria-label={`Go to photo ${i + 1}`}
                    className={[
                      "h-1.5 rounded-full transition-all duration-300 ease-out",
                      i === imageIdx ? "w-5 bg-white shadow-md" : "w-1.5 bg-white/60 hover:bg-white/80",
                    ].join(" ")}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Body ──────────────────────────────────────────────────────── */}
        <div className="p-5 sm:p-6 space-y-5">
          <div className="flex justify-between items-start gap-4">
            <h2 className="font-bold text-2xl font-serif text-foreground leading-tight">
              {product.name}
            </h2>
            <span className="font-bold text-primary bg-primary/10 px-3 py-1 rounded-full whitespace-nowrap text-base">
              {currency} {product.price}
            </span>
          </div>

          {product.description && (
            <p className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
              {product.description}
            </p>
          )}

          {/* Variant picker */}
          {hasVariants && (
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                Select Size / Option
              </p>
              <div className="flex flex-wrap gap-2">
                {product.variants.map((variant) => {
                  const isSelected = selectedLabel === variant.label && !isOtherSelected;
                  const isOos = !variant.inStock;
                  return (
                    <button
                      key={variant.id}
                      onClick={() => {
                        if (isOos) return;
                        setIsOtherSelected(false);
                        setSelectedLabel(isSelected ? "" : variant.label);
                      }}
                      className={[
                        "px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ease-out select-none",
                        isOos
                          ? "opacity-40 cursor-not-allowed border-border text-muted-foreground line-through"
                          : isSelected
                          ? "bg-primary text-primary-foreground border-primary shadow-md scale-105"
                          : "bg-background border-border text-foreground hover:border-primary/60 hover:scale-105 active:scale-95",
                      ].join(" ")}
                    >
                      {variant.label}
                    </button>
                  );
                })}

                {/* Other / Custom */}
                <button
                  onClick={() => {
                    const next = !isOtherSelected;
                    setIsOtherSelected(next);
                    if (next) {
                      setSelectedLabel("");
                      setTimeout(() => otherInputRef.current?.focus(), 50);
                    }
                  }}
                  className={[
                    "px-3.5 py-2 rounded-lg text-sm font-medium border transition-all duration-200 ease-out select-none flex items-center gap-1.5",
                    isOtherSelected
                      ? "bg-primary text-primary-foreground border-primary shadow-md scale-105"
                      : "bg-background border-dashed border-border text-muted-foreground hover:border-primary/60 hover:text-foreground hover:scale-105 active:scale-95",
                  ].join(" ")}
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Other
                </button>
              </div>

              {isOtherSelected && (
                <div className="qs-slide-down">
                  <input
                    ref={otherInputRef}
                    type="text"
                    value={otherText}
                    onChange={(e) => setOtherText(e.target.value)}
                    placeholder="Type your preferred size or option…"
                    className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-primary/40 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30 transition-shadow"
                  />
                </div>
              )}

              {!selectedLabel && !isOtherSelected && (
                <p className="text-xs text-muted-foreground">
                  Pick a size or choose "Other" to type your own
                </p>
              )}
              {selectedVariantOos && (
                <p className="text-xs text-destructive flex items-center gap-1">
                  <PackageX className="w-3 h-3" /> This size is out of stock
                </p>
              )}
              {isOtherSelected && !otherText.trim() && (
                <p className="text-xs text-muted-foreground">Type your option above to continue</p>
              )}
            </div>
          )}

          {/* Add to cart */}
          <Button
            onClick={handleAdd}
            disabled={!canAdd}
            size="lg"
            variant={justAdded ? "default" : inCartQuantity > 0 ? "secondary" : "default"}
            className={`w-full rounded-2xl h-12 transition-all duration-300 ease-out active:scale-[0.98] ${
              justAdded ? "scale-[1.02] shadow-lg" : ""
            }`}
          >
            {outOfStock ? (
              <>
                <PackageX className="w-5 h-5 mr-2" /> Out of Stock
              </>
            ) : hasVariants && !selectedLabel && !isOtherSelected ? (
              <>
                <ShoppingCart className="w-5 h-5 mr-2" /> Select a Size
              </>
            ) : isOtherSelected && !otherText.trim() ? (
              <>
                <Pencil className="w-5 h-5 mr-2" /> Type your option above
              </>
            ) : selectedVariantOos ? (
              <>
                <PackageX className="w-5 h-5 mr-2" /> Out of Stock
              </>
            ) : justAdded ? (
              <>
                <Check className="w-5 h-5 mr-2" /> Added to Cart!
              </>
            ) : inCartQuantity > 0 ? (
              <>
                <Plus className="w-5 h-5 mr-2" /> Add Again ({inCartQuantity} in cart)
              </>
            ) : (
              <>
                <ShoppingCart className="w-5 h-5 mr-2" /> Add to Cart
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
