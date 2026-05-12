const STATIC_CITIES = [
  ["Dortmund", "Germany", 51.5136, 7.4653],
  ["Berlin", "Germany", 52.52, 13.405],
  ["Cologne", "Germany", 50.9375, 6.9603],
  ["Dusseldorf", "Germany", 51.2277, 6.7735],
  ["Munich", "Germany", 48.1374, 11.5755],
  ["Hamburg", "Germany", 53.5511, 9.9937],
  ["Frankfurt", "Germany", 50.1109, 8.6821],
  ["Stuttgart", "Germany", 48.7758, 9.1829],
  ["Amsterdam", "Netherlands", 52.3676, 4.9041],
  ["Rotterdam", "Netherlands", 51.9244, 4.4777],
  ["Brussels", "Belgium", 50.8503, 4.3517],
  ["Paris", "France", 48.8566, 2.3522],
  ["London", "United Kingdom", 51.5072, -0.1276],
  ["Vienna", "Austria", 48.2082, 16.3738],
  ["Zurich", "Switzerland", 47.3769, 8.5417],
  ["Istanbul", "Türkiye", 41.0082, 28.9784],
  ["Ankara", "Türkiye", 39.9334, 32.8597],
  ["Izmir", "Türkiye", 38.4237, 27.1428],
  ["New York", "United States", 40.7128, -74.006],
  ["Toronto", "Canada", 43.6532, -79.3832],
];

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

export async function searchStaticCities(query) {
  const normalizedQuery = normalize(query);
  if (!normalizedQuery) return [];

  return STATIC_CITIES
    .filter(([city, country]) => {
      const haystack = `${city} ${country}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    })
    .slice(0, 8)
    .map(([city, country, lat, lng]) => ({
      id: `static-${normalize(city).replace(/\s+/g, "-")}`,
      label: `${city}, ${country}`,
      city,
      country,
      address: `${city}, ${country}`,
      lat,
      lng,
      provider: "static",
    }));
}
