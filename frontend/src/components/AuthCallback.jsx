import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

const SESSION_TIMEOUT_MS = 15000;
const SESSION_POLL_INTERVAL_MS = 250;
const REFRESH_TIMEOUT_MS = 5000;

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

async function waitForSession(timeoutMs = SESSION_TIMEOUT_MS) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) return session;
    await new Promise((resolve) => setTimeout(resolve, SESSION_POLL_INTERVAL_MS));
  }

  return null;
}

async function waitForRefresh(refresh) {
  try {
    await Promise.race([
      refresh(),
      new Promise((resolve) => setTimeout(resolve, REFRESH_TIMEOUT_MS)),
    ]);
  } catch (error) {
    console.warn("Auth callback refresh failed:", error);
  }
}

export default function AuthCallback() {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState("");
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    let unsubscribe;
    let isActive = true;
    let isFinishing = false;

    const finish = async () => {
      if (!isActive || isFinishing) return;
      isFinishing = true;

      try {
        // Clean URL (remove hash and query params)
        window.history.replaceState(null, "", window.location.pathname);
        await waitForRefresh(refresh);
        if (!isActive) return;
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
      if (session && (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION")) {
        finish();
      }
    });
    unsubscribe = () => data?.subscription?.unsubscribe?.();

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

        const session = existingSession || await waitForSession();
        if (session) {
          await finish();
          return;
        }

        setError("Oturum kurulamadı (timeout). Lütfen tekrar deneyin.");
      } catch (sessionError) {
        setError(sessionError?.message || "Oturum kurulamadı.");
      }
    })();

    return () => {
      isActive = false;
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
