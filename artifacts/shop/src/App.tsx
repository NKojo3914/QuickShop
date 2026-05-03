import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Dashboard from "@/pages/dashboard";
import Storefront from "@/pages/storefront";
import Login from "@/pages/login";
import Register from "@/pages/register";
import PayCallback from "@/pages/pay-callback";
import ReviewPage from "@/pages/review";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/login" component={Login} />
      <Route path="/register" component={Register} />
      <Route path="/manage/:slug">
        {(params: StringRouteParams<"/manage/:slug">) => <ProtectedRoute component={Dashboard} params={params} />}
      </Route>
      <Route path="/store/:slug" component={Storefront} />
      <Route path="/pay/callback" component={PayCallback} />
      <Route path="/review/:orderId" component={ReviewPage} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
