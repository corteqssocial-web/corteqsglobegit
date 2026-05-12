import React, { useEffect, useRef, useState } from "react";
import { Loader2, MapPin } from "lucide-react";

export default function LocationSearch({
  placeholder,
  onSearch,
  results,
  loading,
  error,
  onSelect,
  selectedLocation,
}) {
  const [query, setQuery] = useState(selectedLocation?.label || "");
  const [open, setOpen] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    setQuery(selectedLocation?.label || selectedLocation?.city || "");
  }, [selectedLocation]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query || query.trim().length < 2) {
      setOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const nextResults = await onSearch(query);
      setOpen(nextResults.length > 0);
    }, 260);

    return () => clearTimeout(debounceRef.current);
  }, [onSearch, query]);

  return (
    <div className="relative">
      <div className="relative">
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={placeholder}
          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 pr-10 text-sm text-white outline-none focus:border-[#ffd166]/50"
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-white/50" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute top-full z-40 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#08101d]/95">
          {results.map((result) => (
            <button
              key={result.id}
              type="button"
              onClick={() => {
                onSelect(result);
                setQuery(result.label);
                setOpen(false);
              }}
              className="flex w-full items-start gap-3 border-b border-white/5 px-4 py-3 text-left transition hover:bg-white/5 last:border-b-0"
            >
              <MapPin className="mt-0.5 h-4 w-4 text-white/40" />
              <div className="min-w-0">
                <div className="truncate text-sm text-white">{result.label}</div>
                <div className="text-xs text-white/45">{result.provider} · {result.lat.toFixed(2)}, {result.lng.toFixed(2)}</div>
              </div>
            </button>
          ))}
        </div>
      )}
      {error && (
        <p className="mt-2 text-xs text-amber-200/85">
          {error}
        </p>
      )}
    </div>
  );
}
