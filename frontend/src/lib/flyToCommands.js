export const PIN_FLY_TO_ZOOM = 1.7;

export function buildFlyToCommand(coords, id, options = {}) {
  if (coords?.lat == null || coords?.lng == null) return null;

  return {
    id,
    lat: coords.lat,
    lng: coords.lng,
    zoom: options.zoom ?? coords.zoom,
    source: options.source ?? "unknown",
  };
}

export function buildClusterFlyToTarget(cluster, currentZ) {
  const lats = cluster.pins.map((pin) => pin.lat);
  const lngs = cluster.pins.map((pin) => pin.lng);
  const spread = Math.max(
    Math.max(...lats) - Math.min(...lats),
    Math.max(...lngs) - Math.min(...lngs),
    0.05
  );

  const desiredRadius = Math.max(0.05, spread * 0.4);
  const t = Math.pow(Math.max(0, (desiredRadius - 0.02) / 12), 1 / 1.4);
  const targetZ = clamp(1.25 + t * (5.5 - 1.25), 1.25, 4.5);

  return {
    lat: cluster.lat,
    lng: cluster.lng,
    zoom: Math.min(targetZ, currentZ * 0.6),
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
