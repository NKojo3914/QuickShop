import { useRef } from "react";
import { SlidersHorizontal, ShoppingBag, Loader2, Image as ImageIcon, Phone } from "lucide-react";
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

interface StoreSettingsFormValues {
  name: string;
  whatsappNumber: string;
  description?: string;
}

export interface StoreSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<StoreSettingsFormValues>;
  onSubmit: (data: StoreSettingsFormValues) => void;
  logoUrl: string;
  setLogoUrl: (url: string) => void;
  isLogoUploading: boolean;
  handleLogoUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  logoInputRef: React.RefObject<HTMLInputElement | null>;
  isUpdatePending: boolean;
}

export function StoreSettingsDialog({
  open,
  onOpenChange,
  form,
  onSubmit,
  logoUrl,
  setLogoUrl,
  isLogoUploading,
  handleLogoUpload,
  logoInputRef,
  isUpdatePending,
}: StoreSettingsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5" /> Store Settings
          </DialogTitle>
          <DialogDescription>
            Update your store info. Changes are reflected on your public page immediately.
          </DialogDescription>
        </DialogHeader>

        {/* Logo */}
        <div className="flex items-center gap-5 py-2">
          <div
            className="relative w-20 h-20 rounded-2xl overflow-hidden bg-muted border flex items-center justify-center group cursor-pointer shrink-0"
            onClick={() => logoInputRef.current?.click()}
          >
            {logoUrl ? (
              <img src={`/api/storage${logoUrl}`} className="w-full h-full object-cover" alt="Logo" />
            ) : (
              <ShoppingBag className="w-8 h-8 text-muted-foreground/40" />
            )}
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              {isLogoUploading
                ? <Loader2 className="w-5 h-5 text-white animate-spin" />
                : <ImageIcon className="w-5 h-5 text-white" />}
            </div>
          </div>
          <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
          <div>
            <p className="text-sm font-medium mb-0.5">Store Logo</p>
            <p className="text-xs text-muted-foreground">Click to upload. Shown on your public storefront.</p>
            {logoUrl && (
              <button
                className="text-xs text-destructive hover:underline mt-1"
                onClick={() => setLogoUrl("")}
              >
                Remove logo
              </button>
            )}
          </div>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Store Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Sunday Bakery" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="whatsappNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>WhatsApp Number</FormLabel>
                  <FormControl>
                    <div className="flex items-center">
                      <span className="text-muted-foreground bg-muted px-3 py-2 text-sm border border-r-0 rounded-l-md select-none">
                        <Phone className="w-4 h-4" />
                      </span>
                      <Input placeholder="+233XXXXXXXXX" className="rounded-l-none" {...field} />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Textarea placeholder="Tell customers what you sell..." className="resize-none" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" disabled={isUpdatePending || isLogoUploading}>
                {isUpdatePending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save Changes
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
