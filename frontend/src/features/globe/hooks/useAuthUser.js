import { useAuth } from "@/contexts/AuthContext";

export function useAuthUser() {
  const { user, loading } = useAuth();
  return { user, loading, isAuthenticated: Boolean(user) };
}
