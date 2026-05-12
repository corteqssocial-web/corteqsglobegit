import React, { useState } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import AuthModal from "@/components/AuthModal";
import AdminPanel from "@/components/AdminPanel";
import AuthCallback from "@/components/AuthCallback";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import GlobePage from "@/features/globe/components/GlobePage";
import "@/App.css";

export function MainScreen() {
  const { user, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);

  return (
    <>
      <GlobePage user={user} onLogout={logout} onRequireLogin={() => setAuthOpen(true)} />
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: { background: "#0b0d14", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
        }}
      />
    </>
  );
}

function AppShell() {
  return (
    <Routes>
      <Route path="/" element={<MainScreen />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      <Route path="/admin" element={<AdminPanel />} />
      <Route path="*" element={<MainScreen />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}
