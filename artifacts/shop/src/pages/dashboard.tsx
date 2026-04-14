import { useState, useRef, useEffect } from "react";
import { useRoute, Link, useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import {
  Store,
  Plus,
  Pencil,
  Trash2,
  Link as LinkIcon,
  Image as ImageIcon,
  Copy,
  LogOut,
  ShoppingBag,
  ExternalLink,
  Loader2,
  Send,
  CheckCircle2,
  Clock,
  Package,
  CircleCheck,
  User,
  ChevronDown,
  Coins,
  PackageX,
  SlidersHorizontal,
  Phone,
  QrCode,
  Download,
  MessageCircle,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
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
  type Order,
  type Product,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

const productSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  price: z.string().min(1, "Price is required"),
  floorPrice: z.string().optional(),
  imageUrl: z.string().optional(),
});
type ProductFormValues = z.infer<typeof productSchema>;

const storeSettingsSchema = z.object({
  name: z.string().min(2, "Store name must be at least 2 characters"),
  whatsappNumber: z.string().min(10, "Please enter a valid WhatsApp number"),
  description: z.string().max(200, "Max 200 characters").optional(),
});
type StoreSettingsFormValues = z.infer<typeof storeSettingsSchema>;

const logOrderSchema = z.object({
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  summary: z.string().min(1, "Order summary is required"),
});
type LogOrderFormValues = z.infer<typeof logOrderSchema>;

function orderRef(id: number) {
  return `QS-${String(id).padStart(4, "0")}`;
}

export default function Dashboard() {
  const [match, params] = useRoute("/manage/:slug");
  const slug = params?.slug;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();

  const { data: store, isLoading: isStoreLoading, error: storeError } = useGetStoreBySlug(slug || "", {
    query: {
      enabled: !!slug,
      queryKey: getGetStoreBySlugQueryKey(slug || "")
    }
  });

  const { data: summary } = useGetStoreSummary(store?.id || 0, {
    query: {
      enabled: !!store?.id,
      queryKey: getGetStoreSummaryQueryKey(store?.id || 0)
    }
  });

  const { data: products, isLoading: isProductsLoading } = useListProducts(store?.id || 0, {
    query: {
      enabled: !!store?.id,
      queryKey: getListProductsQueryKey(store?.id || 0)
    }
  });

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProductId, setEditingProductId] = useState<number | null>(null);
  
  const createProductMutation = useCreateProduct();
  const updateProductMutation = useUpdateProduct();
  const deleteProductMutation = useDeleteProduct();
  const requestUploadUrlMutation = useRequestUploadUrl();
  const updateStoreMutation = useUpdateStore();
  const setupTelegramWebhookMutation = useSetupTelegramWebhook();
  const updateOrderMutation = useUpdateOrder();
  const logoutMutation = useLogout();
  const [isLogOrderOpen, setIsLogOrderOpen] = useState(false);
  const logOrderForm = useForm<LogOrderFormValues>({
    resolver: zodResolver(logOrderSchema),
    defaultValues: { customerName: "", customerPhone: "", summary: "" },
  });
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

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        queryClient.clear();
        setLocation("/login");
      },
    });
  };

  const { data: orders, isLoading: isOrdersLoading } = useListOrders(store?.id || 0, {
    query: {
      enabled: !!store?.id,
      queryKey: getListOrdersQueryKey(store?.id || 0),
      refetchInterval: 30000,
    }
  });

  const [ordersOpen, setOrdersOpen] = useState(false);
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [isTelegramSettingsOpen, setIsTelegramSettingsOpen] = useState(false);
  const [currency, setCurrency] = useState("GHS");
  const [isCurrencyOpen, setIsCurrencyOpen] = useState(false);
  const [isStoreSettingsOpen, setIsStoreSettingsOpen] = useState(false);
  const [isQrOpen, setIsQrOpen] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string>("");
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const storeSettingsForm = useForm<StoreSettingsFormValues>({
    resolver: zodResolver(storeSettingsSchema),
    defaultValues: { name: "", whatsappNumber: "", description: "" },
  });

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
      });
    }
  }, [store]);

  const handleUpdateOrderStatus = (orderId: number, status: string) => {
    updateOrderMutation.mutate({ id: orderId, data: { status } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOrdersQueryKey(store?.id || 0) });
      }
    });
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

    // Attempt webhook registration separately — failure is non-fatal in polling/dev mode.
    if (telegramToken) {
      try {
        await setupTelegramWebhookMutation.mutateAsync({ slug: store.slug });
      } catch {
        // Webhook setup failed (e.g. no public URL in dev). Token is still saved — polling mode handles it.
      }
    }

    toast({ title: "Telegram bot connected!", description: "Your bot is now linked to your store." });
    setIsTelegramSettingsOpen(false);
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setIsLogoUploading(true);
      const res = await requestUploadUrlMutation.mutateAsync({
        data: { name: file.name, size: file.size, contentType: file.type },
      });
      await fetch(res.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
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
        data: { ...data, logoUrl: logoUrl || undefined },
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

  const form = useForm<ProductFormValues>({
    resolver: zodResolver(productSchema),
    defaultValues: {
      name: "",
      description: "",
      price: "",
      floorPrice: "",
      imageUrl: "",
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleUploadImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsUploading(true);
      const res = await requestUploadUrlMutation.mutateAsync({
        data: {
          name: file.name,
          size: file.size,
          contentType: file.type
        }
      });

      await fetch(res.uploadURL, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file
      });

      form.setValue("imageUrl", res.objectPath);
      toast({ title: "Image uploaded successfully" });
    } catch (err) {
      toast({ 
        variant: "destructive",
        title: "Upload failed", 
        description: "Could not upload image." 
      });
    } finally {
      setIsUploading(false);
    }
  };

  const openCreateModal = () => {
    form.reset({ name: "", description: "", price: "", floorPrice: "", imageUrl: "" });
    setEditingProductId(null);
    setIsProductModalOpen(true);
  };

  const openEditModal = (product: Product) => {
    form.reset({
      name: product.name,
      description: product.description || "",
      price: product.price,
      floorPrice: product.floorPrice || "",
      imageUrl: product.imageUrl || "",
    });
    setEditingProductId(product.id);
    setIsProductModalOpen(true);
  };

  const onSubmit = (data: ProductFormValues) => {
    if (!store?.id) return;

    const payload = {
      ...data,
      floorPrice: data.floorPrice?.trim() || undefined,
    };

    if (editingProductId) {
      updateProductMutation.mutate({
        id: editingProductId,
        data: payload
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(store.id) });
          queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(store.id) });
          setIsProductModalOpen(false);
          toast({ title: "Product updated" });
        }
      });
    } else {
      createProductMutation.mutate({
        storeId: store.id,
        data: payload
      }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey(store.id) });
          queryClient.invalidateQueries({ queryKey: getGetStoreSummaryQueryKey(store.id) });
          setIsProductModalOpen(false);
          toast({ title: "Product added" });
        }
      });
    }
  };

  const handleDelete = (id: number) => {
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

  if (!match) return null;
  
  if (storeError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <h2 className="text-2xl font-bold mb-4">Store not found</h2>
        <Button onClick={() => setLocation("/")}>Go Home</Button>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link href="/" className="flex items-center gap-2">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <span className="font-serif font-bold text-lg tracking-tight text-foreground">QuickShop</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/store/${store?.slug}`} target="_blank">
                <ExternalLink className="w-4 h-4 mr-1.5" /> View Store
              </Link>
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="relative"
              onClick={() => setOrdersOpen(true)}
            >
              <Package className="w-4 h-4 mr-1.5" /> Orders
              {(() => {
                const pendingCount = orders?.filter(o => o.status === "pending").length ?? 0;
                return pendingCount > 0 ? (
                  <Badge className="ml-1.5 h-5 min-w-[20px] px-1.5 text-xs bg-amber-500 hover:bg-amber-500 text-white border-0">
                    {pendingCount}
                  </Badge>
                ) : null;
              })()}
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
            <div className="bg-card border rounded-3xl p-5 sm:p-8 mb-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-sm">
              <div className="min-w-0">
                <h1 className="text-2xl sm:text-3xl font-serif font-bold text-foreground mb-2">{store.name}</h1>
                <p className="text-muted-foreground flex items-center gap-2 text-sm truncate">
                  <LinkIcon className="w-4 h-4 shrink-0" /> quickshop.com/store/{store.slug}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 w-full md:w-auto">
                <Button onClick={copyStoreLink} variant="outline" className="rounded-full px-4 sm:px-6 flex-1 md:flex-none">
                  <Copy className="w-4 h-4 mr-2" /> Copy Link
                </Button>
                <Button onClick={() => setIsQrOpen(true)} variant="outline" className="rounded-full px-4 sm:px-6 flex-1 md:flex-none">
                  <QrCode className="w-4 h-4 mr-2" /> QR Code
                </Button>
                <Button onClick={openCreateModal} className="rounded-full px-4 sm:px-6 w-full sm:w-auto">
                  <Plus className="w-4 h-4 mr-2" /> Add Product
                </Button>
              </div>
            </div>

            {/* Analytics */}
            {summary && (
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-10">
                <div className="bg-card border rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Products</p>
                  <p className="text-2xl font-bold text-foreground">{summary.totalProducts}</p>
                </div>
                <div className="bg-card border rounded-2xl p-4">
                  <p className="text-xs text-muted-foreground mb-1">Total Orders</p>
                  <p className="text-2xl font-bold text-foreground">{summary.totalOrders}</p>
                </div>
                <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-2xl p-4">
                  <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">Pending</p>
                  <p className="text-2xl font-bold text-amber-700 dark:text-amber-400">{summary.pendingOrders}</p>
                </div>
                <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-2xl p-4">
                  <p className="text-xs text-green-700 dark:text-green-400 mb-1">Completed</p>
                  <p className="text-2xl font-bold text-green-700 dark:text-green-400">{summary.completedOrders}</p>
                </div>
              </div>
            )}

            <div className="mb-10">
              <h2 className="text-2xl font-serif font-bold text-foreground mb-6">
                Products {summary ? `(${summary.totalProducts})` : ''}
              </h2>

              {isProductsLoading ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-72 rounded-2xl" />)}
                </div>
              ) : products?.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed rounded-3xl bg-muted/50">
                  <div className="mx-auto w-16 h-16 bg-background rounded-full flex items-center justify-center shadow-sm mb-4">
                    <Store className="w-8 h-8 text-muted-foreground" />
                  </div>
                  <h3 className="text-xl font-medium text-foreground mb-2">No products yet</h3>
                  <p className="text-muted-foreground mb-6 max-w-md mx-auto">
                    Your stall is looking a bit empty. Add some products to start selling!
                  </p>
                  <Button onClick={openCreateModal} size="lg" className="rounded-full">
                    <Plus className="w-4 h-4 mr-2" /> Add Your First Product
                  </Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {products?.map((product: Product) => (
                    <Card key={product.id} className={`overflow-hidden rounded-2xl border-border shadow-sm group ${!product.inStock ? "opacity-60" : ""}`}>
                      {product.imageUrl ? (
                        <div className="aspect-square w-full bg-muted relative">
                          <img
                            src={`/api/storage${product.imageUrl}`}
                            alt={product.name}
                            className="w-full h-full object-cover"
                          />
                          {!product.inStock && (
                            <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                              <span className="bg-background border text-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5">
                                <PackageX className="w-3.5 h-3.5" /> Out of Stock
                              </span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="aspect-square w-full bg-muted flex items-center justify-center relative">
                          <ImageIcon className="w-12 h-12 text-muted-foreground/30" />
                          {!product.inStock && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <span className="bg-background border text-foreground text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1.5">
                                <PackageX className="w-3.5 h-3.5" /> Out of Stock
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                      <CardContent className="p-5">
                        <div className="flex justify-between items-start mb-2">
                          <h3 className="font-bold text-lg text-foreground line-clamp-1">{product.name}</h3>
                          <span className="font-medium text-primary shrink-0">{store?.currency} {product.price}</span>
                        </div>
                        {product.description && (
                          <p className="text-muted-foreground text-sm line-clamp-2 mb-4">
                            {product.description}
                          </p>
                        )}

                        <div className="flex gap-2 mt-4 pt-4 border-t opacity-100 md:opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="outline"
                            size="sm"
                            className={`rounded-full text-xs px-3 ${!product.inStock ? "text-amber-600 border-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-700" : "text-muted-foreground"}`}
                            onClick={() => handleToggleStock(product)}
                            disabled={updateProductMutation.isPending}
                          >
                            <PackageX className="w-3 h-3 mr-1" />
                            {product.inStock ? "In Stock" : "Out of Stock"}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="flex-1 rounded-full"
                            onClick={() => openEditModal(product)}
                          >
                            <Pencil className="w-3.5 h-3.5 mr-2" /> Edit
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="outline" size="sm" className="rounded-full px-3 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/20">
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete {product.name}?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  This action cannot be undone. This product will be permanently removed from your store.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(product.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                  Delete Product
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : null}
      </main>

      {/* QR Code Dialog */}
      <Dialog open={isQrOpen} onOpenChange={setIsQrOpen}>
        <DialogContent className="sm:max-w-[360px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif flex items-center gap-2">
              <QrCode className="w-5 h-5" /> Your Store QR Code
            </DialogTitle>
            <DialogDescription>
              Print this and stick it on your stall — customers scan to browse and order.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-6 py-4">
            <div className="bg-white p-5 rounded-2xl border shadow-sm">
              <QRCodeSVG
                id="store-qr-code"
                value={`${window.location.origin}/store/${store?.slug ?? ""}`}
                size={200}
                level="H"
                includeMargin={false}
              />
            </div>
            <p className="text-xs text-muted-foreground text-center break-all">
              {window.location.origin}/store/{store?.slug}
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" className="rounded-full flex-1" onClick={copyStoreLink}>
              <Copy className="w-4 h-4 mr-2" /> Copy Link
            </Button>
            <Button className="rounded-full flex-1" onClick={downloadQr}>
              <Download className="w-4 h-4 mr-2" /> Download PNG
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Store Settings Dialog */}
      <Dialog open={isStoreSettingsOpen} onOpenChange={setIsStoreSettingsOpen}>
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

          <Form {...storeSettingsForm}>
            <form onSubmit={storeSettingsForm.handleSubmit(handleSaveStoreSettings)} className="space-y-4">
              <FormField
                control={storeSettingsForm.control}
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
                control={storeSettingsForm.control}
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
                control={storeSettingsForm.control}
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
                <Button type="button" variant="outline" onClick={() => setIsStoreSettingsOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={updateStoreMutation.isPending || isLogoUploading}>
                  {updateStoreMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Changes
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isTelegramSettingsOpen} onOpenChange={setIsTelegramSettingsOpen}>
        <DialogContent className="sm:max-w-[500px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif flex items-center gap-2">
              <Send className="w-5 h-5 text-blue-500" /> Telegram AI Bot
            </DialogTitle>
            <DialogDescription>
              Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">@BotFather</a> on Telegram, then paste the token and username below.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Bot Token</label>
              <Input
                placeholder="e.g. 123456789:AAFBxxxxxxxxxxxxxxxxxxxxxxx"
                value={telegramToken}
                onChange={e => setTelegramToken(e.target.value)}
                type="password"
              />
              <p className="text-xs text-muted-foreground">From @BotFather — keep this secret</p>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Bot Username</label>
              <Input
                placeholder="e.g. @myshop_bot"
                value={telegramUsername}
                onChange={e => setTelegramUsername(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">The @username of your bot — shown as a button on your storefront</p>
            </div>
            {store?.telegramBotUsername && (
              <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-300">
                <p className="font-medium mb-1">To receive order notifications:</p>
                <p>Open your bot (<a href={`https://t.me/${store.telegramBotUsername.replace(/^@/, '')}`} target="_blank" rel="noopener noreferrer" className="underline font-mono">@{store.telegramBotUsername.replace(/^@/, '')}</a>) and send it <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1 rounded">/register</span>. You'll get a confirmation and receive a Telegram message each time a customer places an order.</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsTelegramSettingsOpen(false)}>Cancel</Button>
            <Button
              onClick={handleSaveTelegramSettings}
              disabled={updateStoreMutation.isPending || setupTelegramWebhookMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {(updateStoreMutation.isPending || setupTelegramWebhookMutation.isPending) && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Save & Connect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCurrencyOpen} onOpenChange={setIsCurrencyOpen}>
        <DialogContent className="sm:max-w-[400px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif">Store Currency</DialogTitle>
            <DialogDescription>
              Set the currency code or symbol shown on all your product prices (e.g. GHS, USD, €, £).
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <label className="text-sm font-medium mb-2 block">Currency code / symbol</label>
            <Input
              placeholder="e.g. GHS, USD, €"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              maxLength={10}
            />
            <p className="text-xs text-muted-foreground mt-2">Preview: <span className="font-semibold text-foreground">{currency} 25.00</span></p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCurrencyOpen(false)}>Cancel</Button>
            <Button
              onClick={async () => {
                if (!store?.slug || !currency.trim()) return;
                try {
                  await updateStoreMutation.mutateAsync({ slug: store.slug, data: { currency: currency.trim() } });
                  queryClient.invalidateQueries({ queryKey: getGetStoreBySlugQueryKey(store.slug) });
                  toast({ title: "Currency updated!" });
                  setIsCurrencyOpen(false);
                } catch {
                  toast({ variant: "destructive", title: "Failed to update currency" });
                }
              }}
              disabled={updateStoreMutation.isPending}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isProductModalOpen} onOpenChange={setIsProductModalOpen}>
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
                          {store?.currency || "GHS"}
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
                          {store?.currency || "GHS"}
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
                <Button type="button" variant="outline" onClick={() => setIsProductModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createProductMutation.isPending || updateProductMutation.isPending || isUploading}>
                  {editingProductId ? "Save Changes" : "Add Product"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Log WhatsApp Order Dialog */}
      <Dialog open={isLogOrderOpen} onOpenChange={setIsLogOrderOpen}>
        <DialogContent className="sm:max-w-[440px] rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-2xl font-serif flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-600" /> Log WhatsApp Order
            </DialogTitle>
            <DialogDescription>
              Record an order placed via WhatsApp so you can track it on your dashboard.
            </DialogDescription>
          </DialogHeader>
          <Form {...logOrderForm}>
            <form
              onSubmit={logOrderForm.handleSubmit((data) => logOrderMutation.mutate(data))}
              className="space-y-4 py-2"
            >
              <FormField
                control={logOrderForm.control}
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
                control={logOrderForm.control}
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
                control={logOrderForm.control}
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
                <Button type="button" variant="outline" onClick={() => setIsLogOrderOpen(false)}>Cancel</Button>
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

      {/* Orders Sidebar */}
      <Sheet open={ordersOpen} onOpenChange={setOrdersOpen}>
        <SheetContent side="right" className="w-full sm:w-[420px] p-0 flex flex-col [&>button:first-of-type]:hidden">
          <SheetHeader className="px-5 pt-5 pb-4 border-b shrink-0">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-xl font-serif flex items-center gap-2">
                <Package className="w-5 h-5" /> Orders
                {orders && orders.length > 0 && (
                  <Badge variant="secondary" className="ml-1 text-xs">
                    {orders.length}
                  </Badge>
                )}
              </SheetTitle>
              <Button
                size="sm"
                variant="outline"
                className="rounded-full text-xs gap-1.5 text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-800 dark:hover:bg-green-950/40"
                onClick={() => setIsLogOrderOpen(true)}
              >
                <MessageCircle className="w-3.5 h-3.5" /> Log WA Order
              </Button>
            </div>
          </SheetHeader>

          {isOrdersLoading ? (
            <div className="space-y-3 px-5 pt-4">
              {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
            </div>
          ) : (
            <Tabs defaultValue="pending" className="flex flex-col flex-1 min-h-0">
              <TabsList className="mx-5 mt-4 shrink-0">
                <TabsTrigger value="pending" className="flex-1 gap-1.5">
                  Pending
                  {(orders?.filter(o => o.status === "pending").length ?? 0) > 0 && (
                    <Badge className="h-4 px-1 text-[10px] bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                      {orders!.filter(o => o.status === "pending").length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="confirmed" className="flex-1 gap-1.5">
                  Confirmed
                  {(orders?.filter(o => o.status === "confirmed").length ?? 0) > 0 && (
                    <Badge className="h-4 px-1 text-[10px] bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100">
                      {orders!.filter(o => o.status === "confirmed").length}
                    </Badge>
                  )}
                </TabsTrigger>
                <TabsTrigger value="history" className="flex-1">History</TabsTrigger>
              </TabsList>

              {/* Pending tab */}
              <TabsContent value="pending" className="flex-1 overflow-y-auto px-5 pt-4 pb-6 mt-0">
                {!orders?.filter(o => o.status === "pending").length ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                      <CircleCheck className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground mb-1">All caught up!</p>
                    <p className="text-sm text-muted-foreground">No pending orders right now.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orders!.filter(o => o.status === "pending").map(order => (
                      <div key={order.id} className="bg-card border rounded-xl p-3.5 flex flex-col gap-2 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-semibold text-sm text-foreground truncate">{order.customerName || "Customer"}</span>
                            </div>
                            {order.customerPhone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 ml-5">
                                <Phone className="w-2.5 h-2.5" />{order.customerPhone}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">Pending</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{orderRef(order.id)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{order.summary}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{new Date(order.createdAt).toLocaleString()}
                          </span>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline"
                              className="h-7 text-xs rounded-full px-3 text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => handleUpdateOrderStatus(order.id, "cancelled")}
                              disabled={updateOrderMutation.isPending}>
                              <PackageX className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" variant="outline"
                              className="h-7 text-xs rounded-full px-3 text-blue-600 border-blue-300 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950/40"
                              onClick={() => handleUpdateOrderStatus(order.id, "confirmed")}
                              disabled={updateOrderMutation.isPending}>
                              <CircleCheck className="w-3 h-3 mr-1" /> Confirm
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Confirmed tab */}
              <TabsContent value="confirmed" className="flex-1 overflow-y-auto px-5 pt-4 pb-6 mt-0">
                {!orders?.filter(o => o.status === "confirmed").length ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                      <Package className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground mb-1">Nothing confirmed yet</p>
                    <p className="text-sm text-muted-foreground">Confirm pending orders to see them here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orders!.filter(o => o.status === "confirmed").map(order => (
                      <div key={order.id} className="bg-card border rounded-xl p-3.5 flex flex-col gap-2 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-semibold text-sm text-foreground truncate">{order.customerName || "Customer"}</span>
                            </div>
                            {order.customerPhone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 ml-5">
                                <Phone className="w-2.5 h-2.5" />{order.customerPhone}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">Confirmed</span>
                            <span className="text-[10px] font-mono text-muted-foreground">{orderRef(order.id)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{order.summary}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                            <Clock className="w-3 h-3" />{new Date(order.createdAt).toLocaleString()}
                          </span>
                          <div className="flex gap-1.5">
                            <Button size="sm" variant="outline"
                              className="h-7 text-xs rounded-full px-3 text-red-500 border-red-200 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
                              onClick={() => handleUpdateOrderStatus(order.id, "cancelled")}
                              disabled={updateOrderMutation.isPending}>
                              <PackageX className="w-3 h-3 mr-1" /> Cancel
                            </Button>
                            <Button size="sm" variant="outline"
                              className="h-7 text-xs rounded-full px-3 text-green-600 border-green-300 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-950/40"
                              onClick={() => handleUpdateOrderStatus(order.id, "completed")}
                              disabled={updateOrderMutation.isPending}>
                              <CheckCircle2 className="w-3 h-3 mr-1" /> Complete
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* History tab */}
              <TabsContent value="history" className="flex-1 overflow-y-auto px-5 pt-4 pb-6 mt-0">
                {!orders?.filter(o => o.status === "completed" || o.status === "cancelled").length ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mb-3">
                      <CheckCircle2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                    <p className="font-medium text-foreground mb-1">No history yet</p>
                    <p className="text-sm text-muted-foreground">Completed and cancelled orders will appear here.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {orders!.filter(o => o.status === "completed" || o.status === "cancelled").map(order => (
                      <div key={order.id} className="bg-card border rounded-xl p-3.5 flex flex-col gap-2 shadow-sm opacity-80">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-1.5">
                              <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                              <span className="font-semibold text-sm text-foreground truncate">{order.customerName || "Customer"}</span>
                            </div>
                            {order.customerPhone && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5 ml-5">
                                <Phone className="w-2.5 h-2.5" />{order.customerPhone}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {order.status === "cancelled" ? (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 flex items-center gap-1">
                                <PackageX className="w-3 h-3" /> Cancelled
                              </span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> Done
                              </span>
                            )}
                            <span className="text-[10px] font-mono text-muted-foreground">{orderRef(order.id)}</span>
                          </div>
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{order.summary}</p>
                        <span className="text-xs text-muted-foreground/60 flex items-center gap-1">
                          <Clock className="w-3 h-3" />{new Date(order.createdAt).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}