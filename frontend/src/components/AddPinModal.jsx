import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, Loader2 } from "lucide-react";
import { PIN_TYPES } from "@/lib/pinTypes";
import api from "@/lib/api";
import { toast } from "sonner";

export default function AddPinModal({ open, onOpenChange, lat, lng, onCreated }) {
  const [type, setType] = useState("person");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [hood, setHood] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef();

  const reset = () => {
    setName(""); setCity(""); setHood(""); setDescription(""); setType("person");
    setImageUrl(""); setImagePreview("");
  };

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) {
      toast.error("Resim çok büyük (max 4 MB)");
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => setImagePreview(ev.target.result);
    reader.readAsDataURL(file);
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await api.post("/upload/pin-image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setImageUrl(res.data.url);
      toast.success("Resim yüklendi");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Yükleme başarısız");
      setImagePreview("");
    } finally { setUploading(false); }
  };

  const removeImage = () => {
    setImageUrl(""); setImagePreview("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await api.post("/pins", { type, name, city, hood, description, image_url: imageUrl, lat, lng });
      toast.success("Pin gönderildi! Moderasyon onayından sonra haritada görünecek.");
      onCreated?.(res.data.pin);
      onOpenChange(false);
      reset();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Eklenemedi");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <DialogContent
        data-testid="add-pin-modal"
        className="bg-[#0b0d14] border-white/10 text-white sm:max-w-[500px] max-h-[92vh] overflow-y-auto"
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
          <div>
            <Label className="text-white/70">Açıklama (opsiyonel)</Label>
            <Textarea
              data-testid="pin-description-input"
              value={description} onChange={(e) => setDescription(e.target.value)}
              className="bg-white/5 border-white/10 text-white min-h-[80px]"
              placeholder="Bu yer hakkında birkaç cümle…"
              maxLength={500}
            />
          </div>
          <div>
            <Label className="text-white/70">Görsel (opsiyonel)</Label>
            {imagePreview ? (
              <div className="relative mt-1 group">
                <img src={imagePreview} alt="" className="w-full h-40 object-cover rounded-lg border border-white/10" />
                {uploading && (
                  <div className="absolute inset-0 bg-black/60 rounded-lg flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-white" />
                  </div>
                )}
                {!uploading && (
                  <button
                    type="button"
                    data-testid="pin-image-remove"
                    onClick={removeImage}
                    className="absolute top-2 right-2 w-8 h-8 rounded-full bg-black/70 hover:bg-black/90 flex items-center justify-center transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                data-testid="pin-image-pick"
                onClick={() => fileRef.current?.click()}
                className="mt-1 w-full h-24 rounded-lg border border-dashed border-white/15 hover:border-white/30 hover:bg-white/[0.03] flex flex-col items-center justify-center gap-1 text-white/50 hover:text-white/70 transition"
              >
                <Upload className="w-4 h-4" />
                <span className="text-xs">Resim yükle (jpg/png/webp · max 4MB)</span>
              </button>
            )}
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={onPickFile} className="hidden" />
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
              type="submit" disabled={busy || uploading || lat == null}
              className="bg-[#ffd166] text-black hover:bg-[#ffdd85]"
            >
              {busy ? "Gönderiliyor..." : uploading ? "Resim yükleniyor..." : "Gönder"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
