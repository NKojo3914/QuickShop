import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShoppingBag } from "lucide-react";
import { useRegister, useCreateStore } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const PENDING_STORE_KEY = "qs_pending_store";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";

const registerSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  confirmPassword: z.string(),
}).refine((d) => d.password === d.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});

type RegisterFormValues = z.infer<typeof registerSchema>;

export default function Register() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const registerMutation = useRegister();
  const createStoreMutation = useCreateStore();

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: "", password: "", confirmPassword: "" },
  });

  function onSubmit(data: RegisterFormValues) {
    registerMutation.mutate(
      { data: { email: data.email, password: data.password } },
      {
        onSuccess: async () => {
          queryClient.invalidateQueries();

          // If the user came from the home page after filling the store form,
          // automatically create their store so they land on the dashboard.
          try {
            const pendingRaw = sessionStorage.getItem(PENDING_STORE_KEY);
            if (pendingRaw) {
              const pendingStore = JSON.parse(pendingRaw) as {
                name: string; slug: string; whatsappNumber: string; description?: string; currency?: string;
              };
              sessionStorage.removeItem(PENDING_STORE_KEY);
              createStoreMutation.mutate(
                { data: pendingStore },
                {
                  onSuccess: (store) => {
                    setLocation(`/manage/${store.slug}`);
                  },
                  onError: () => {
                    // Store creation failed (slug taken?) — go to home so user can retry
                    setLocation("/");
                  },
                }
              );
              return;
            }
          } catch { /* ignore */ }

          try {
            const res = await fetch("/api/auth/my-store");
            if (res.ok) {
              const store = await res.json() as { slug: string };
              setLocation(`/manage/${store.slug}`);
              return;
            }
          } catch { /* ignore */ }
          setLocation("/");
        },
        onError: (err: { status?: number }) => {
          const isEmailTaken = err?.status === 409;
          toast({
            variant: "destructive",
            title: isEmailTaken ? "Email already registered" : "Registration failed",
            description: isEmailTaken
              ? "An account with this email already exists."
              : "Something went wrong. Please try again.",
          });
        },
      }
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-muted px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-8">
          <div className="bg-primary text-primary-foreground p-2 rounded-xl">
            <ShoppingBag className="w-5 h-5" />
          </div>
          <span className="font-serif font-bold text-xl tracking-tight">QuickShop</span>
        </div>

        <div className="bg-card border rounded-3xl p-8 shadow-sm">
          <h1 className="text-2xl font-serif font-bold mb-1">Create your account</h1>
          <p className="text-sm text-muted-foreground mb-6">Sign up to open your QuickShop store.</p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <Input type="email" placeholder="you@example.com" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="At least 8 characters" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="••••••••" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
