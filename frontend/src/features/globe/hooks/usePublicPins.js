import { useCallback, useEffect, useState } from "react";
import { getApprovedPublicPins } from "@/features/globe/services/pinService";
import { DEMO_PINS } from "@/features/globe/constants/demoPins";

export function usePublicPins() {
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [setupRequired, setSetupRequired] = useState(false);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const result = await getApprovedPublicPins();
      const nextPins = result.pins.length === 0 && process.env.NODE_ENV !== "production"
        ? DEMO_PINS
        : result.pins;
      setPins(nextPins);
      setSetupRequired(result.setupRequired);
    } catch (err) {
      setError(err?.response?.data?.detail || "Public pins could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { pins, loading, error, setupRequired, refetch };
}
