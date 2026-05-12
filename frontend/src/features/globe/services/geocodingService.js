import api from "@/lib/api";
import { searchStaticCities } from "@/features/globe/services/geocodingProviders/staticCityProvider";

function dedupeResults(results) {
  const seen = new Set();
  return results.filter((result) => {
    const key = `${result.provider}:${result.city}:${result.lat}:${result.lng}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function searchLocations(query) {
  const staticResults = await searchStaticCities(query);
  let backendResults = [];

  try {
    const res = await api.get("/locations/search", { params: { q: query } });
    backendResults = (res.data?.results || []).map((result, index) => ({
      id: result.provider_id || `backend-${index}-${result.city || result.label}`,
      label: result.label,
      city: result.city,
      country: result.country,
      address: result.label,
      lat: result.lat,
      lng: result.lng,
      provider: result.provider || "backend",
      provider_id: result.provider_id || "",
      country_code: result.country_code || "",
      canonical_city: result.canonical_name || result.city,
      precision: result.precision || "",
    }));
  } catch {
    backendResults = [];
  }

  return dedupeResults([...staticResults, ...backendResults]);
}
