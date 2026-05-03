import { useState, useRef, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Store,
  LogOut,
  ShoppingBag,
  ExternalLink,
  Send,
  Package,
  ChevronDown,
  Coins,
  SlidersHorizontal,
  Banknote,
  BarChart2,
  Tag,
} from "lucide-react";
import {
  useGetStoreBySlug,
  getGetStoreBySlugQueryKey,
  useUpdateStore,
  useSetupTelegramWebhook,
  useGetStoreSummary,
  getGetStoreSummaryQueryKey,
  useListProducts,
  getListProductsQueryKey,
  useCreateProduct,
  useUpdateProduct,
  useDeleteProduct,
  useRequestUploadUrl,
  useListOrders,
  getListOrdersQueryKey,
  useUpdateOrder,
  useLogout,
  type Product,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

import { StoreHeader } from "@/components/dashboard/StoreHeader";
import { ProductsGrid } from "@/components/dashboard/ProductsGrid";
import { ProductFormDialog, type VariantRow } from "@/components/dashboard/ProductFormDialog";
import { OrdersSidebar } from "@/components/dashboard/OrdersSidebar";
import { LogOrderDialog } from "@/components/dashboard/LogOrderDialog";
import { StoreSettingsDialog } from "@/components/dashboard/StoreSettingsDialog";
import { TelegramSettingsDialog } from "@/components/dashboard/TelegramSettingsDialog";
import { CurrencyDialog } from "@/components/dashboard/CurrencyDialog";
import { QrCodeDialog } from "@/components/dashboard/QrCodeDialog";
import { PayoutSetupDialog } from "@/components/dashboard/PayoutSetupDialog";
import { AnalyticsDialog } from "@/components/dashboard/AnalyticsDialog";
import { PromoCodesDialog } from "@/components/dashboard/PromoCodesDialog";

// ─── Schemas ──────────────────────────────────────────────────────────────────

const variantRowSchema = z.object({
  label: z.string(),
  inStock: z.boolean(),
});

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.string().min(1, "Price is required"),
  floorPrice: z.string().optional(),
  imageUrl: z.string().optional(),
  images: z.array(z.string()),
  category: z.string().optional(),
  inStock: z.boolean(),
  hasVariants: z.boolean(),
  variants: z.array(variantRowSchema),
});
type ProductFormValues = z.infer<typeof productSchema>;

const storeSettingsSchema = z.object({
  name: z.string().min(2, "Store name must be at least 2 characters"),
  whatsappNumber: z.string().min(10, "Please enter a valid WhatsApp number"),
  description: z.string().max(200, "Max 200 characters").optional(),
  deliveryFee: z.string().optional(),
});
type StoreSettingsFormValues = z.infer<typeof storeSettingsSchema>;

const logOrderSchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  summary: z.string().min(1, "Order summary is required"),
});
type LogOrderFormValues = z.infer<typeof logOrderSchema>;

// ─── Component ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const [match, params] = useRoute("/manage/:slug");
  const slug = params?.slug;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: store, isLoading: isStoreLoading, error: storeError } = useGetStoreBySlug(slug || "", {
    query: { enabled: !!slug, queryKey: getGetStoreBySlugQueryKey(slug || "") }
  });
  const { data: summary } = useGetStoreSummary(store?.id || 0, {
    query: { enabled: !!store?.id, queryKey: getGetStoreSummaryQueryKey(store?.id || 0) }
  });
  const { data: products, isLoading: isProductsLoading } = useListProducts(store?.id || 0, {
    query: { enabled: !!store?.id, queryKey: getListProductsQueryKey(store?.id || 0) }
  });
  const { data: orders, isLoading: isOrdersLoading } = useListOrders(store?.id || 0, {
    query: {
      enabled: !!store?.id,
      queryKey: getListOrdersQueryKey(store?.id || 0),
      refetchInterval: 30000,
    }
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createProductMutation = useCreateProduct();
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();
  const requestUploadUrlMutation = useRequestUploadUrl();
  const updateStoreMutation = useUpdateStore();
  const setupTelegramWebhookMutation = useSetupTelegramWebhook();
  const updateOrderMutation = useUpdateOrder();
  const logoutMutation = useLogout();
  const logOrderMutation = useMutation({
    mutationFn: async (data: LogOrderFormValues) => {
      const res = await fetch(`/api/stores/${store?.id}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error || "Failed to log order");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(store?.id || 0) });
      queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(store?.id || 0) });
      logOrderForm.reset();
      setIsLogOrderOpen(false);
      toast({ title: "Order logged!", description: "The WhatsApp order has been saved." });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Failed to log order", description: err.message });
    },
  });

  // ── Dialog / UI state ─────────────────────────────────────────────────────
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  const [ordersOpen, setOrdersOpen] = useState(false);
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);
  const [isLogOrderOpen, setIsLogOrderOpen] = useState(false);
  const [isTelegramSettingsOpen, setIsTelegramSettingsOpen] = useState(false);
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isStoreSettingsOpen, setIsStoreSettingsOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [isPayoutSetupOpen, setIsPayoutSetupOpen] = useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = useState(false);
  const [isPromoCodesOpen, setIsPromoCodesOpen] = useState(false);
  const [shippingOrderId, setShippingOrderId] = useState<number | null>(null);
  const [verifyingOrderId, setVerifyingOrderId] = useState<number | null>(null);

  // ── Form-level state ──────────────────────────────────────────────────────
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [currency, setCurrency] = useState("GHS");
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  // ── Forms ─────────────────────────────────────────────────────────────────
  const storeSettingsForm = useForm<StoreSettingsFormValues>({
    resolver: zodResolver(storeSettingsSchema),
    defaultValues: { name: "", whatsappNumber: "", description: "", deliveryFee: "" },
  });
  const productForm = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: { name: "", description: "", price: "", floorPrice: "", imageUrl: "", images: [], category: "", inStock: true, hasVariants: false, variants: [] },
  });
  const logOrderForm = useForm<LogOrderFormValues>({
    resolver: zodResolver(logOrderSchema),
    defaultValues: { customerName: "", customerPhone: "", summary: "" },
  });

  // Sync store data into local state when loaded
  useEffect(() => {
    if (store) {
      setTelegramToken(store.telegramBotToken || "");
      setTelegramUsername(store.telegramBotUsername || "");
      setCurrency(store.currency || "GHS");
      setLogoUrl(store.logoUrl || "");
      storeSettingsForm.reset({
        name: store.name,
        whatsappNumber: store.whatsappNumber,
        description: store.description || "",
        deliveryFee: (store as { deliveryFee?: string | null }).deliveryFee ?? "0",
      });
    }
  }, [store]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => { queryClient.clear(); setLocation("/login"); },
    });
  };

  const handleUpdateOrderStatus = (orderId: number, status: string) => {
    updateOrderMutation.mutate({ id: orderId, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(store?.id || 0) });
      }
    });
  };

  const [recheckingOrderId, setRecheckingOrderId] = useState<number | null>(null);

  // Manually re-verify a pending order's payment with Paystack — used when the
  // webhook didn't reach us (or the buyer never returned to the callback page)
  // so the order is stuck in `paymentStatus: pending` despite a successful charge.
  const handleRecheckPayment = async (orderId: number, paymentReference: string) => {
    setRecheckingOrderId(orderId);
    try {
      const res = await fetch(`/api/payments/verify/${encodeURIComponent(paymentReference)}`, {
        credentials: "include",
      });
      const data = await res.json() as { status?: string; error?: string };
      if (!res.ok) throw new Error(data.error || "Verification failed");
      if (data.status === "success") {
        toast({ title: "Payment confirmed", description: "Order is ready to ship." });
      } else {
        toast({ title: `Payment status: ${data.status ?? "unknown"}`, description: "If the buyer paid, ask them to wait a moment and try again." });
      }
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(store?.id || 0) });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Couldn't re-check payment",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setRecheckingOrderId(null);
    }
  };

  const handleShipOrder = async (orderId: number) => {
    setShippingOrderId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/ship`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to mark shipped");
      toast({ title: "Marked as shipped", description: "The buyer has been notified." });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(store?.id || 0) });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Failed to mark shipped",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setShippingOrderId(null);
    }
  };

  const handleVerifyDelivery = async (orderId: number, code: string) => {
    setVerifyingOrderId(orderId);
    try {
      const res = await fetch(`/api/orders/${orderId}/verify-delivery`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await res.json() as { error?: string; payout?: number; currency?: string };
      if (!res.ok) throw new Error(data.error || "Failed to verify delivery code");
      toast({
        title: "Delivery confirmed!",
        description: data.payout
          ? `${data.currency || store?.currency || "GHS"} ${data.payout} sent to your account.`
          : "Funds released to seller.",
      });
      queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(store?.id || 0) });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Code verification failed",
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setVerifyingOrderId(null);
    }
  };

  const handleSaveTelegramSettings = async () => {
    if (!store?.slug) return;
    try {
      await updateStoreMutation.mutateAsync({
        slug: store.slug,
        data: {
          telegramBotToken: telegramToken || undefined,
          telegramBotUsername: telegramUsername || undefined,
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetStoreBySlugQueryKey(store.slug) });
    } catch {
      toast({ variant: "destructive", title: "Failed to save Telegram settings" });
      return;
    }
    if (telegramToken) {
      try {
        await setupTelegramWebhookMutation.mutateAsync({ slug: store.slug });
      } catch { /* polling mode fallback */ }
    }
    toast({ title: "Telegram bot connected!", description: "Your bot is now linked to your store." });
    setIsTelegramSettingsOpen(false);
  };

  const handleSaveCurrency = async () => {
    if (!store?.slug || !currency.trim()) return;
    try {
      await updateStoreMutation.mutateAsync({ slug: store.slug, data: { currency: currency.trim() } });
      queryClient.invalidateQueries({ queryKey: getGetStoreBySlugQueryKey(store.slug) });
      toast({ title: "Currency updated!" });
      setIsCurrencyOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to update currency" });
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsLogoUploading(true);
      const res = await requestUploadUrlMutation.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      await fetch(res.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      setLogoUrl(res.objectPath);
      toast({ title: "Logo uploaded" });
    } catch {
      toast({ variant: "destructive", title: "Logo upload failed" });
    } finally {
      setIsLogoUploading(false);
    }
  };

  const handleSaveStoreSettings = async (data: StoreSettingsFormValues) => {
    if (!store?.slug) return;
    try {
      await updateStoreMutation.mutateAsync({
        slug: store.slug,
        data: {
          name: data.name,
          whatsappNumber: data.whatsappNumber,
          description: data.description,
          logoUrl: logoUrl || undefined,
          ...(data.deliveryFee !== undefined && data.deliveryFee !== ""
            ? { deliveryFee: data.deliveryFee }
            : {}),
        },
      });
      queryClient.invalidateQueries({ queryKey: getGetStoreBySlugQueryKey(store.slug) });
      toast({ title: "Store updated!" });
      setIsStoreSettingsOpen(false);
    } catch {
      toast({ variant: "destructive", title: "Failed to update store" });
    }
  };

  const handleToggleStock = (product: { id: number; inStock: boolean }) => {
    if (!store?.id) return;
    updateProductMutation.mutate(
      { id: product.id, data: { inStock: !product.inStock } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(store.id) });
          toast({ title: product.inStock ? "Marked as out of stock" : "Marked as in stock" });
        },
      }
    );
  };

  const handleUploadImageFile = async (file: File): Promise<string> => {
    setIsUploading(true);
    try {
      const res = await requestUploadUrlMutation.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type }
      });
      await fetch(res.uploadURL, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      return res.objectPath;
    } catch {
      toast({ variant: "destructive", title: "Upload failed", description: "Could not upload image." });
      return "";
    } finally {
      setIsUploading(false);
    }
  };

  const openCreateModal = () => {
    productForm.reset({ name: "", description: "", price: "", floorPrice: "", imageUrl: "", images: [], category: "", inStock: true, hasVariants: false, variants: [] });
    setEditingProductId(null);
    setIsProductModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    const p = product as Product & {
      category?: string | null;
      hasVariants?: boolean;
      variants?: VariantRow[];
      images?: { url: string }[];
    };
    // Collect all gallery image URLs; if none, fall back to imageUrl
    const galleryUrls = (p.images ?? []).map((img: { url: string }) => img.url);
    const imagesList = galleryUrls.length > 0 ? galleryUrls : (product.imageUrl ? [product.imageUrl] : []);
    productForm.reset({
      name: product.name,
      description: product.description || "",
      price: product.price,
      floorPrice: product.floorPrice || "",
      imageUrl: imagesList[0] || "",
      images: imagesList,
      category: p.category || "",
      inStock: product.inStock,
      hasVariants: p.hasVariants ?? false,
      variants: (p.variants ?? []).map(v => ({ label: v.label, inStock: v.inStock })),
    });
    setEditingProductId(product.id);
    setIsProductModalOpen(true);
  };

  const onSubmitProduct = (data: ProductFormValues) => {
    if (!store?.id) return;
    const payload = {
      ...data,
      floorPrice: data.floorPrice?.trim() || undefined,
      category: data.category?.trim() || undefined,
      inStock: data.hasVariants ? undefined : data.inStock,
      imageUrl: data.images[0] || undefined,
      images: data.images,
      variants: data.hasVariants
        ? data.variants.filter((v: VariantRow) => v.label.trim()).map((v: VariantRow, i: number) => ({ label: v.label.trim(), inStock: v.inStock, sortOrder: i }))
        : [],
    };
    const describeError = (err: unknown): string => {
      if (err instanceof Error) return err.message;
      if (typeof err === "object" && err !== null) {
        const e = err as { error?: string; message?: string; response?: { data?: { error?: string } } };
        return e.response?.data?.error || e.error || e.message || "Unknown error";
      }
      return String(err);
    };
    if (editingProductId) {
      updateProductMutation.mutate({ id: editingProductId, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(store.id) });
          queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(store.id) });
          setIsProductModalOpen(false);
          toast({ title: "Product updated" });
        },
        onError: (err) => {
          console.error("Update product failed:", err);
          toast({ variant: "destructive", title: "Couldn't update product", description: describeError(err) });
        },
      });
    } else {
      createProductMutation.mutate({ storeId: store.id, data: payload }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(store.id) });
          queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(store.id) });
          setIsProductModalOpen(false);
          toast({ title: "Product added" });
        },
        onError: (err) => {
          console.error("Create product failed:", err);
          toast({ variant: "destructive", title: "Couldn't add product", description: describeError(err) });
        },
      });
    }
  };

  const handleDeleteProduct = (id: number) => {
    if (!store?.id) return;
    deleteProductMutation.mutate({ id }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(store.id) });
        queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(store.id) });
        toast({ title: "Product deleted" });
      }
    });
  };

  const copyStoreLink = () => {
    const url = `${window.location.origin}/store/${store?.slug}`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(url).then(
        () => toast({ title: "Store link copied to clipboard!" }),
        () => fallbackCopy(url),
      );
    } else {
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (text: string) => {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.opacity = "0";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
    toast({ title: "Store link copied to clipboard!" });
  };

  const downloadQr = () => {
    const svg = document.getElementById("store-qr-code");
    if (!svg) return;
    const serializer = new XMLSerializer();
    const svgStr = serializer.serializeToString(svg);
    const canvas = document.createElement("canvas");
    const size = 512;
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    const img = new Image();
    img.onload = () => {
      ctx?.drawImage(img, 0, 0, size, size);
      const a = document.createElement("a");
      a.download = `${store?.slug ?? "store"}-qr.png`;
      a.href = canvas.toDataURL("image/png");
      a.click();
    };
    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgStr)));
  };

  // ── Guards ────────────────────────────────────────────────────────────────

  if (!match) return null;

  if (storeError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <h2 className="text-2xl font-bold mb-4">Store not found</h2>
        <Button onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  // Badge counts orders that need seller attention: unpaid pending orders +
  // paid orders not yet shipped (the "Mark Shipped" queue).
  const pendingCount = orders?.filter((o: { status: string; paymentStatus?: string | null; shippedAt?: string | null }) => {
    const isUnpaidPending = o.status === "pending" && o.paymentStatus !== "paid";
    const needsShipping = o.paymentStatus === "paid" && !o.shippedAt && o.status !== "completed" && o.status !== "cancelled";
    return isUnpaidPending || needsShipping;
  }).length ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      {/* ── Header ── */}
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="font-serif font-bold text-lg tracking-tight text-foreground">QuickShop</span>
          </Link>

          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/store/${store?.slug}`} target="_blank">
                <ExternalLink className="w-4 h-4 mr-1.5" /> View Store
              </Link>
            </Button>

            <Button variant="outline" size="sm" className="relative" onClick={() => setOrdersOpen(true)}>
              <Package className="w-4 h-4 mr-1.5" /> Orders
              {pendingCount > 0 && (
                <Badge className="ml-1.5 h-5 min-w-[20px] px-1.5 text-xs bg-amber-500 hover:bg-amber-500 text-white border-0">
                  {pendingCount}
                </Badge>
              )}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="flex items-center gap-2 px-2">
                  <Avatar className="w-7 h-7">
                    <AvatarFallback className="bg-primary text-primary-foreground text-xs font-bold">
                      {store?.name?.[0]?.toUpperCase() ?? "S"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden sm:inline text-sm font-medium max-w-[120px] truncate">
                    {store?.name ?? "My Store"}
                  </span>
                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-xs text-muted-foreground font-normal">
                  {store?.slug ? `quickshop.com/store/${store.slug}` : "My Store"}
                </DropdownMenuLabel>
                <DropdownMenuItem onClick={() => setIsStoreSettingsOpen(true)}>
                  <SlidersHorizontal className="w-4 h-4 mr-2 text-muted-foreground" />
                  Store Settings
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setIsTelegramSettingsOpen(true)}>
                  <Send className="w-4 h-4 mr-2 text-blue-500" />
                  Telegram Bot
                  {store?.telegramBotUsername && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-green-500" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsCurrencyOpen(true)}>
                  <Coins className="w-4 h-4 mr-2 text-amber-500" />
                  Currency
                  <span className="ml-auto text-xs text-muted-foreground">{store?.currency ?? "GHS"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsPayoutSetupOpen(true)}>
                  <Banknote className="w-4 h-4 mr-2 text-emerald-500" />
                  Payout Details
                  {(store as { paystackAccountNumber?: string | null } | undefined)?.paystackAccountNumber && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-green-500" />
                  )}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsPromoCodesOpen(true)}>
                  <Tag className="w-4 h-4 mr-2 text-rose-500" />
                  Promo Codes
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setIsAnalyticsOpen(true)}>
                  <BarChart2 className="w-4 h-4 mr-2 text-violet-500" />
                  Analytics
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={handleLogout}
                  disabled={logoutMutation.isPending}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Log out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main className="flex-1 container mx-auto px-4 py-8 max-w-5xl">
        {isStoreLoading ? (
          <div className="space-y-8">
            <Skeleton className="h-32 w-full rounded-2xl" />
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Skeleton className="h-64 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
              <Skeleton className="h-64 rounded-2xl" />
            </div>
          </div>
        ) : store ? (
          <>
            <StoreHeader
              store={store}
              summary={summary}
              copyStoreLink={copyStoreLink}
              onQrOpen={() => setIsQrOpen(true)}
              onAddProduct={openCreateModal}
            />
            <ProductsGrid
              store={store}
              summary={summary}
              products={products}
              isProductsLoading={isProductsLoading}
              onAddProduct={openCreateModal}
              onEditProduct={openEditModal}
              onDeleteProduct={handleDeleteProduct}
              onToggleStock={handleToggleStock}
              isUpdatePending={updateProductMutation.isPending}
            />
          </>
        ) : null}
      </main>

      {/* ── Dialogs ── */}
      <QrCodeDialog
        open={isQrOpen}
        onOpenChange={setIsQrOpen}
        storeSlug={store?.slug}
        copyStoreLink={copyStoreLink}
        downloadQr={downloadQr}
      />
      <StoreSettingsDialog
        open={isStoreSettingsOpen}
        onOpenChange={setIsStoreSettingsOpen}
        form={storeSettingsForm}
        onSubmit={handleSaveStoreSettings}
        logoUrl={logoUrl}
        setLogoUrl={setLogoUrl}
        isLogoUploading={isLogoUploading}
        handleLogoUpload={handleLogoUpload}
        logoInputRef={logoInputRef}
        isUpdatePending={updateStoreMutation.isPending}
        storeCurrency={store?.currency}
      />
      <TelegramSettingsDialog
        open={isTelegramSettingsOpen}
        onOpenChange={setIsTelegramSettingsOpen}
        telegramToken={telegramToken}
        setTelegramToken={setTelegramToken}
        telegramUsername={telegramUsername}
        setTelegramUsername={setTelegramUsername}
        storeTelegramBotUsername={store?.telegramBotUsername}
        onSave={handleSaveTelegramSettings}
        isUpdatePending={updateStoreMutation.isPending}
        isWebhookPending={setupTelegramWebhookMutation.isPending}
      />
      <CurrencyDialog
        open={isCurrencyOpen}
        onOpenChange={setIsCurrencyOpen}
        currency={currency}
        setCurrency={setCurrency}
        onSave={handleSaveCurrency}
        isUpdatePending={updateStoreMutation.isPending}
      />
      <ProductFormDialog
        open={isProductModalOpen}
        onOpenChange={setIsProductModalOpen}
        form={productForm}
        onSubmit={onSubmitProduct}
        editingProductId={editingProductId}
        onUploadImage={handleUploadImageFile}
        isUploading={isUploading}
        isCreatePending={createProductMutation.isPending}
        isUpdatePending={updateProductMutation.isPending}
        storeCurrency={store?.currency}
      />
      <LogOrderDialog
        open={isLogOrderOpen}
        onOpenChange={setIsLogOrderOpen}
        form={logOrderForm}
        logOrderMutation={logOrderMutation}
      />
      <OrdersSidebar
        open={ordersOpen}
        onOpenChange={setOrdersOpen}
        orders={orders}
        isOrdersLoading={isOrdersLoading}
        expandedOrderId={expandedOrderId}
        setExpandedOrderId={setExpandedOrderId}
        onUpdateOrderStatus={handleUpdateOrderStatus}
        isUpdatePending={updateOrderMutation.isPending}
        onLogOrderOpen={() => setIsLogOrderOpen(true)}
        onShipOrder={handleShipOrder}
        onVerifyDelivery={handleVerifyDelivery}
        onRecheckPayment={handleRecheckPayment}
        shippingOrderId={shippingOrderId}
        verifyingOrderId={verifyingOrderId}
        recheckingOrderId={recheckingOrderId}
        storeCurrency={store?.currency}
      />
      {store?.slug && (
        <PayoutSetupDialog
          open={isPayoutSetupOpen}
          onOpenChange={setIsPayoutSetupOpen}
          storeSlug={store.slug}
          storeCurrency={store.currency || "GHS"}
          existing={{
            bankCode: (store as { paystackBankCode?: string | null }).paystackBankCode ?? null,
            accountNumber: (store as { paystackAccountNumber?: string | null }).paystackAccountNumber ?? null,
            accountName: (store as { paystackAccountName?: string | null }).paystackAccountName ?? null,
            recipientCode: (store as { paystackRecipientCode?: string | null }).paystackRecipientCode ?? null,
          }}
          onSaved={() => queryClient.invalidateQueries({ queryKey: getGetStoreBySlugQueryKey(store.slug) })}
        />
      )}
      <AnalyticsDialog
        open={isAnalyticsOpen}
        onOpenChange={setIsAnalyticsOpen}
        storeSlug={store?.slug}
      />
      <PromoCodesDialog
        open={isPromoCodesOpen}
        onOpenChange={setIsPromoCodesOpen}
        storeId={store?.id}
        storeCurrency={store?.currency || "GHS"}
      />
    </div>
  );
}
