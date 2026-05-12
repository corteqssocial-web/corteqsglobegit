import { CITIES } from "./pinTypes";

const CITY_ENTRIES = Object.entries(CITIES).map(([key, coords]) => ({
  key,
  label: formatCityLabel(key),
  normalized: normalizeSearchText(key),
  lat: coords.lat,
  lng: coords.lng,
  source: "local",
}));

export function normalizeSearchText(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("tr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

export function formatCityLabel(value) {
  return String(value || "").replace(/\b\w/g, (char) => char.toLocaleUpperCase("tr"));
}

export function findExactLocalCity(query) {
  const normalizedQuery = normalizeSearchText(query);
  return CITY_ENTRIES.find((entry) => entry.normalized === normalizedQuery) || null;
}

export function getLocalCityMatches(query, limit = 3) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  return CITY_ENTRIES
    .filter((entry) => entry.normalized.includes(normalizedQuery))
    .sort((a, b) => scoreLocalEntry(a, normalizedQuery) - scoreLocalEntry(b, normalizedQuery))
    .slice(0, limit)
    .map((entry) => ({
      label: entry.label,
      city: entry.key,
      lat: entry.lat,
      lng: entry.lng,
      source: "local",
    }));
}

export function rankRemoteGeocodeResults(results, query, localMatches = []) {
  const normalizedQuery = normalizeSearchText(query);
  const localNames = new Set(localMatches.map((match) => normalizeSearchText(match.city || match.label)));

  return (results || [])
    .map((result) => ({
      ...result,
      source: "google",
      normalizedCity: normalizeSearchText(result.city),
      normalizedLabel: normalizeSearchText(result.label),
      rank: scoreRemoteResult(result, normalizedQuery),
    }))
    .filter((result) => {
      if (!normalizedQuery) return false;
      if (localNames.has(result.normalizedCity)) return false;
      return result.rank < 100;
    })
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 5)
    .map(({ normalizedCity, normalizedLabel, rank, ...result }) => result);
}

function scoreLocalEntry(entry, normalizedQuery) {
  if (entry.normalized === normalizedQuery) return 0;
  if (entry.normalized.startsWith(normalizedQuery)) return 1;
  return 2;
}

function scoreRemoteResult(result, normalizedQuery) {
  const normalizedCity = normalizeSearchText(result.city);
  const normalizedLabel = normalizeSearchText(result.label);

  if (normalizedCity === normalizedQuery) return 10;
  if (normalizedLabel === normalizedQuery) return 11;
  if (normalizedCity.startsWith(normalizedQuery)) return 20;
  if (normalizedLabel.startsWith(normalizedQuery)) return 30;
  if (normalizedCity.includes(normalizedQuery)) return 40;
  if (normalizedLabel.includes(normalizedQuery)) return 50;
  return 100;
}
