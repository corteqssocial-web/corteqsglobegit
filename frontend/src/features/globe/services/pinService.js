import api from "@/lib/api";
import { normalizeIncomingPin } from "@/features/globe/types/pin.types";

export async function getApprovedPublicPins() {
  const res = await api.get("/pins");
  return {
    pins: (res.data?.pins || []).map(normalizeIncomingPin),
    setupRequired: Boolean(res.data?.setup_required),
  };
}

export async function getMyPins() {
  const res = await api.get("/pins/mine");
  return (res.data?.pins || []).map(normalizeIncomingPin);
}

export async function createPendingPin(input) {
  const res = await api.post("/pins", {
    type: input.category,
    name: input.title,
    city: input.city,
    hood: input.hood || "",
    description: input.description || "",
    lat: Number(input.lat),
    lng: Number(input.lng),
    image_url: input.image_url || "",
    location_label: input.address || input.label || "",
    canonical_city: input.canonical_city || input.city,
    country_code: input.country_code || "",
    provider: input.provider || "",
    provider_id: input.provider_id || "",
    visibility: input.visibility || "public",
  });
  return normalizeIncomingPin(res.data?.pin || {});
}

export async function adminApprovePin(pinId) {
  const res = await api.patch(`/pins/${pinId}`, { status: "approved" });
  return normalizeIncomingPin(res.data?.pin || {});
}

export async function adminRejectPin(pinId, reason) {
  const res = await api.patch(`/pins/${pinId}`, {
    status: "rejected",
    rejection_reason: reason || "",
  });
  return normalizeIncomingPin(res.data?.pin || {});
}

export async function deleteOwnPin(pinId) {
  await api.delete(`/pins/${pinId}`);
}
