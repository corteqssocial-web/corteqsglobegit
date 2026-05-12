import { useState } from "react";
import { createPendingPin } from "@/features/globe/services/pinService";
import { validatePinInput } from "@/features/globe/utils/validation";

export function useAddPin() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const submitPin = async (input) => {
    const errors = validatePinInput(input);
    if (Object.keys(errors).length > 0) {
      const firstError = Object.values(errors)[0];
      throw new Error(firstError);
    }

    setSubmitting(true);
    setError("");
    try {
      return await createPendingPin(input);
    } catch (err) {
      const message = err?.response?.data?.detail || err?.message || "Pin could not be submitted.";
      setError(message);
      throw new Error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return { submitPin, submitting, error };
}
