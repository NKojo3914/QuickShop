import { useRef, useState } from "react";
import { Image as ImageIcon, Loader2, Plus, Trash2, X } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

export interface VariantRow {
  label: string;
  inStock: boolean;
}

export interface ProductFormValues {
  name: string;
  description?: string;
  price: string;
  floorPrice?: string;
  imageUrl?: string;
  images: string[];
  category?: string;
  inStock: boolean;
  hasVariants: boolean;
  variants: VariantRow[];
}

export interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<ProductFormValues>;
  onSubmit: (data: ProductFormValues) => void;
  editingProductId: number | null;
  onUploadImage: (file: File) => Promise<string>;
  isUploading: boolean;
  isCreatePending: boolean;
  isUpdatePending: boolean;
  storeCurrency: string | null | undefined;
}

// ── Preset size groups ────────────────────────────────────────────────────────
const SIZE_GROUPS = [
  {
    label: "Clothing",
    sizes: ["XS", "S", "M", "L", "XL", "XXL", "XXXL"],
  },
  {
    label: "Shoes (EU)",
    sizes: ["36", "37", "38", "39", "40", "41", "42", "43", "44", "45", "46"],
  },
  {
    label: "Kids",
    sizes: ["2Y", "3Y", "4Y", "5Y", "6Y", "7Y", "8Y", "10Y", "12Y"],
  },
  {
    label: "One Size",
    sizes: ["One Size"],
  },
];

const CATEGORY_PRESETS = [
  "Footwear", "Clothing", "Accessories", "Electronics",
  "Food & Drinks", "Beauty", "Home & Living", "Other",
];

export function ProductFormDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  editingProductId,
  onUploadImage,
  isUploading,
  isCreatePending,
  isUpdatePending,
  storeCurrency,
}: ProductFormDialogProps) {
  const hasVariants = form.watch("hasVariants");
  const variants = form.watch("variants") ?? [];
  const images = form.watch("images") ?? [];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [customSize, setCustomSize] = useState("");

  // ── Image helpers ────────────────────────────────────────────────────────

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    for (const file of files) {
      const url = await onUploadImage(file);
      if (url) {
        const current = form.getValues("images") ?? [];
        const updated = [...current, url];
        form.setValue("images", updated);
        form.setValue("imageUrl", updated[0]);
      }
    }
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    form.setValue("images", updated);
    form.setValue("imageUrl", updated[0] ?? "");
  };

  // ── Variant helpers ──────────────────────────────────────────────────────

  const addVariant = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    // Don't add duplicates
    if (variants.some(v => v.label.toLowerCase() === trimmed.toLowerCase())) return;
    form.setValue("variants", [...variants, { label: trimmed, inStock: true }]);
  };

  const removeVariant = (index: number) => {
    form.setValue("variants", variants.filter((_, i) => i !== index));
  };

  const toggleVariantStock = (index: number) => {
    const next = [...variants];
    next[index] = { ...next[index], inStock: !next[index].inStock };
    form.setValue("variants", next);
  };

  const isPresetAdded = (size: string) =>
    variants.some(v => v.label.toLowerCase() === size.toLowerCase());

  const togglePreset = (size: string) => {
    if (isPresetAdded(size)) {
      form.setValue("variants", variants.filter(v => v.label.toLowerCase() !== size.toLowerCase()));
    } else {
      form.setValue("variants", [...variants, { label: size, inStock: true }]);
    }
  };

  const handleAddCustom = () => {
    addVariant(customSize);
    setCustomSize("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px] rounded-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif">
            {editingProductId ? "Edit Product" : "Add Product"}
          </DialogTitle>
          <DialogDescription>
            Details about your item that customers will see.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 py-4">

            {/* ── Image gallery ──────────────────────────────────────────── */}
            <div className="space-y-2">
              <p className="text-sm font-medium">
                Photos <span className="text-muted-foreground font-normal">(first photo is the main thumbnail)</span>
              </p>
              <div className="flex flex-wrap gap-3">
                {images.map((url, idx) => (
                  <div key={url + idx} className="relative w-24 h-24 rounded-2xl overflow-hidden border border-border group shrink-0">
                    <img src={`/api/storage${url}`} alt={`Photo ${idx + 1}`} className="w-full h-full object-cover" />
                    {idx === 0 && (
                      <span className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] font-medium text-center py-0.5">
                        Main
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeImage(idx)}
                      className="absolute top-1 right-1 bg-black/60 rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3 text-white" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-24 h-24 rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors shrink-0 disabled:opacity-50"
                >
                  {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <><Plus className="w-5 h-5" /><span className="text-[10px] font-medium">Add photo</span></>
                  )}
                </button>
              </div>
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" multiple onChange={handleFileChange} />
            </div>

            {/* ── Name ──────────────────────────────────────────────────── */}
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel>Product Name</FormLabel>
                <FormControl><Input placeholder="e.g. Air Max 90, Ankara Shirt" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── Category ─────────────────────────────────────────────── */}
            <FormField control={form.control} name="category" render={({ field }) => (
              <FormItem>
                <FormLabel>Category <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl>
                  <div className="space-y-2">
                    <Input placeholder="e.g. Footwear, Clothing, Electronics" {...field} value={field.value ?? ""} />
                    <div className="flex flex-wrap gap-1.5">
                      {CATEGORY_PRESETS.map(cat => (
                        <button key={cat} type="button"
                          onClick={() => field.onChange(field.value === cat ? "" : cat)}
                          className={[
                            "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                            field.value === cat
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                          ].join(" ")}
                        >{cat}</button>
                      ))}
                    </div>
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── Price ────────────────────────────────────────────────── */}
            <FormField control={form.control} name="price" render={({ field }) => (
              <FormItem>
                <FormLabel>Price</FormLabel>
                <FormControl>
                  <div className="flex items-center">
                    <span className="text-muted-foreground bg-muted px-3 py-2 text-sm border border-r-0 rounded-l-md select-none font-medium">{storeCurrency || "GHS"}</span>
                    <Input placeholder="0.00" type="number" min="0" step="0.01" className="rounded-l-none" {...field} />
                  </div>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── Floor price ──────────────────────────────────────────── */}
            <FormField control={form.control} name="floorPrice" render={({ field }) => (
              <FormItem>
                <FormLabel>Lowest Price <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                <FormControl>
                  <div className="flex items-center">
                    <span className="text-muted-foreground bg-muted px-3 py-2 text-sm border border-r-0 rounded-l-md select-none font-medium">{storeCurrency || "GHS"}</span>
                    <Input placeholder="0.00" type="number" min="0" step="0.01" className="rounded-l-none" {...field} />
                  </div>
                </FormControl>
                <p className="text-xs text-muted-foreground mt-1">The minimum your Telegram bot can accept when negotiating. Customers won't see this.</p>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── Description ──────────────────────────────────────────── */}
            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl><Textarea placeholder="Describe your product..." className="resize-none" {...field} /></FormControl>
                <FormMessage />
              </FormItem>
            )} />

            {/* ── In-stock toggle (non-variant products only) ───────────── */}
            {!hasVariants && (
              <FormField control={form.control} name="inStock" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between rounded-2xl border px-4 py-3 bg-muted/30">
                    <div>
                      <FormLabel className="text-base font-semibold">{field.value ? "In Stock" : "Out of Stock"}</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {field.value ? "Customers can add this item to their cart" : "Item won't be purchasable on the storefront"}
                      </p>
                    </div>
                    <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                  </div>
                </FormItem>
              )} />
            )}

            {/* ── Variants ─────────────────────────────────────────────── */}
            <div className="border rounded-2xl p-4 space-y-4 bg-muted/30">
              {/* Toggle */}
              <FormField control={form.control} name="hasVariants" render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <div>
                      <FormLabel className="text-base font-semibold">Size / Option Variants</FormLabel>
                      <p className="text-xs text-muted-foreground mt-0.5">Enable for shoes, clothing, or any item with multiple sizes/options</p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={(checked) => {
                        field.onChange(checked);
                        if (!checked) form.setValue("variants", []);
                      }} />
                    </FormControl>
                  </div>
                </FormItem>
              )} />

              {hasVariants && (
                <div className="space-y-4">

                  {/* Preset size groups */}
                  <div className="space-y-3">
                    {SIZE_GROUPS.map(group => (
                      <div key={group.label}>
                        <p className="text-xs font-semibold text-muted-foreground mb-1.5">{group.label}</p>
                        <div className="flex flex-wrap gap-1.5">
                          {group.sizes.map(size => {
                            const added = isPresetAdded(size);
                            return (
                              <button
                                key={size}
                                type="button"
                                onClick={() => togglePreset(size)}
                                className={[
                                  "px-2.5 py-1 rounded-lg text-xs font-medium border transition-all",
                                  added
                                    ? "bg-primary text-primary-foreground border-primary"
                                    : "bg-background border-border text-foreground hover:border-primary/50",
                                ].join(" ")}
                              >
                                {added ? "✓ " : ""}{size}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}

                    {/* Custom / Other input */}
                    <div>
                      <p className="text-xs font-semibold text-muted-foreground mb-1.5">Other / Custom</p>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Type a custom size or option…"
                          value={customSize}
                          onChange={e => setCustomSize(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddCustom(); } }}
                          className="flex-1"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleAddCustom}
                          disabled={!customSize.trim()}
                          className="shrink-0"
                        >
                          <Plus className="w-4 h-4 mr-1" /> Add
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Added variants list */}
                  {variants.length > 0 && (
                    <div className="space-y-2 pt-2 border-t">
                      <p className="text-xs font-semibold text-muted-foreground">Added sizes / options</p>
                      <div className="space-y-1.5">
                        {variants.map((variant, index) => (
                          <div key={index} className="flex items-center gap-2 bg-background rounded-xl px-3 py-2 border">
                            <span className="flex-1 text-sm font-medium">{variant.label}</span>
                            <Switch
                              checked={variant.inStock}
                              onCheckedChange={() => toggleVariantStock(index)}
                              id={`vs-${index}`}
                            />
                            <Label
                              htmlFor={`vs-${index}`}
                              className={`text-xs font-medium w-14 cursor-pointer ${variant.inStock ? "text-green-600" : "text-muted-foreground"}`}
                            >
                              {variant.inStock ? "In stock" : "OOS"}
                            </Label>
                            <button
                              type="button"
                              onClick={() => removeVariant(index)}
                              className="text-muted-foreground hover:text-destructive transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {variants.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">
                      Tap a size above or type a custom one to get started
                    </p>
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isCreatePending || isUpdatePending || isUploading}>
                {editingProductId ? "Save Changes" : "Add Product"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
