import {
  findExactLocalCity,
  getLocalCityMatches,
  normalizeSearchText,
  rankRemoteGeocodeResults,
} from "./citySearch";

describe("citySearch", () => {
  it("normalizes Turkish text for reliable matching", () => {
    expect(normalizeSearchText("  ANKARA  ")).toBe("ankara");
    expect(normalizeSearchText("İzmir")).toBe("izmir");
    expect(normalizeSearchText("Sao   Paulo")).toBe("sao paulo");
  });

  it("finds exact local cities without depending on geocode", () => {
    const match = findExactLocalCity("Ankara");

    expect(match).toMatchObject({
      key: "ankara",
      lat: 39.93,
      lng: 32.85,
    });
  });

  it("ranks local prefix matches ahead of broader matches", () => {
    const matches = getLocalCityMatches("an", 5);

    expect(matches[0]).toMatchObject({ city: "ankara", source: "local" });
    expect(matches.some((match) => match.city === "frankfurt")).toBe(true);
  });

  it("filters remote geocode results that do not meaningfully match the query", () => {
    const ranked = rankRemoteGeocodeResults([
      { city: "Ankara", label: "Ankara, Turkey", lat: 39.93, lng: 32.85 },
      { city: "Ankara Province", label: "Ankara Province, Turkey", lat: 39.95, lng: 32.86 },
      { city: "Austin", label: "Austin, TX, USA", lat: 30.26, lng: -97.74 },
    ], "ankara", [{ city: "ankara", label: "Ankara", lat: 39.93, lng: 32.85 }]);

    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toMatchObject({
      city: "Ankara Province",
      source: "google",
    });
  });
});
