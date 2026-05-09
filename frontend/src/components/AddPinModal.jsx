import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIN_TYPES } from "@/lib/pinTypes";
import api from "@/lib/api";
import { toast } from "sonner";

export default function AddPinModal({ open, onOpenChange, lat, lng, onCreated }) {
  const [type, setType] = useState("person");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [hood, setHood] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post("/pins", { type, name, city, hood, lat, lng });
      toast.success("Pin gönderildi! Moderasyon onayından sonra haritada görünecek.");
      onCreated?.(res.data.pin);
      onOpenChange(false);
      setName(""); setCity(""); setHood(""); setType("person");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Eklenemedi");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        data-testid="add-pin-modal"
        className="bg-[#0b0d14] border-white/10 text-white sm:max-w-[460px]"
      >
        <DialogHeader>
          <DialogTitle className="text-2xl tracking-tight">Pin Ekle</DialogTitle>
          <DialogDescription className="text-white/60">
            {lat != null && lng != null ? (
              <>Konum: <code className="text-white/80">{lat.toFixed(3)}, {lng.toFixed(3)}</code></>
            ) : "Önce haritada bir konum seç."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-3 mt-2">
          <div>
            <Label className="text-white/70">Kategori</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger data-testid="pin-type-select" className="bg-white/5 border-white/10 text-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-[#0b0d14] text-white border-white/10">
                {Object.entries(PIN_TYPES).map(([k, v]) => (
                  <SelectItem key={k} value={k} data-testid={`pin-type-option-${k}`}>
                    <span className="mr-2">{v.emoji}</span>{v.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-white/70">İsim</Label>
            <Input
              data-testid="pin-name-input"
              required value={name} onChange={(e) => setName(e.target.value)}
              className="bg-white/5 border-white/10 text-white"
              placeholder="Mekan / kişi adı"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-white/70">Şehir</Label>
              <Input
                data-testid="pin-city-input"
                required value={city} onChange={(e) => setCity(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
                placeholder="Berlin"
              />
            </div>
            <div>
              <Label className="text-white/70">Mahalle</Label>
              <Input
                data-testid="pin-hood-input"
                value={hood} onChange={(e) => setHood(e.target.value)}
                className="bg-white/5 border-white/10 text-white"
                placeholder="Kreuzberg"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              data-testid="pin-cancel-btn"
              type="button" variant="ghost"
              onClick={() => onOpenChange(false)}
              className="text-white hover:bg-white/10"
            >
              Vazgeç
            </Button>
            <Button
              data-testid="pin-submit-btn"
              type="submit" disabled={busy || lat == null}
              className="bg-[#ffd166] text-black hover:bg-[#ffdd85]"
            >
              {busy ? "Gönderiliyor..." : "Gönder"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
