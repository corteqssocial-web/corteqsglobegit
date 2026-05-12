export function validatePinInput(input) {
  const errors = {};

  if (!input.title || input.title.trim().length < 2) {
    errors.title = "Title must be at least 2 characters.";
  }

  if (!input.category) {
    errors.category = "Category is required.";
  }

  if (!Number.isFinite(Number(input.lat)) || Number(input.lat) < -90 || Number(input.lat) > 90) {
    errors.lat = "Latitude must be between -90 and 90.";
  }

  if (!Number.isFinite(Number(input.lng)) || Number(input.lng) < -180 || Number(input.lng) > 180) {
    errors.lng = "Longitude must be between -180 and 180.";
  }

  if (!["public", "private"].includes(input.visibility)) {
    errors.visibility = "Visibility must be public or private.";
  }

  return errors;
}
