import { Image as ImageIcon, Loader2, Plus, Trash2, GripVertical } from "lucide-react";
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
  category?: string;
  hasVariants: boolean;
  variants: VariantRow[];
}

export interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<ProductFormValues>;
  onSubmit: (data: ProductFormValues) => void;
  editingProductId: number | null;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  handleUploadImage: (e: React.ChangeEvent<HTMLInputElement>) => void;
  isUploading: boolean;
  isCreatePending: boolean;
  isUpdatePending: boolean;
  storeCurrency: string | null | undefined;
}

const CATEGORY_PRESETS = [
  "Footwear",
  "Clothing",
  "Accessories",
  "Electronics",
  "Food & Drinks",
  "Beauty",
  "Home & Living",
  "Other",
];

export function ProductFormDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  editingProductId,
  fileInputRef,
  handleUploadImage,
  isUploading,
  isCreatePending,
  isUpdatePending,
  storeCurrency,
}: ProductFormDialogProps) {
  const hasVariants = form.watch("hasVariants");
  const variants = form.watch("variants") ?? [];

  const addVariant = () => {
    form.setValue("variants", [...variants, { label: "", inStock: true }]);
  };

  const removeVariant = (index: number) => {
    form.setValue("variants", variants.filter((_, i) => i !== index));
  };

  const updateVariantLabel = (index: number, label: string) => {
    const next = [...variants];
    next[index] = { ...next[index], label };
    form.setValue("variants", next);
  };

  const toggleVariantStock = (index: number) => {
    const next = [...variants];
    next[index] = { ...next[index], inStock: !next[index].inStock };
    form.setValue("variants", next);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[540px] rounded-3xl max-h-[90vh] overflow-y-auto">
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
            {/* Image upload */}
            <div className="flex flex-col items-center gap-4 mb-2">
              <div
                className="relative w-32 h-32 rounded-2xl overflow-hidden bg-muted border border-border flex items-center justify-center group cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              >
                {form.watch("imageUrl") ? (
                  <img src={`/api/storage${form.watch("imageUrl")}`} className="w-full h-full object-cover" alt="Preview" />
                ) : (
                  <ImageIcon className="w-8 h-8 text-muted-foreground" />
                )}
                <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-white text-xs font-medium">Upload Image</span>
                </div>
                {isUploading && (
                  <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                )}
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleUploadImage}
              />
            </div>

            {/* Name */}
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Air Max 90, Ankara Shirt" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Category */}
            <FormField
              control={form.control}
              name="category"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Category <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <Input placeholder="e.g. Footwear, Clothing, Electronics" {...field} value={field.value ?? ""} />
                      <div className="flex flex-wrap gap-1.5">
                        {CATEGORY_PRESETS.map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => field.onChange(field.value === cat ? "" : cat)}
                            className={[
                              "px-2.5 py-1 rounded-full text-xs font-medium border transition-all",
                              field.value === cat
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
                            ].join(" ")}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Price */}
            <FormField
              control={form.control}
              name="price"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Price</FormLabel>
                  <FormControl>
                    <div className="flex items-center">
                      <span className="text-muted-foreground bg-muted px-3 py-2 text-sm border border-r-0 rounded-l-md select-none font-medium">
                        {storeCurrency || "GHS"}
                      </span>
                      <Input
                        placeholder="0.00"
                        type="number"
                        min="0"
                        step="0.01"
                        className="rounded-l-none"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Floor price */}
            <FormField
              control={form.control}
              name="floorPrice"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Lowest Price <span className="text-muted-foreground font-normal">(optional)</span>
                  </FormLabel>
                  <FormControl>
                    <div className="flex items-center">
                      <span className="text-muted-foreground bg-muted px-3 py-2 text-sm border border-r-0 rounded-l-md select-none font-medium">
                        {storeCurrency || "GHS"}
                      </span>
                      <Input
                        placeholder="0.00"
                        type="number"
                        min="0"
                        step="0.01"
                        className="rounded-l-none"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <p className="text-xs text-muted-foreground mt-1">
                    The minimum your Telegram bot can accept when negotiating. Customers won't see this.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Description */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Describe your product..."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Variants toggle */}
            <div className="border rounded-2xl p-4 space-y-4 bg-muted/30">
              <FormField
                control={form.control}
                name="hasVariants"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between">
                      <div>
                        <FormLabel className="text-base font-semibold">Size / Option Variants</FormLabel>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Enable for shoes, clothing, or any item with multiple sizes/options
                        </p>
                      </div>
                      <FormControl>
                        <Switch
                          checked={field.value}
                          onCheckedChange={(checked) => {
                            field.onChange(checked);
                            if (checked && variants.length === 0) {
                              form.setValue("variants", [{ label: "", inStock: true }]);
                            }
                          }}
                        />
                      </FormControl>
                    </div>
                  </FormItem>
                )}
              />

              {hasVariants && (
                <div className="space-y-3">
                  <div className="space-y-2">
                    {variants.map((variant, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <GripVertical className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                        <Input
                          placeholder={`Size / option (e.g. S, M, L, 40, 42, Red)`}
                          value={variant.label}
                          onChange={e => updateVariantLabel(index, e.target.value)}
                          className="flex-1"
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Switch
                            checked={variant.inStock}
                            onCheckedChange={() => toggleVariantStock(index)}
                            id={`variant-stock-${index}`}
                          />
                          <Label
                            htmlFor={`variant-stock-${index}`}
                            className={`text-xs font-medium w-14 ${variant.inStock ? "text-green-600" : "text-muted-foreground"}`}
                          >
                            {variant.inStock ? "In stock" : "OOS"}
                          </Label>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeVariant(index)}
                          className="text-muted-foreground hover:text-destructive transition-colors p-1"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addVariant}
                    className="w-full rounded-xl"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Size / Option
                  </Button>
                  <p className="text-xs text-muted-foreground">
                    Toggle "In stock / OOS" for each size individually. Buyers will see grayed-out sizes when OOS.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
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
