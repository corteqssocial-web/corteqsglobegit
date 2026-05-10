import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import api from "@/lib/api";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await supabase.auth.getSession();
      await refresh();
      if (mounted) setLoading(false);
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session) {
        refresh();
      } else {
        setUser(null);
      }
    });

    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [refresh]);

  const signupEmail = async (email, password, name) => {
    const res = await api.post("/auth/signup", { email, password, name });
    // Backend returned tokens — set Supabase session client-side so subsequent calls work
    await supabase.auth.setSession({
      access_token: res.data.access_token,
      refresh_token: res.data.refresh_token,
    });
    await refresh();
    return res.data.user;
  };

  const loginEmail = async (email, password) => {
    const res = await api.post("/auth/login", { email, password });
    await supabase.auth.setSession({
      access_token: res.data.access_token,
      refresh_token: res.data.refresh_token,
    });
    await refresh();
    return res.data.user;
  };

  const loginGoogle = async () => {
    const redirectUrl = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: redirectUrl,
      },
    });
    if (error) throw error;
  };

  const logout = async () => {
    try { await api.post("/auth/logout"); } catch {}
    try { await supabase.auth.signOut(); } catch {}
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signupEmail, loginEmail, loginGoogle, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
