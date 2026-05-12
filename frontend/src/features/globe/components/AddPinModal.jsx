import React, { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { GLOBE_CATEGORY_OPTIONS } from "@/features/globe/constants/categories";
import LocationSearch from "@/features/globe/components/LocationSearch";

export default function AddPinModal({
  open,
  onOpenChange,
  user,
  geocoding,
  selectedLocation,
  onLocationSelect,
  onSubmit,
  submitting,
  submitError,
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("person");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [manualLat, setManualLat] = useState("");
  const [manualLng, setManualLng] = useState("");

  const effectiveLocation = useMemo(() => {
    if (selectedLocation) return selectedLocation;
    if (manualLat && manualLng) {
      return {
        id: "manual",
        label: `Manual ${manualLat}, ${manualLng}`,
        city: "",
        country: "",
        lat: Number(manualLat),
        lng: Number(manualLng),
        provider: "manual",
      };
    }
    return null;
  }, [manualLat, manualLng, selectedLocation]);

  const reset = () => {
    setTitle("");
    setCategory("person");
    setDescription("");
    setVisibility("public");
    setManualLat("");
    setManualLng("");
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => {
      onOpenChange(nextOpen);
      if (!nextOpen) reset();
    }}>
      <DialogContent className="border-white/10 bg-[#08101d] text-white sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Add my pin</DialogTitle>
          <DialogDescription className="text-white/60">
            {user ? "Your pin was submitted and is waiting for approval." : "Please log in to add your pin to the CorteQS Globe."}
          </DialogDescription>
        </DialogHeader>
        {!user ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 text-sm text-white/70">
            Please log in to add your pin to the CorteQS Globe.
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!effectiveLocation) return;
              onSubmit({
                title,
                category,
                description,
                visibility,
                city: effectiveLocation.city || "",
                country: effectiveLocation.country || "",
                lat: effectiveLocation.lat,
                lng: effectiveLocation.lng,
                provider: effectiveLocation.provider,
                address: effectiveLocation.address || effectiveLocation.label || "",
                canonical_city: effectiveLocation.canonical_city || effectiveLocation.city || "",
                country_code: effectiveLocation.country_code || "",
              });
            }}
          >
            <div>
              <label className="mb-2 block text-sm text-white/70">Location</label>
              <LocationSearch
                placeholder="Search city or location"
                onSearch={geocoding.search}
                results={geocoding.results}
                loading={geocoding.loading}
                error={geocoding.error}
                onSelect={(location) => {
                  setManualLat("");
                  setManualLng("");
                  onLocationSelect(location);
                }}
                selectedLocation={selectedLocation}
              />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <input
                  value={manualLat}
                  onChange={(event) => setManualLat(event.target.value)}
                  placeholder="Latitude"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                />
                <input
                  value={manualLng}
                  onChange={(event) => setManualLng(event.target.value)}
                  placeholder="Longitude"
                  className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-white/70">Title</label>
                <input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-white/70">Category</label>
                <select
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  className="w-full rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none"
                >
                  {GLOBE_CATEGORY_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm text-white/70">Description</label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={4}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm text-white/70">Visibility</label>
              <select
                value={visibility}
                onChange={(event) => setVisibility(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#08101d] px-4 py-3 text-sm text-white outline-none"
              >
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
            {submitError && <p className="text-sm text-amber-200/90">{submitError}</p>}
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-white/75 transition hover:bg-white/10 hover:text-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || !effectiveLocation}
                className="rounded-full bg-[#ffd166] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#ffe29e] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Submitting…" : "Submit pin"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
