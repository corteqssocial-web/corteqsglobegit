import { useCallback, useEffect, useState } from "react";
import { getMyPins } from "@/features/globe/services/pinService";

export function useMyPins(enabled) {
  const [pins, setPins] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    if (!enabled) {
      setPins([]);
      return;
    }

    setLoading(true);
    setError("");
    try {
      setPins(await getMyPins());
    } catch (err) {
      setError(err?.response?.data?.detail || "Your pins could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { pins, loading, error, refetch };
}
