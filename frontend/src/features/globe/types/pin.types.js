export const GLOBE_PIN_STATUSES = ["pending", "approved", "rejected"];
export const GLOBE_PIN_VISIBILITIES = ["public", "private"];

export function normalizeIncomingPin(pin) {
  return {
    ...pin,
    user_id: pin.user_id || "",
    title: pin.title || pin.name || "",
    name: pin.name || pin.title || "",
    category: pin.category || pin.type || "person",
    type: pin.type || pin.category || "person",
    description: pin.description || "",
    hood: pin.hood || "",
    city: pin.city || "",
    country: pin.country || pin.country_name || "",
    address: pin.address || pin.location_label || "",
    visibility: pin.visibility || "public",
    rejection_reason: pin.rejection_reason || "",
    updated_at: pin.updated_at || pin.created_at || new Date().toISOString(),
  };
}
