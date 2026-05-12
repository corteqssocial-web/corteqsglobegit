import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

function getOAuthPayload() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const search = new URLSearchParams(window.location.search);

  return {
    accessToken: hash.get("access_token"),
    refreshToken: hash.get("refresh_token"),
    code: search.get("code"),
    error: hash.get("error_description") || hash.get("error") || search.get("error_description") || search.get("error"),
  };
}

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

    const { accessToken, refreshToken, code, error: oauthError } = getOAuthPayload();

    // Strategy: wait for Supabase to detect session from URL
    // - Implicit flow: #access_token=... (detectSessionInUrl: true handles automatically)
    // - PKCE flow: ?code=... (Supabase exchanges automatically)
    // Both fire onAuthStateChange when done.
    const hasOAuthParams = Boolean(accessToken || code || oauthError);

    if (!hasOAuthParams) {
      // No OAuth params — go home
      navigate("/", { replace: true });
      return;
    }

    if (oauthError) {
      setError(oauthError);
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

    // Fallback:
    // 1) explicitly set/exchange the session if URL payload exists and Supabase hasn't done it yet
    // 2) then immediately check whether a session is available
    (async () => {
      try {
        const { data: { session: existingSession } } = await supabase.auth.getSession();

        if (!existingSession) {
          if (accessToken && refreshToken) {
            const { error: setSessionError } = await supabase.auth.setSession({
              access_token: accessToken,
              refresh_token: refreshToken,
            });
            if (setSessionError) throw setSessionError;
          } else if (code) {
            const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
            if (exchangeError) throw exchangeError;
          }
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          if (timeoutId) clearTimeout(timeoutId);
          unsubscribe?.();
          finish();
        }
      } catch (sessionError) {
        if (timeoutId) clearTimeout(timeoutId);
        unsubscribe?.();
        setError(sessionError?.message || "Oturum kurulamadı.");
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
