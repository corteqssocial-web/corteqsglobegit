import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
import { PIN_TYPES } from "@/lib/pinTypes";

export default function AdminPanel() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [pins, setPins] = useState([]);
  const [filter, setFilter] = useState("pending");
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (loading) return;
    if (!user) { navigate("/", { replace: true }); return; }
    if (!user.is_admin) {
      toast.error("Bu sayfa sadece adminler içindir.");
      navigate("/", { replace: true });
      return;
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user]);

  const load = async () => {
    setFetching(true);
    try {
      const res = await api.get("/pins/admin");
      setPins(res.data.pins || []);
    } catch (e) {
      toast.error("Pinler yüklenemedi");
    } finally { setFetching(false); }
  };

  const setStatus = async (id, status) => {
    try {
      await api.patch(`/pins/${id}`, { status });
      toast.success(`Pin ${status === "approved" ? "onaylandı" : status === "rejected" ? "reddedildi" : "beklemeye alındı"}`);
      load();
    } catch (e) { toast.error("İşlem başarısız"); }
  };

  const remove = async (id) => {
    if (!window.confirm("Pin silinsin mi?")) return;
    try { await api.delete(`/pins/${id}`); toast.success("Silindi"); load(); }
    catch { toast.error("Silinemedi"); }
  };

  const filtered = pins.filter(p => filter === "all" ? true : p.status === filter);

  return (
    <div className="min-h-screen bg-[#05060a] text-white" data-testid="admin-panel">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl tracking-tight font-light">Moderasyon</h1>
            <p className="text-white/50 mt-1">Bekleyen ve eklenen pinleri yönet.</p>
          </div>
          <Button variant="ghost" onClick={() => navigate("/")} data-testid="admin-back-btn" className="text-white hover:bg-white/10">
            ← Globe'a dön
          </Button>
        </div>

        <div className="flex gap-2 mb-6">
          {[
            ["pending", "Bekleyen"],
            ["approved", "Onaylı"],
            ["rejected", "Reddedilen"],
            ["all", "Hepsi"],
          ].map(([k, label]) => (
            <Button
              key={k} size="sm"
              data-testid={`admin-filter-${k}`}
              onClick={() => setFilter(k)}
              className={filter === k ? "bg-[#ffd166] text-black hover:bg-[#ffdd85]" : "bg-white/5 text-white hover:bg-white/10"}
            >
              {label}
            </Button>
          ))}
        </div>

        {fetching ? (
          <div className="text-white/50">Yükleniyor…</div>
        ) : filtered.length === 0 ? (
          <div className="text-white/50">Bu durumda pin yok.</div>
        ) : (
          <div className="space-y-2">
            {filtered.map((p) => {
              const t = PIN_TYPES[p.type] || {};
              return (
                <div key={p.id} data-testid={`admin-pin-row-${p.id}`} className="flex items-center justify-between bg-white/[0.03] border border-white/10 rounded-lg px-4 py-3 hover:bg-white/[0.05] transition">
                  <div className="flex items-center gap-4 min-w-0">
                    <span className="text-2xl">{t.emoji}</span>
                    <div className="min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-white/50 truncate">
                        {t.label} · {p.city}{p.hood ? ` / ${p.hood}` : ""} · {p.lat?.toFixed(2)}, {p.lng?.toFixed(2)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={
                      p.status === "approved" ? "border-emerald-500/40 text-emerald-300" :
                      p.status === "rejected" ? "border-red-500/40 text-red-300" :
                      "border-amber-500/40 text-amber-300"
                    }>{p.status}</Badge>
                    {p.status !== "approved" && (
                      <Button size="sm" data-testid={`approve-${p.id}`} onClick={() => setStatus(p.id, "approved")} className="bg-emerald-500 hover:bg-emerald-400 text-black">Onayla</Button>
                    )}
                    {p.status !== "rejected" && (
                      <Button size="sm" data-testid={`reject-${p.id}`} onClick={() => setStatus(p.id, "rejected")} className="bg-red-500/80 hover:bg-red-500 text-white">Reddet</Button>
                    )}
                    <Button size="sm" data-testid={`delete-${p.id}`} onClick={() => remove(p.id)} variant="ghost" className="text-white/60 hover:bg-white/10">Sil</Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
