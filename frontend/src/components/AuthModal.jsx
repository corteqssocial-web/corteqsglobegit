import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";

export default function AuthModal({ open, onOpenChange }) {
  const { signupEmail, loginEmail, loginGoogle } = useAuth();
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const handleEmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "login") {
        await loginEmail(email, password);
        toast.success("Hoş geldin 👋");
      } else {
        await signupEmail(email, password, name);
        toast.success("Hesap oluşturuldu");
      }
      onOpenChange(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || "İşlem başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="auth-modal"
        className="bg-[#0b0d14] border-white/10 text-white sm:max-w-[420px]"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-tight">CorteQS'a giriş yap</DialogTitle>
          <DialogDescription className="text-white/60">
            Pin eklemek için hesap gerekli. Eklediğin pinler moderasyondan sonra haritada görünür.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={setMode} className="mt-2">
          <TabsList className="grid w-full grid-cols-2 bg-white/5">
            <TabsTrigger value="login" data-testid="auth-tab-login">Giriş</TabsTrigger>
            <TabsTrigger value="signup" data-testid="auth-tab-signup">Kayıt</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="mt-4">
            <form onSubmit={handleEmail} className="space-y-3">
              <FieldEmail email={email} setEmail={setEmail} />
              <FieldPassword password={password} setPassword={setPassword} />
              <Button data-testid="auth-submit-login" type="submit" disabled={busy} className="w-full bg-[#ffd166] text-black hover:bg-[#ffdd85]">
                {busy ? "..." : "E-posta ile Giriş"}
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="mt-4">
            <form onSubmit={handleEmail} className="space-y-3">
              <div>
                <Label className="text-white/70">Ad Soyad</Label>
                <Input
                  data-testid="auth-name-input"
                  value={name} onChange={(e) => setName(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                  placeholder="Ahmet Yılmaz"
                />
              </div>
              <FieldEmail email={email} setEmail={setEmail} />
              <FieldPassword password={password} setPassword={setPassword} />
              <Button data-testid="auth-submit-signup" type="submit" disabled={busy} className="w-full bg-[#ffd166] text-black hover:bg-[#ffdd85]">
                {busy ? "..." : "Hesap Oluştur"}
              </Button>
            </form>
          </TabsContent>
        </Tabs>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-white/10" />
          </div>
          <div className="relative flex justify-center text-xs">
            <span className="px-2 bg-[#0b0d14] text-white/40 uppercase tracking-widest">veya</span>
          </div>
        </div>

        <Button
          data-testid="auth-google-btn"
          variant="outline"
          onClick={loginGoogle}
          className="w-full bg-white text-black hover:bg-white/90 border-0"
        >
          <svg width="18" height="18" viewBox="0 0 48 48" className="mr-2">
            <path fill="#FFC107" d="M43.6 20.5h-1.9V20H24v8h11.3c-1.6 4.7-6 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.2-.1-2.4-.4-3.5z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.3 34.9 26.8 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.5l6.2 5.2C41 35 44 30 44 24c0-1.2-.1-2.4-.4-3.5z"/>
          </svg>
          Google ile devam et
        </Button>
      </DialogContent>
    </Dialog>
  );
}

function FieldEmail({ email, setEmail }) {
  return (
    <div>
      <Label className="text-white/70">E-posta</Label>
      <Input
        data-testid="auth-email-input"
        type="email" required
        value={email} onChange={(e) => setEmail(e.target.value)}
        className="bg-white/5 border-white/10 text-white"
        placeholder="ornek@mail.com"
      />
    </div>
  );
}
function FieldPassword({ password, setPassword }) {
  return (
    <div>
      <Label className="text-white/70">Şifre</Label>
      <Input
        data-testid="auth-password-input"
        type="password" required minLength={6}
        value={password} onChange={(e) => setPassword(e.target.value)}
        className="bg-white/5 border-white/10 text-white"
        placeholder="En az 6 karakter"
      />
    </div>
  );
}
