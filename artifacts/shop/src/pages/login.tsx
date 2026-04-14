import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ShoppingBag } from "lucide-react";
import { useLogin } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
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

const loginSchema = z.object({
  email: z.string().min(1, "Email or store username is required"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function Login() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const loginMutation = useLogin();

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  function onSubmit(data: LoginFormValues) {
    loginMutation.mutate(
      { data },
      {
        onSuccess: async () => {
          queryClient.invalidateQueries();
          try {
            const res = await fetch("/api/auth/my-store");
            if (res.ok) {
              const store = await res.json();
              setLocation(`/manage/${store.slug}`);
              return;
            }
          } catch {}
          setLocation("/");
        },
        onError: () => {
          toast({
            variant: "destructive",
            title: "Login failed",
            description: "Invalid email, username, or password.",
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

        <div className="bg-card border rounded-3xl p-5 sm:p-8 shadow-sm">
          <h1 className="text-2xl font-serif font-bold mb-1">Welcome back</h1>
          <p className="text-sm text-muted-foreground mb-6">Log in to manage your store.</p>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email or Store Username</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="you@example.com or sunday-bakery"
                        autoComplete="username"
                        {...field}
                      />
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
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Logging in..." : "Log In"}
              </Button>
            </form>
          </Form>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Don't have an account?{" "}
          <Link href="/register" className="text-foreground font-medium underline underline-offset-4">
            Create one
          </Link>
        </p>
      </div>
    </div>
  );
}
