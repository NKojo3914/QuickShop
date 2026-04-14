import { useEffect, useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ShoppingBag,
  ArrowRight,
  Search,
  Store,
  Package,
  Check,
} from "lucide-react";
import { useCreateStore } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";

const createStoreSchema = z.object({
  name: z.string().min(2, "Store name must be at least 2 characters").max(50, "Store name must be less than 50 characters"),
  slug: z.string().min(2, "Slug must be at least 2 characters").regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
  description: z.string().max(200, "Description must be less than 200 characters").optional(),
  whatsappNumber: z.string().min(10, "Please enter a valid WhatsApp number").regex(/^\+?[1-9]\d{1,14}$/, "Must be a valid phone number, optionally starting with +"),
  currency: z.string().min(1, "Currency is required").max(10),
});

type CreateStoreFormValues = z.infer<typeof createStoreSchema>;

type StoreResult = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  logoUrl: string | null;
  currency: string;
  productCount: number;
};

type ProductResult = {
  id: number;
  name: string;
  price: string;
  description: string | null;
  imageUrl: string | null;
  inStock: boolean;
  storeId: number;
  storeName: string;
  storeSlug: string;
  currency: string;
};

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const createStoreMutation = useCreateStore();

  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const { data: myStore } = useQuery({
    queryKey: ["my-store"],
    queryFn: async () => {
      const res = await fetch("/api/auth/my-store");
      if (!res.ok) return null;
      return res.json() as Promise<{ slug: string; name: string }>;
    },
    enabled: isAuthenticated,
    retry: false,
  });

  useEffect(() => {
    if (myStore?.slug) {
      setLocation(`/manage/${myStore.slug}`);
    }
  }, [myStore]);

  // Default: list recent stores. On search: use unified search endpoint.
  const { data: recentStores, isLoading: recentLoading } = useQuery({
    queryKey: ["stores-recent"],
    queryFn: async () => {
      const res = await fetch("/api/stores?limit=12");
      if (!res.ok) throw new Error("Failed to fetch stores");
      return res.json() as Promise<StoreResult[]>;
    },
    enabled: !searchQuery,
  });

  const { data: searchResults, isLoading: searchLoading } = useQuery({
    queryKey: ["search", searchQuery],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}&limit=8`);
      if (!res.ok) throw new Error("Failed to search");
      return res.json() as Promise<{ stores: StoreResult[]; products: ProductResult[] }>;
    },
    enabled: !!searchQuery,
  });

  const isLoading = searchQuery ? searchLoading : recentLoading;

  const PENDING_STORE_KEY = "qs_pending_store";

  const form = useForm<CreateStoreFormValues>({
    resolver: zodResolver(createStoreSchema),
    defaultValues: (() => {
      try {
        const saved = sessionStorage.getItem(PENDING_STORE_KEY);
        if (saved) return JSON.parse(saved) as CreateStoreFormValues;
      } catch { /* ignore */ }
      return { name: "", slug: "", description: "", whatsappNumber: "", currency: "GHS" };
    })(),
  });

  const slugValue = form.watch("slug");

  function onSubmit(data: CreateStoreFormValues) {
    if (!isAuthenticated) {
      try { sessionStorage.setItem(PENDING_STORE_KEY, JSON.stringify(data)); } catch { /* ignore */ }
      setLocation("/register");
      return;
    }
    createStoreMutation.mutate(
      { data },
      {
        onSuccess: (store) => {
          try { sessionStorage.removeItem(PENDING_STORE_KEY); } catch { /* ignore */ }
          toast({
            title: "Store created!",
            description: "Welcome to your new QuickShop.",
          });
          setLocation(`/manage/${store.slug}`);
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Failed to create store",
            description: "That URL slug might already be taken.",
          });
        },
      }
    );
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    setSearchQuery(searchInput.trim());
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between max-w-6xl">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-2 rounded-xl">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <span className="font-serif font-bold text-xl tracking-tight">QuickShop</span>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log in</Link>
            </Button>
            <Button size="sm" className="rounded-full px-5" asChild>
              <a href="#create">Open Your Shop</a>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1">

        {/* ── Section 1: Hero / Store Finder ── */}
        <section className="relative overflow-hidden bg-card border-b">
          {/* subtle grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
            }}
          />

          <div className="container mx-auto px-4 max-w-6xl py-16 md:py-20 relative">
            {/* Headline */}
            <div className="text-center mb-10">
              <Badge variant="secondary" className="mb-5 rounded-full px-4 py-1 text-xs font-medium">
                🇬🇭 Built for Ghanaian sellers
              </Badge>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-serif font-bold text-foreground leading-[1.1] mb-4">
                Find a shop,{" "}
                <span className="text-primary">or open your own.</span>
              </h1>
              <p className="text-lg md:text-xl text-muted-foreground max-w-lg mx-auto leading-relaxed">
                Browse stores from Ghanaian sellers or set up yours in 60 seconds.
              </p>
            </div>

            {/* Search bar */}
            <form onSubmit={handleSearch} className="flex gap-2 max-w-xl mx-auto mb-10">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Search for a store or product..."
                  className="pl-9 h-11 rounded-xl"
                />
              </div>
              <Button type="submit" className="h-11 px-5 rounded-xl shrink-0">
                Search
              </Button>
            </form>

            {/* Results */}
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="bg-card border rounded-2xl p-5 animate-pulse">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-xl bg-muted shrink-0" />
                      <div className="flex-1 space-y-2">
                        <div className="h-4 bg-muted rounded w-3/4" />
                        <div className="h-3 bg-muted rounded w-1/3" />
                      </div>
                    </div>
                    <div className="h-3 bg-muted rounded w-full mb-2" />
                    <div className="h-3 bg-muted rounded w-2/3 mb-4" />
                    <div className="h-8 bg-muted rounded-xl w-full" />
                  </div>
                ))}
              </div>
            ) : searchQuery ? (
              /* ── Search results ── */
              <div className="space-y-8">
                {/* Store results */}
                {(searchResults?.stores.length ?? 0) > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Stores</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {searchResults!.stores.map(store => (
                        <div key={store.slug} className="bg-card border rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                              {store.logoUrl ? <img src={`/api/storage${store.logoUrl}`} alt={store.name} className="w-full h-full object-cover" /> : <ShoppingBag className="w-5 h-5 text-primary" />}
                            </div>
                            <div className="min-w-0">
                              <h3 className="font-bold text-foreground truncate">{store.name}</h3>
                              <p className="text-xs text-muted-foreground">{store.productCount} product{store.productCount !== 1 ? "s" : ""}</p>
                            </div>
                          </div>
                          {store.description && <p className="text-sm text-muted-foreground line-clamp-2">{store.description}</p>}
                          <Link href={`/store/${store.slug}`}>
                            <Button variant="outline" size="sm" className="w-full rounded-xl">Visit Store <ArrowRight className="w-3.5 h-3.5 ml-2" /></Button>
                          </Link>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Product results */}
                {(searchResults?.products.length ?? 0) > 0 && (
                  <div>
                    <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Products</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {searchResults!.products.map(product => (
                        <Link key={product.id} href={`/store/${product.storeSlug}`}>
                          <div className="bg-card border rounded-2xl overflow-hidden hover:shadow-md transition-shadow cursor-pointer">
                            {product.imageUrl ? (
                              <div className="aspect-video w-full bg-muted overflow-hidden">
                                <img src={`/api/storage${product.imageUrl}`} alt={product.name} className="w-full h-full object-cover" />
                              </div>
                            ) : (
                              <div className="aspect-video w-full bg-muted flex items-center justify-center">
                                <Package className="w-8 h-8 text-muted-foreground/30" />
                              </div>
                            )}
                            <div className="p-4">
                              <div className="flex justify-between items-start gap-2 mb-1">
                                <h3 className="font-bold text-foreground text-sm truncate">{product.name}</h3>
                                <span className="text-primary font-bold text-sm shrink-0">{product.currency} {product.price}</span>
                              </div>
                              <p className="text-xs text-muted-foreground">from <span className="font-medium text-foreground">{product.storeName}</span></p>
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </div>
                )}

                {/* No results */}
                {(searchResults?.stores.length ?? 0) === 0 && (searchResults?.products.length ?? 0) === 0 && (
                  <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
                    <Search className="w-10 h-10 opacity-30" />
                    <p className="font-medium">No results for "{searchQuery}"</p>
                    <p className="text-sm">Try a different search term.</p>
                    <Button variant="outline" size="sm" className="mt-1 rounded-xl" onClick={() => { setSearchQuery(""); setSearchInput(""); }}>Clear search</Button>
                  </div>
                )}
              </div>
            ) : (
              /* ── Default: recent stores ── */
              <>
                <p className="text-sm font-medium text-muted-foreground mb-5">Recently opened stores</p>
                {recentStores && recentStores.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {recentStores.map(store => (
                      <div key={store.slug} className="bg-card border rounded-2xl p-5 flex flex-col gap-3 hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                            {store.logoUrl ? <img src={`/api/storage${store.logoUrl}`} alt={store.name} className="w-full h-full object-cover" /> : <ShoppingBag className="w-5 h-5 text-primary" />}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-foreground truncate">{store.name}</h3>
                            <p className="text-xs text-muted-foreground">{store.productCount} product{store.productCount !== 1 ? "s" : ""}</p>
                          </div>
                        </div>
                        {store.description && <p className="text-sm text-muted-foreground line-clamp-2">{store.description}</p>}
                        <Link href={`/store/${store.slug}`}>
                          <Button variant="outline" size="sm" className="w-full rounded-xl">Visit Store <ArrowRight className="w-3.5 h-3.5 ml-2" /></Button>
                        </Link>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16 text-muted-foreground flex flex-col items-center gap-3">
                    <Package className="w-10 h-10 opacity-30" />
                    <p className="font-medium">No stores yet</p>
                    <p className="text-sm">Be the first to open your shop!</p>
                  </div>
                )}
              </>
            )}
          </div>
        </section>

        {/* ── Section 2: Seller CTA ── */}
        <section className="py-16 md:py-20 bg-muted/40 border-b">
          <div className="container mx-auto px-4 max-w-3xl text-center">
            <Badge variant="secondary" className="mb-5 rounded-full px-4 py-1 text-xs">Free to start</Badge>
            <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-4">
              Are you a seller?
            </h2>
            <p className="text-muted-foreground mb-8 text-lg leading-relaxed max-w-md mx-auto">
              Open your online stall in under 60 seconds. No tech skills needed.
            </p>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mb-10">
              <Button size="lg" className="rounded-full px-8 h-12 text-base" asChild>
                <a href="#create">
                  Create My Store <ArrowRight className="ml-2 w-4 h-4" />
                </a>
              </Button>
              <Button size="lg" variant="outline" className="rounded-full px-8 h-12 text-base" asChild>
                <Link href="/login">Log In</Link>
              </Button>
            </div>

            <ul className="inline-flex flex-col items-start gap-2.5 text-sm text-muted-foreground">
              {[
                "Your own link to share anywhere",
                "Orders straight to your WhatsApp",
                "AI Telegram bot available",
                "Upload product photos",
                "Free QR code to print",
              ].map((item) => (
                <li key={item} className="flex items-center gap-2.5">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                    <Check className="w-3 h-3 text-primary" />
                  </div>
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── Section 3: Create store form ── */}
        <section id="create" className="py-16 md:py-20 bg-background">
          <div className="container mx-auto px-4 max-w-5xl">
            <div className="flex flex-col lg:flex-row gap-8 lg:gap-16 items-start">

              {/* Left copy */}
              <div className="flex-1 lg:sticky lg:top-24">
                <Badge variant="secondary" className="mb-4 rounded-full px-4 py-1 text-xs">Open your store</Badge>
                <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground mb-4 leading-tight">
                  Open your shop today
                </h2>
                <p className="text-muted-foreground mb-6 leading-relaxed">
                  It takes less than a minute. No credit card, no downloads, no complicated setup.
                </p>
                <ul className="space-y-3">
                  {[
                    "Your own link to share anywhere",
                    "Orders straight to your WhatsApp",
                    "AI Telegram bot available",
                    "Upload product photos",
                    "Free QR code to print",
                  ].map((item) => (
                    <li key={item} className="flex items-center gap-3 text-sm text-muted-foreground">
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 text-primary" />
                      </div>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right form */}
              <div className="flex-1 w-full">
                <div className="bg-card border rounded-3xl p-5 sm:p-8 shadow-sm">
                  <h3 className="text-2xl font-serif font-bold text-foreground mb-1">Create your store</h3>
                  <p className="text-sm text-muted-foreground mb-7">Fill in the details below to get started.</p>

                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
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
                        name="slug"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Store URL</FormLabel>
                            <FormControl>
                              <div className="flex items-center">
                                <span className="text-muted-foreground bg-muted px-2 sm:px-3 py-2 text-xs sm:text-sm border border-r-0 rounded-l-md select-none whitespace-nowrap">
                                  quickshop.com/
                                </span>
                                <Input
                                  placeholder="sunday-bakery"
                                  className="rounded-l-none"
                                  {...field}
                                  onChange={(e) => {
                                    const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "");
                                    field.onChange(val);
                                  }}
                                />
                              </div>
                            </FormControl>
                            {slugValue && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Your store will be at{" "}
                                <span className="text-foreground font-medium">
                                  quickshop.com/store/{slugValue}
                                </span>
                              </p>
                            )}
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
                              <Input placeholder="+233XXXXXXXXX" type="tel" {...field} />
                            </FormControl>
                            <FormDescription>Where you'll receive orders.</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <FormField
                        control={form.control}
                        name="currency"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Currency</FormLabel>
                            <FormControl>
                              <Input placeholder="e.g. GHS, USD, €, £" maxLength={10} {...field} />
                            </FormControl>
                            <FormDescription>Used on all product prices.</FormDescription>
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
                              <Textarea
                                placeholder="Fresh bread baked every morning..."
                                className="resize-none"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      <Button
                        type="submit"
                        className="w-full rounded-xl h-12 text-base"
                        size="lg"
                        disabled={createStoreMutation.isPending}
                      >
                        {createStoreMutation.isPending ? "Creating..." : "Create My Store"}
                        {!createStoreMutation.isPending && <ArrowRight className="ml-2 w-4 h-4" />}
                      </Button>
                    </form>
                  </Form>
                </div>

                <div className="bg-card border rounded-3xl px-5 sm:px-8 py-5 mt-4 flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">Already have a store?</p>
                  <Button variant="outline" className="rounded-xl" asChild>
                    <Link href="/login">Log in</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t bg-card py-10">
        <div className="container mx-auto px-4 max-w-6xl">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="bg-primary text-primary-foreground p-1.5 rounded-lg">
                <ShoppingBag className="w-4 h-4" />
              </div>
              <span className="font-serif font-bold text-lg">QuickShop</span>
            </div>
            <p className="text-sm text-muted-foreground text-center">
              Empowering informal sellers with simple, beautiful online shops.
            </p>
            <div className="flex items-center gap-5 text-sm text-muted-foreground">
              <a href="#create" className="hover:text-foreground transition-colors">Get Started</a>
              <Link href="/login" className="hover:text-foreground transition-colors">Log In</Link>
            </div>
          </div>
          <Separator className="my-6" />
          <p className="text-center text-xs text-muted-foreground">
            © {new Date().getFullYear()} QuickShop. Made with ❤️ for Ghanaian sellers.
          </p>
        </div>
      </footer>
    </div>
  );
}
