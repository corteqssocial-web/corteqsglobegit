import React from "react";
import { X } from "lucide-react";
import { GLOBE_CATEGORIES } from "@/features/globe/constants/categories";

export default function PinPopup({ pin, onClose, onFlyTo }) {
  if (!pin) return null;
  const category = GLOBE_CATEGORIES[pin.category || pin.type] || GLOBE_CATEGORIES.person;

  return (
    <div className="absolute bottom-6 right-6 z-30 w-[min(380px,calc(100vw-2rem))] rounded-3xl border border-white/10 bg-[#07101dcc] p-5 text-white shadow-2xl backdrop-blur-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-[0.24em] text-white/45">Pin Detail</div>
          <h3 className="mt-1 text-2xl font-semibold">{pin.title || pin.name}</h3>
          <div className="mt-2 text-sm text-white/65">
            {category.label} · {[pin.city, pin.country].filter(Boolean).join(", ")}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-white/10 p-2 text-white/65 transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {pin.description && (
        <p className="mt-4 text-sm leading-6 text-white/80">{pin.description}</p>
      )}
      <div className="mt-4 flex items-center justify-between text-xs text-white/55">
        <span>{pin.lat?.toFixed(4)}, {pin.lng?.toFixed(4)}</span>
        <span className="rounded-full border border-white/10 px-3 py-1">{pin.status}</span>
      </div>
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => onFlyTo?.(pin)}
          className="rounded-full bg-[#ffd166] px-4 py-2 text-sm font-medium text-black transition hover:bg-[#ffe29e]"
        >
          Fly To Pin
        </button>
      </div>
    </div>
  );
}
