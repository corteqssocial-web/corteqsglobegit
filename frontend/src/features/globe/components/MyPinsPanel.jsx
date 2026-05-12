import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const GROUPS = ["pending", "approved", "rejected"];

export default function MyPinsPanel({ open, onOpenChange, pins, loading, error, onFlyTo }) {
  const grouped = GROUPS.map((status) => ({
    status,
    items: pins.filter((pin) => pin.status === status),
  }));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] border-l-white/10 bg-[#08101d] p-0 text-white sm:max-w-[420px]">
        <div className="h-full overflow-y-auto p-6">
          <SheetHeader className="text-left">
            <SheetTitle className="text-white">My Pins</SheetTitle>
          </SheetHeader>
          <p className="mt-2 text-sm text-white/55">Pending pins are visible only to you until they are approved.</p>
          {loading && <p className="mt-6 text-sm text-white/55">Loading your pins…</p>}
          {error && <p className="mt-6 text-sm text-amber-200/90">{error}</p>}
          {!loading && !error && grouped.every((group) => group.items.length === 0) && (
            <p className="mt-6 text-sm text-white/55">You have not submitted any pins yet.</p>
          )}
          <div className="mt-6 space-y-6">
            {grouped.map((group) => (
              <section key={group.status}>
                <h3 className="text-xs uppercase tracking-[0.24em] text-white/45">{group.status}</h3>
                <div className="mt-3 space-y-3">
                  {group.items.map((pin) => (
                    <div key={pin.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-sm font-medium">{pin.title || pin.name}</div>
                          <div className="mt-1 text-xs text-white/55">
                            {[pin.city, pin.country].filter(Boolean).join(", ")} · {pin.type}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => onFlyTo?.(pin)}
                          className="rounded-full border border-white/10 px-3 py-1 text-xs text-white/70 transition hover:bg-white/10 hover:text-white"
                        >
                          Fly To
                        </button>
                      </div>
                      {pin.rejection_reason && (
                        <p className="mt-3 text-xs text-amber-200/90">Reason: {pin.rejection_reason}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
