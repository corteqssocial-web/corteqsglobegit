import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";

export default function AuthCallback() {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const [error, setError] = useState("");
  const hasProcessed = useRef(false);

  useEffect(() => {
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const hash = window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) {
      navigate("/", { replace: true });
      return;
    }
    const sessionId = decodeURIComponent(match[1]);

    (async () => {
      try {
        await api.post("/auth/emergent/callback", { session_id: sessionId });
        // clear hash
        window.history.replaceState(null, "", window.location.pathname);
        await refresh();
        navigate("/", { replace: true });
      } catch (e) {
        setError(e?.response?.data?.detail || e.message || "Auth failed");
      }
    })();
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
