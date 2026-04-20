import { MessageCircle, Phone, Loader2 } from "lucide-react";
import type { UseFormReturn } from "react-hook-form";
import type { UseMutationResult } from "@tanstack/react-query";
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

interface LogOrderFormValues {
  customerName?: string;
  customerPhone?: string;
  summary: string;
}

export interface LogOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  form: UseFormReturn<LogOrderFormValues>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  logOrderMutation: UseMutationResult<any, Error, LogOrderFormValues, unknown>;
}

export function LogOrderDialog({ open, onOpenChange, form, logOrderMutation }: LogOrderDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px] rounded-3xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-serif flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-green-600" /> Log WhatsApp Order
          </DialogTitle>
          <DialogDescription>
            Record an order placed via WhatsApp so you can track it on your dashboard.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((data) => logOrderMutation.mutate(data))}
            className="space-y-4 py-2"
          >
            <FormField
              control={form.control}
              name="customerName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Customer Name <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Kofi Mensah" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="customerPhone"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number <span className="text-muted-foreground font-normal">(optional)</span></FormLabel>
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
              name="summary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Order Summary</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="e.g. 2x Tom Ford Jacket @ GHS 300, 1x Sneakers @ GHS 180. Total: GHS 780"
                      className="resize-none"
                      rows={3}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button
                type="submit"
                disabled={logOrderMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                {logOrderMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Log Order
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
