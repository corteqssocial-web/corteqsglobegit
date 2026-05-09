import React from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, Calendar, Navigation } from "lucide-react";
import { PIN_TYPES } from "@/lib/pinTypes";

export default function PinDetailDrawer({ pin, open, onOpenChange, onFlyTo }) {
  if (!pin) return null;
  const t = PIN_TYPES[pin.type] || PIN_TYPES.person;
  const created = pin.created_at ? new Date(pin.created_at).toLocaleDateString("tr-TR", { year: "numeric", month: "long", day: "numeric" }) : "";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        data-testid="pin-detail-drawer"
        side="right"
        className="bg-[#0b0d14] border-l-white/10 text-white w-[380px] sm:max-w-md p-0 overflow-y-auto"
      >
        {/* Header image / fallback */}
        {pin.image_url ? (
          <div className="relative h-56 w-full overflow-hidden">
            <img
              data-testid="pin-detail-image"
              src={pin.image_url}
              alt={pin.name}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#0b0d14]" />
            <div className="absolute top-4 left-4 flex items-center gap-2">
              <span className="text-3xl drop-shadow-lg">{t.emoji}</span>
              <Badge style={{ background: t.color, color: "#000" }} className="font-medium">
                {t.label}
              </Badge>
            </div>
          </div>
        ) : (
          <div
            className="relative h-40 w-full flex items-center justify-center overflow-hidden"
            style={{ background: `radial-gradient(circle at 30% 30%, ${t.color}33, transparent 70%), #0a0c14` }}
          >
            <span className="text-7xl drop-shadow-2xl" style={{ filter: `drop-shadow(0 0 24px ${t.color})` }}>{t.emoji}</span>
            <div className="absolute top-4 left-4">
              <Badge style={{ background: t.color, color: "#000" }} className="font-medium">
                {t.label}
              </Badge>
            </div>
          </div>
        )}

        <div className="px-6 pt-4 pb-6 space-y-4">
          <SheetHeader className="space-y-1 text-left">
            <SheetTitle className="text-2xl tracking-tight text-white" data-testid="pin-detail-name">
              {pin.name}
            </SheetTitle>
            <SheetDescription asChild>
              <div className="flex items-center gap-2 text-white/60 text-sm">
                <MapPin className="w-3.5 h-3.5" />
                <span>{pin.hood ? `${pin.hood} · ` : ""}{pin.city}</span>
              </div>
            </SheetDescription>
          </SheetHeader>

          {pin.description && (
            <p data-testid="pin-detail-description" className="text-white/80 text-sm leading-relaxed whitespace-pre-line">
              {pin.description}
            </p>
          )}

          <div className="space-y-2 pt-2">
            <div className="flex items-center gap-2 text-xs text-white/50">
              <Navigation className="w-3.5 h-3.5" />
              <span className="tabular-nums">{pin.lat?.toFixed(4)}, {pin.lng?.toFixed(4)}</span>
            </div>
            {created && (
              <div className="flex items-center gap-2 text-xs text-white/50">
                <Calendar className="w-3.5 h-3.5" />
                <span>{created} eklendi</span>
              </div>
            )}
          </div>

          {pin.status && pin.status !== "approved" && (
            <Badge variant="outline" className="border-amber-500/40 text-amber-300">
              {pin.status === "pending" ? "Moderasyon bekliyor" : "Reddedildi"}
            </Badge>
          )}

          <div className="pt-3">
            <Button
              data-testid="pin-detail-flyto"
              onClick={() => onFlyTo?.(pin)}
              className="w-full bg-[#ffd166] text-black hover:bg-[#ffdd85]"
            >
              <Navigation className="w-4 h-4 mr-2" />
              Buraya yakınlaş
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
