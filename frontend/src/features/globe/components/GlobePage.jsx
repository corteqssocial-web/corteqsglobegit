import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Globe2, LogOut, Plus, Shield } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import api from "@/lib/api";
import CesiumGlobe from "@/features/globe/components/CesiumGlobe";
import AddPinModal from "@/features/globe/components/AddPinModal";
import LocationSearch from "@/features/globe/components/LocationSearch";
import MyPinsPanel from "@/features/globe/components/MyPinsPanel";
import PinPopup from "@/features/globe/components/PinPopup";
import { usePublicPins } from "@/features/globe/hooks/usePublicPins";
import { useMyPins } from "@/features/globe/hooks/useMyPins";
import { useAddPin } from "@/features/globe/hooks/useAddPin";
import { useGeocoding } from "@/features/globe/hooks/useGeocoding";
import { DEFAULT_CAMERA } from "@/features/globe/constants/defaultCamera";

export default function GlobePage({ user, onLogout, onRequireLogin }) {
  const navigate = useNavigate();
  const publicPins = usePublicPins();
  const myPins = useMyPins(Boolean(user));
  const addPin = useAddPin();
  const geocoding = useGeocoding();

  const [viewer, setViewer] = useState(null);
  const [selectedPin, setSelectedPin] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [addOpen, setAddOpen] = useState(false);
  const [myPinsOpen, setMyPinsOpen] = useState(false);
  const [flyToTarget, setFlyToTarget] = useState(null);
  const [geoIpApplied, setGeoIpApplied] = useState(false);

  const visiblePins = useMemo(() => publicPins.pins, [publicPins.pins]);

  useEffect(() => {
    if (geoIpApplied) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get("/geoip");
        if (cancelled) return;
        if (res.data?.lat != null && res.data?.lng != null) {
          setFlyToTarget({
            lat: res.data.lat,
            lng: res.data.lng,
            height: 9000000,
          });
        }
      } catch {
        setFlyToTarget(DEFAULT_CAMERA);
      } finally {
        if (!cancelled) setGeoIpApplied(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [geoIpApplied]);

  const refreshAll = useCallback(async () => {
    await Promise.all([publicPins.refetch(), myPins.refetch()]);
  }, [myPins, publicPins]);

  const handleLocationSelect = useCallback((location) => {
    setSelectedLocation(location);
    setFlyToTarget({ lat: location.lat, lng: location.lng, height: 3500000 });
  }, []);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-[#03050a] text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(69,111,255,0.2),transparent_35%),radial-gradient(circle_at_70%_30%,rgba(255,209,102,0.12),transparent_30%),linear-gradient(180deg,#02060d_0%,#07101d_100%)]" />
      <CesiumGlobe
        pins={visiblePins}
        selectedPinId={selectedPin?.id || null}
        onPinClick={setSelectedPin}
        onMapClick={(position) => {
          if (!addOpen) return;
          setSelectedLocation({
            id: "map-click",
            label: `Selected location ${position.lat}, ${position.lng}`,
            lat: position.lat,
            lng: position.lng,
            provider: "manual",
          });
        }}
        onReady={setViewer}
        initialCamera={DEFAULT_CAMERA}
        flyToTarget={flyToTarget}
      />

      <header className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-[#ffd166] to-[#ff7a59] text-black shadow-lg">
            <Globe2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold tracking-tight">CorteQS Globe</h1>
            <p className="text-xs uppercase tracking-[0.24em] text-white/40">Google Earth-like diaspora map</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {user?.is_admin && (
            <button
              type="button"
              onClick={() => navigate("/admin")}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
            >
              <Shield className="mr-2 inline h-4 w-4" />
              Moderation
            </button>
          )}
          {user ? (
            <>
              <button
                type="button"
                onClick={() => setMyPinsOpen(true)}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10 hover:text-white"
              >
                My Pins
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="rounded-full bg-[#ffd166] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#ffe29e]"
              >
                <LogOut className="mr-2 inline h-4 w-4" />
                Sign out
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onRequireLogin}
              className="rounded-full bg-[#ffd166] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#ffe29e]"
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <div className="absolute left-1/2 top-24 z-20 w-[min(520px,calc(100vw-2rem))] -translate-x-1/2">
        <LocationSearch
          placeholder="Search city or location"
          onSearch={geocoding.search}
          results={geocoding.results}
          loading={geocoding.loading}
          error=""
          onSelect={handleLocationSelect}
          selectedLocation={selectedLocation}
        />
      </div>

      <div className="absolute bottom-6 left-6 z-20 max-w-sm rounded-3xl border border-white/10 bg-[#07101dcc] p-4 backdrop-blur-xl">
        <div className="text-xs uppercase tracking-[0.24em] text-white/45">Status</div>
        {publicPins.loading ? (
          <p className="mt-2 text-sm text-white/60">Loading globe pins…</p>
        ) : publicPins.error ? (
          <p className="mt-2 text-sm text-amber-200/90">{publicPins.error}</p>
        ) : visiblePins.length === 0 ? (
          <p className="mt-2 text-sm text-white/60">No approved pins yet. Be the first to join the CorteQS Globe.</p>
        ) : (
          <p className="mt-2 text-sm text-white/60">{visiblePins.length} public pins live on the globe.</p>
        )}
        {publicPins.setupRequired && (
          <p className="mt-2 text-xs text-amber-200/90">Supabase setup looks incomplete. Public demo pins are shown in development.</p>
        )}
      </div>

      <div className="absolute bottom-6 left-1/2 z-20 -translate-x-1/2">
        <button
          type="button"
          onClick={() => {
            if (!user) {
              onRequireLogin?.();
              return;
            }
            setAddOpen(true);
          }}
          className="rounded-full bg-[#ffd166] px-5 py-3 text-sm font-medium text-black shadow-2xl transition hover:bg-[#ffe29e]"
        >
          <Plus className="mr-2 inline h-4 w-4" />
          Add my pin
        </button>
      </div>

      <PinPopup
        pin={selectedPin}
        onClose={() => setSelectedPin(null)}
        onFlyTo={(pin) => {
          setFlyToTarget({ lat: pin.lat, lng: pin.lng, height: 2500000 });
        }}
      />

      <AddPinModal
        open={addOpen}
        onOpenChange={setAddOpen}
        user={user}
        geocoding={geocoding}
        selectedLocation={selectedLocation}
        onLocationSelect={handleLocationSelect}
        submitting={addPin.submitting}
        submitError={addPin.error}
        onSubmit={async (payload) => {
          try {
            const created = await addPin.submitPin(payload);
            toast.success("Your pin was submitted successfully and is waiting for approval.");
            setAddOpen(false);
            setSelectedPin(created);
            await refreshAll();
          } catch (err) {
            toast.error(err.message);
          }
        }}
      />

      <MyPinsPanel
        open={myPinsOpen}
        onOpenChange={setMyPinsOpen}
        pins={myPins.pins}
        loading={myPins.loading}
        error={myPins.error}
        onFlyTo={(pin) => {
          setFlyToTarget({ lat: pin.lat, lng: pin.lng, height: 2500000 });
          setMyPinsOpen(false);
        }}
      />
    </div>
  );
}
