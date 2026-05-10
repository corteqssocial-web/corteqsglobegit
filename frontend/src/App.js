import React, { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Routes, Route, useNavigate } from "react-router-dom";
import DiasporaGlobe from "@/components/DiasporaGlobe";
import SearchBar from "@/components/SearchBar";
import AuthModal from "@/components/AuthModal";
import AddPinModal from "@/components/AddPinModal";
import AdminPanel from "@/components/AdminPanel";
import PinDetailDrawer from "@/components/PinDetailDrawer";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { Plus, LogOut, Shield, Globe2 } from "lucide-react";
import { PIN_TYPES } from "@/lib/pinTypes";
import api from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import "@/App.css";

function MainScreen() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();

  const [pins, setPins] = useState([]);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState(null);
  const [searchTrigger, setSearchTrigger] = useState(0);
  const [flyToCoords, setFlyToCoords] = useState(null);
  const [arrivedIds, setArrivedIds] = useState(new Set()); // pins that just arrived via realtime — get wow effect
  const arrivedTimers = useRef({});

  const [authOpen, setAuthOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [pendingCoords, setPendingCoords] = useState(null);
  const [addMode, setAddMode] = useState(false); // when true, next globe click opens add-pin
  const [drawerPin, setDrawerPin] = useState(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const userRef = useRef(null);
  useEffect(() => { userRef.current = user; }, [user]);

  const markArrived = useCallback((id) => {
    setArrivedIds((prev) => {
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    if (arrivedTimers.current[id]) clearTimeout(arrivedTimers.current[id]);
    arrivedTimers.current[id] = setTimeout(() => {
      setArrivedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      delete arrivedTimers.current[id];
    }, 5000);
  }, []);

  const loadPins = useCallback(async () => {
    try {
      const res = await api.get("/pins");
      setPins(res.data.pins || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => { loadPins(); }, [loadPins]);

  // ----- Realtime subscription: live updates when pins are inserted/approved/rejected/deleted -----
  useEffect(() => {
    const channel = supabase
      .channel("pins-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "pins" }, (payload) => {
        const p = payload.new;
        if (p?.status !== "approved") return;
        setPins((prev) => (prev.find((x) => x.id === p.id) ? prev : [p, ...prev]));
        markArrived(p.id);
        const t = PIN_TYPES[p.type];
        if (t) toast(`${t.emoji} Yeni pin: ${p.name} · ${p.city}`);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "pins" }, (payload) => {
        const np = payload.new;
        const op = payload.old || {};
        if (!np) return;
        if (np.status === "approved" && op.status !== "approved") {
          setPins((prev) => (prev.find((x) => x.id === np.id) ? prev.map((x) => x.id === np.id ? np : x) : [np, ...prev]));
          markArrived(np.id);
          const t = PIN_TYPES[np.type];
          // Personalized: if it's the current user's own pin → celebratory toast + fly-to
          const me = userRef.current;
          if (me && np.user_id === me.id) {
            toast.success(`🎉 Pin'in onaylandı: ${np.name}`, { duration: 6000 });
            setFlyToCoords({ lat: np.lat, lng: np.lng, zoom: 1.7 });
            setSearchTrigger((x) => x + 1);
          } else if (t) {
            toast(`${t.emoji} Onaylandı: ${np.name} · ${np.city}`);
          }
        } else if (np.status !== "approved" && op.status === "approved") {
          setPins((prev) => prev.filter((x) => x.id !== np.id));
        } else if (np.status === "approved") {
          setPins((prev) => prev.map((x) => x.id === np.id ? np : x));
        }
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "pins" }, (payload) => {
        const id = payload.old?.id;
        if (id) setPins((prev) => prev.filter((x) => x.id !== id));
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      Object.values(arrivedTimers.current).forEach(clearTimeout);
      arrivedTimers.current = {};
    };
  }, [markArrived]);

  // Auto-seed if globe is empty and user is admin (handy for first-run)
  useEffect(() => {
    if (!user?.is_admin) return;
    if (pins.length > 0) return;
    (async () => {
      try { await api.post("/seed"); await loadPins(); } catch {}
    })();
  }, [user, pins.length, loadPins]);

  const onFly = useCallback((coords) => {
    setFlyToCoords(coords);
    setSearchTrigger((x) => x + 1);
  }, []);

  const onGlobeClick = useCallback((coords) => {
    if (!addMode) return;
    if (!user) {
      setAuthOpen(true);
      setAddMode(false);
      return;
    }
    setPendingCoords(coords);
    setAddOpen(true);
    setAddMode(false);
  }, [addMode, user]);

  const onPinClick = useCallback((p) => {
    setDrawerPin(p);
    setDrawerOpen(true);
  }, []);

  // Geo-IP initial fly-to (once on first mount, only if no manual interaction yet)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/geoip");
        if (cancelled) return;
        const { lat, lng, city, country_name } = res.data || {};
        if (lat != null && lng != null) {
          // Defer briefly so Three.js initial setup is ready
          setTimeout(() => {
            if (cancelled) return;
            setFlyToCoords({ lat, lng });
            setSearchTrigger((x) => x + 1);
            if (city) toast(`🌍 ${city}${country_name ? `, ${country_name}` : ""}`, { duration: 3000 });
          }, 1200);
        }
      } catch { /* silent */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const counts = useMemo(() => {
    const out = { all: pins.length };
    Object.keys(PIN_TYPES).forEach((k) => out[k] = 0);
    pins.forEach((p) => { if (out[p.type] != null) out[p.type] += 1; });
    return out;
  }, [pins]);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#03050a] text-white" data-testid="main-screen">
      {/* Background gradient depth */}
      <div className="absolute inset-0 pointer-events-none" style={{
        background: "radial-gradient(circle at 50% 50%, rgba(20,28,60,0.6) 0%, rgba(3,5,10,1) 70%)"
      }} />

      {/* Globe */}
      <DiasporaGlobe
        pins={pins}
        filter={filter}
        arrivedIds={arrivedIds}
        onPinClick={onPinClick}
        onGlobeClick={onGlobeClick}
        searchQuery={searchQuery}
        searchTrigger={searchTrigger}
        flyToCoords={flyToCoords}
      />

      {/* Top bar */}
      <header className="absolute top-0 left-0 right-0 px-6 py-5 flex items-center justify-between z-20" data-testid="top-bar">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#ffd166] to-[#ff6b9d] flex items-center justify-center">
            <Globe2 className="w-4 h-4 text-black" />
          </div>
          <div>
            <h1 className="text-base font-medium tracking-tight leading-none">CorteQS</h1>
            <p className="text-xs text-white/40 leading-none mt-1">Diaspora Globe</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {user?.is_admin && (
            <Button
              data-testid="open-admin-btn" size="sm" variant="ghost"
              onClick={() => navigate("/admin")}
              className="text-white/70 hover:text-white hover:bg-white/10"
            >
              <Shield className="w-4 h-4 mr-2" /> Moderasyon
            </Button>
          )}
          {user ? (
            <div className="flex items-center gap-2 bg-white/5 rounded-full pl-3 pr-1 py-1 backdrop-blur" data-testid="user-chip">
              <span className="text-xs text-white/70">{user.name || user.email}</span>
              <Button data-testid="logout-btn" onClick={logout} size="icon" variant="ghost" className="h-7 w-7 rounded-full hover:bg-white/10">
                <LogOut className="w-3.5 h-3.5" />
              </Button>
            </div>
          ) : (
            <Button
              data-testid="open-auth-btn" size="sm"
              onClick={() => setAuthOpen(true)}
              className="bg-[#ffd166] text-black hover:bg-[#ffdd85] rounded-full px-4"
            >
              Giriş yap
            </Button>
          )}
        </div>
      </header>

      {/* Search (top-center) */}
      <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[min(420px,90vw)] z-20" data-testid="search-container">
        <SearchBar onFly={onFly} />
      </div>

      {/* Filter rail (right side) */}
      <aside className="absolute right-6 top-1/2 -translate-y-1/2 z-20 flex flex-col gap-1 bg-white/[0.04] backdrop-blur-md border border-white/10 rounded-2xl p-2" data-testid="filter-rail">
        <FilterChip active={filter === "all"} label="Hepsi" emoji="🌍" count={counts.all} onClick={() => setFilter("all")} testId="filter-all" />
        {Object.entries(PIN_TYPES).map(([k, v]) => (
          <FilterChip
            key={k}
            active={filter === k}
            label={v.label}
            emoji={v.emoji}
            color={v.color}
            count={counts[k] || 0}
            onClick={() => setFilter((cur) => (cur === k ? "all" : k))}
            testId={`filter-${k}`}
          />
        ))}
      </aside>

      {/* Bottom-center: Add pin FAB (moved from bottom-right to avoid Emergent badge overlay) */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50">
        <Button
          data-testid="add-pin-fab"
          aria-pressed={addMode}
          onClick={() => {
            if (!user) { setAuthOpen(true); return; }
            setAddMode((m) => !m);
          }}
          className={`rounded-full px-5 py-6 shadow-2xl transition ${
            addMode
              ? "bg-[#ff6b9d] text-white hover:bg-[#ff80a8]"
              : "bg-[#ffd166] text-black hover:bg-[#ffdd85]"
          }`}
        >
          <Plus className="w-4 h-4 mr-2" />
          {addMode ? "Haritada konum seç…" : "Pin ekle"}
        </Button>
      </div>

      {/* Bottom-left: helper / count */}
      <div className="absolute bottom-6 left-6 z-20 text-xs text-white/40 max-w-[260px]" data-testid="footer-info">
        <div>{pins.length} pin · {filter === "all" ? "tüm kategoriler" : PIN_TYPES[filter]?.label}</div>
        <div className="opacity-60 mt-1">Sürükle: döndür · Scroll: zoom · Çift parmak: pinch</div>
      </div>

      {/* Modals */}
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} />
      <AddPinModal
        open={addOpen}
        onOpenChange={setAddOpen}
        lat={pendingCoords?.lat}
        lng={pendingCoords?.lng}
        onCreated={() => loadPins()}
      />
      <PinDetailDrawer
        pin={drawerPin}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        onFlyTo={(p) => {
          setFlyToCoords({ lat: p.lat, lng: p.lng, zoom: 1.7 });
          setSearchTrigger((x) => x + 1);
          setDrawerOpen(false);
        }}
      />

      <Toaster
        theme="dark"
        position="top-center"
        toastOptions={{
          style: { background: "#0b0d14", color: "#fff", border: "1px solid rgba(255,255,255,0.1)" },
        }}
      />
    </div>
  );
}

function FilterChip({ active, label, emoji, color, count, onClick, testId }) {
  return (
    <button
      data-testid={testId}
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs whitespace-nowrap transition ${
        active ? "bg-white/10 text-white" : "text-white/60 hover:bg-white/5 hover:text-white"
      }`}
      style={active && color ? { boxShadow: `inset 0 0 0 1px ${color}55` } : {}}
    >
      <span className="text-base">{emoji}</span>
      <span className="flex-1 text-left">{label}</span>
      <span className="text-[10px] tabular-nums opacity-50">{count}</span>
    </button>
  );
}

function AppShell() {
  return (
    <Routes>
      <Route path="/" element={<MainScreen />} />
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
