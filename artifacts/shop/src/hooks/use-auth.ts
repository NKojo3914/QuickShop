import { useGetMe } from "@workspace/api-client-react";

export function useAuth() {
  const { data: seller, isLoading } = useGetMe({ query: { retry: false } });
  return {
    seller: seller ?? null,
    isLoading,
    isAuthenticated: !!seller,
  };
}
