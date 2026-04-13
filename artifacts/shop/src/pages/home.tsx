import { useEffect } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ShoppingBag,
  ArrowRight,
  MessageCircle,
  Zap,
  Star,
  Package,
  Send,
  Check,
  Store,
  Smartphone,
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

const FEATURES = [
  {
    icon: Zap,
    title: "Open in 60 seconds",
    description: "Pick a name, add your number, and your shop is live. No tech skills needed.",
  },
  {
    icon: MessageCircle,
    title: "Orders on WhatsApp",
    description: "Customers tap one button and their order lands straight in your WhatsApp.",
  },
  {
    icon: Send,
    title: "Telegram AI Bot",
    description: "An AI assistant handles questions, negotiates prices, and confirms orders 24/7.",
  },
  {
    icon: Package,
    title: "Manage with ease",
    description: "Add products, upload photos, mark items out of stock — all from your dashboard.",
  },
];

const STEPS = [
  {
    number: "01",
    title: "Create your stall",
    description: "Give your shop a name and a link. Takes under a minute.",
  },
  {
    number: "02",
    title: "Add your goods",
    description: "Upload photos, write descriptions, set your prices.",
  },
  {
    number: "03",
    title: "Share your link",
    description: "Print the QR code or share the link on WhatsApp and Instagram.",
  },
  {
    number: "04",
    title: "Get orders",
    description: "Customers browse and send their order directly to your WhatsApp.",
  },
];

// Static storefront mockup data
const MOCK_PRODUCTS = [
  { name: "Sourdough Loaf", price: "25.00", emoji: "🍞" },
  { name: "Chin Chin (500g)", price: "15.00", emoji: "🫙" },
  { name: "Meat Pie (x6)", price: "30.00", emoji: "🥧" },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthenticated } = useAuth();
  const createStoreMutation = useCreateStore();

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
      // Save form data so the user doesn't lose it after registering/logging in
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

        {/* ── Hero ── */}
        <section className="relative overflow-hidden bg-card border-b">
          {/* subtle grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.03]"
            style={{
              backgroundImage: `linear-gradient(currentColor 1px, transparent 1px), linear-gradient(90deg, currentColor 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
            }}
          />

          <div className="container mx-auto px-4 max-w-6xl py-20 md:py-28 relative">
            <div className="flex flex-col lg:flex-row items-center gap-16">

              {/* Left copy */}
              <div className="flex-1 text-center lg:text-left">
                <Badge variant="secondary" className="mb-6 rounded-full px-4 py-1 text-xs font-medium">
                  🇬🇭 Built for Ghanaian sellers
                </Badge>
                <h1 className="text-5xl md:text-6xl lg:text-7xl font-serif font-bold text-foreground leading-[1.1] mb-6">
                  Your market stall,{" "}
                  <span className="text-primary">now online.</span>
                </h1>
                <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-lg mx-auto lg:mx-0 leading-relaxed">
                  Set up a beautiful shop in under a minute. Customers browse your products and order directly on WhatsApp — no app, no hassle.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start">
                  <Button size="lg" className="rounded-full px-8 h-12 text-base" asChild>
                    <a href="#create">
                      Open Your Shop Free <ArrowRight className="ml-2 w-4 h-4" />
                    </a>
                  </Button>
                </div>

                {/* Social proof */}
                <div className="mt-10 flex items-center gap-3 justify-center lg:justify-start">
                  <div className="flex -space-x-2">
                    {["K", "A", "E", "B"].map((initial, i) => (
                      <div
                        key={i}
                        className="w-8 h-8 rounded-full border-2 border-background bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold"
                      >
                        {initial}
                      </div>
                    ))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <span className="text-foreground font-semibold">200+ sellers</span> already selling on QuickShop
                  </div>
                </div>
              </div>

              {/* Right — phone mockup */}
              <div className="flex-1 flex justify-center lg:justify-end">
                <div className="relative">
                  {/* Phone shell */}
                  <div className="w-64 bg-card rounded-[2.5rem] border-[6px] border-foreground/10 shadow-2xl overflow-hidden">
                    {/* Status bar */}
                    <div className="bg-muted/50 px-5 pt-3 pb-2 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-medium">9:41</span>
                      <div className="w-20 h-4 bg-foreground/10 rounded-full" />
                      <div className="flex gap-1">
                        <div className="w-3 h-2 bg-foreground/20 rounded-sm" />
                        <div className="w-2 h-2 bg-foreground/20 rounded-full" />
                      </div>
                    </div>

                    {/* Store header */}
                    <div className="bg-primary/5 px-4 py-4 text-center border-b">
                      <div className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-2">
                        <ShoppingBag className="w-5 h-5" />
                      </div>
                      <p className="font-serif font-bold text-sm text-foreground">Mama's Bakery</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Fresh baked every morning 🥐</p>
                    </div>

                    {/* Products */}
                    <div className="px-3 py-3 space-y-2 bg-background">
                      {MOCK_PRODUCTS.map((p) => (
                        <div key={p.name} className="flex items-center gap-2 bg-card rounded-xl p-2.5 border">
                          <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-lg shrink-0">
                            {p.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-foreground truncate">{p.name}</p>
                            <p className="text-xs text-primary font-bold">GHS {p.price}</p>
                          </div>
                          <div className="w-6 h-6 rounded-full bg-primary flex items-center justify-center shrink-0">
                            <MessageCircle className="w-3 h-3 text-primary-foreground" />
                          </div>
                        </div>
                      ))}

                      {/* Order button */}
                      <div className="pt-1 pb-1">
                        <div className="w-full h-8 rounded-xl bg-[#25D366] flex items-center justify-center gap-1.5">
                          <MessageCircle className="w-3.5 h-3.5 text-white" />
                          <span className="text-white text-[11px] font-semibold">Order via WhatsApp</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Floating badges */}
                  <div className="absolute -right-6 top-16 bg-card border rounded-2xl px-3 py-2 shadow-lg text-xs font-medium flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    Order received!
                  </div>
                  <div className="absolute -left-8 bottom-20 bg-card border rounded-2xl px-3 py-2 shadow-lg text-xs font-medium flex items-center gap-1.5">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    Live in 60 secs
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="py-20 md:py-24 border-b">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-14">
              <Badge variant="secondary" className="mb-4 rounded-full px-4 py-1 text-xs">How it works</Badge>
              <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground">
                From zero to selling in 4 steps
              </h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              {STEPS.map((step, i) => (
                <div key={step.number} className="relative">
                  {i < STEPS.length - 1 && (
                    <div className="hidden lg:block absolute top-7 left-[60%] w-full h-px bg-border z-0" />
                  )}
                  <div className="relative z-10 bg-card border rounded-3xl p-6 h-full">
                    <span className="text-4xl font-serif font-bold text-primary/20 block mb-4">{step.number}</span>
                    <h3 className="font-bold text-foreground mb-2">{step.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="py-20 md:py-24 bg-muted/30 border-b">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="text-center mb-14">
              <Badge variant="secondary" className="mb-4 rounded-full px-4 py-1 text-xs">Everything you need</Badge>
              <h2 className="text-3xl md:text-4xl font-serif font-bold text-foreground">
                Built for the way you sell
              </h2>
              <p className="text-muted-foreground mt-3 max-w-md mx-auto">
                No complicated setup. No monthly fees to start. Just you, your products, and your customers.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {FEATURES.map((f) => (
                <div key={f.title} className="bg-card border rounded-3xl p-7 flex gap-5 items-start">
                  <div className="bg-primary/10 text-primary p-3 rounded-2xl shrink-0">
                    <f.icon className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-foreground mb-1">{f.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{f.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Testimonial strip ── */}
        <section className="py-14 border-b bg-primary text-primary-foreground">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
              <p className="text-2xl md:text-3xl font-serif font-bold max-w-xl leading-snug">
                "I set up my shop in 5 minutes. Now I get orders on WhatsApp while I'm at the market."
              </p>
              <div className="shrink-0">
                <div className="w-14 h-14 rounded-full bg-primary-foreground/20 flex items-center justify-center text-2xl font-bold mb-2 mx-auto md:mx-0">
                  A
                </div>
                <p className="font-semibold text-sm">Akosua M.</p>
                <p className="text-primary-foreground/70 text-xs">Fabric seller, Kumasi</p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Create store form ── */}
        <section id="create" className="py-20 md:py-28 bg-muted/30">
          <div className="container mx-auto px-4 max-w-6xl">
            <div className="flex flex-col lg:flex-row gap-16 items-start">

              {/* Left copy */}
              <div className="flex-1 lg:sticky lg:top-24">
                <Badge variant="secondary" className="mb-4 rounded-full px-4 py-1 text-xs">Free to start</Badge>
                <h2 className="text-4xl md:text-5xl font-serif font-bold text-foreground mb-5 leading-tight">
                  Open your shop today
                </h2>
                <p className="text-muted-foreground mb-8 text-lg leading-relaxed">
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
                <div className="bg-card border rounded-3xl p-8 shadow-sm">
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
                                <span className="text-muted-foreground bg-muted px-3 py-2 text-sm border border-r-0 rounded-l-md select-none">
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

                <div className="bg-card border rounded-3xl px-8 py-5 mt-4 flex items-center justify-between">
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
