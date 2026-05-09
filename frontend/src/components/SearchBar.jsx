import React, { useEffect, useRef, useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { CITIES } from "@/lib/pinTypes";
import api from "@/lib/api";

export default function SearchBar({ onFly }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef();
  const ignoreRef = useRef(false);

  // Live geocoding suggestions on type
  useEffect(() => {
    if (ignoreRef.current) { ignoreRef.current = false; return; }
    clearTimeout(debounceRef.current);
    if (!q || q.length < 2) {
      setResults([]); setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      // First: local CITIES match
      const matches = Object.entries(CITIES)
        .filter(([k]) => k.includes(q.toLowerCase()))
        .slice(0, 3)
        .map(([k, v]) => ({ label: k.replace(/\b\w/g, (c) => c.toUpperCase()), city: k, lat: v.lat, lng: v.lng, source: "local" }));
      // Then: geocode
      try {
        const res = await api.get("/geocode", { params: { q } });
        const remote = (res.data.results || []).slice(0, 5).map((r) => ({ ...r, source: "google" }));
        const combined = [...matches, ...remote.filter((r) => !matches.find((m) => m.city?.toLowerCase() === r.city?.toLowerCase()))].slice(0, 6);
        setResults(combined);
        setOpen(combined.length > 0);
      } catch {
        setResults(matches);
        setOpen(matches.length > 0);
      }
    }, 280);
  }, [q]);

  const submit = async (e) => {
    e?.preventDefault?.();
    if (!q.trim()) return;
    const key = q.trim().toLowerCase();
    if (CITIES[key]) {
      onFly(CITIES[key]);
      setOpen(false);
      return;
    }
    // Fall back to geocode (first result)
    setBusy(true);
    try {
      const res = await api.get("/geocode", { params: { q } });
      const first = res.data.results?.[0];
      if (first) {
        onFly({ lat: first.lat, lng: first.lng });
        ignoreRef.current = true;
        setQ(first.city || first.label);
      }
    } finally { setBusy(false); setOpen(false); }
  };

  const pick = (r) => {
    onFly({ lat: r.lat, lng: r.lng });
    ignoreRef.current = true;
    setQ(r.city ? r.city.replace(/\b\w/g, (c) => c.toUpperCase()) : r.label);
    setOpen(false);
  };

  return (
    <div className="relative w-full">
      <form onSubmit={submit} className="relative">
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <input
          data-testid="search-input"
          value={q} onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Şehir ara…"
          className="w-full bg-white/[0.06] backdrop-blur-md border border-white/10 rounded-full pl-11 pr-12 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#ffd166]/40 transition"
        />
        {busy && <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40 animate-spin" />}
      </form>
      {open && results.length > 0 && (
        <div data-testid="search-results" className="absolute top-full mt-2 w-full bg-[#0b0d14]/95 backdrop-blur-md border border-white/10 rounded-2xl overflow-hidden z-30">
          {results.map((r, i) => (
            <button
              key={i}
              data-testid={`search-result-${i}`}
              type="button"
              onClick={() => pick(r)}
              className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-b-0 transition"
            >
              <div className="text-sm text-white">{r.label}</div>
              <div className="text-xs text-white/40">
                {r.country ? `${r.country} · ` : ""}{r.lat?.toFixed(2)}, {r.lng?.toFixed(2)} {r.source === "local" && "· hızlı"}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
