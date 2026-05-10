import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState("");
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    let timeoutId;
    let unsubscribe;

    const finish = async () => {
      try {
        // Clean URL (remove hash and query params)
        window.history.replaceState(null, "", window.location.pathname);
        await refresh();
        navigate("/", { replace: true });
      } catch (e) {
        setError(e?.message || "Auth failed");
      }
    };

    // Strategy: wait for Supabase to detect session from URL
    // - Implicit flow: #access_token=... (detectSessionInUrl: true handles automatically)
    // - PKCE flow: ?code=... (Supabase exchanges automatically)
    // Both fire onAuthStateChange when done.
    const url = window.location.href;
    const hasOAuthParams =
      window.location.hash.includes("access_token=") ||
      window.location.search.includes("code=") ||
      window.location.hash.includes("error=") ||
      window.location.search.includes("error=");

    if (!hasOAuthParams) {
      // No OAuth params — go home
      navigate("/", { replace: true });
      return;
    }

    // Subscribe to auth state changes; finish when session is established
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" || (session && event === "TOKEN_REFRESHED")) {
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe?.();
        finish();
      }
    });
    unsubscribe = () => data?.subscription?.unsubscribe?.();

    // Fallback: check immediately in case session is already set
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe?.();
        finish();
      }
    })();

    // Hard timeout after 8 seconds — show error if still no session
    timeoutId = setTimeout(() => {
      unsubscribe?.();
      setError("Oturum kurulamadı (timeout). Lütfen tekrar deneyin.");
    }, 8000);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white" data-testid="auth-callback-error">
        <div className="text-center">
          <h1 className="text-2xl mb-2">Giriş başarısız</h1>
          <p className="opacity-70 mb-4">{error}</p>
          <a href="/" className="underline">Ana sayfaya dön</a>
        </div>
      </div>
    );
  }
  return (
    <div className="min-h-screen flex items-center justify-center text-white" data-testid="auth-callback-loading">
      <div className="flex items-center gap-3">
        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        <span>Hesap doğrulanıyor…</span>
      </div>
    </div>
  );
}
