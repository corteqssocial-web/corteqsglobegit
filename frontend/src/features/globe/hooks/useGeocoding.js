import { useState } from "react";
import { searchLocations } from "@/features/globe/services/geocodingService";

export function useGeocoding() {
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const search = async (query) => {
    if (!query || query.trim().length < 2) {
      setResults([]);
      return [];
    }

    setLoading(true);
    setError("");
    try {
      const nextResults = await searchLocations(query);
      setResults(nextResults);
      if (nextResults.length === 0) {
        setError("Location search is not available right now. You can enter latitude and longitude manually.");
      }
      return nextResults;
    } catch (err) {
      const message = err?.message || "Location search is not available right now. You can enter latitude and longitude manually.";
      setError(message);
      setResults([]);
      return [];
    } finally {
      setLoading(false);
    }
  };

  return { results, loading, error, search, setResults };
}
