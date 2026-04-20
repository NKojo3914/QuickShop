import { Image as ImageIcon, Loader2 } from "lucide-react";
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

interface ProductFormValues {
  name: string;
  description?: string;
  price: string;
  floorPrice?: string;
  imageUrl?: string;
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
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
            <div className="flex flex-col items-center gap-4 mb-2">
              <div className="relative w-32 h-32 rounded-2xl overflow-hidden bg-muted border border-border flex items-center justify-center group cursor-pointer" onClick={() => fileInputRef.current?.click()}>
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

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Product Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Sourdough Loaf" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Freshly baked every morning using our 10-year-old starter."
                      className="resize-none"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

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
