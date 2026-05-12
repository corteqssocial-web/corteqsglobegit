export const PIN_FLY_TO_ZOOM = 1.7;
export const MIN_GLOBE_ZOOM = 1.25;
export const MAX_GLOBE_ZOOM = 5.5;
export const MAX_GLOBE_TILT = 1.3;

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
  const targetZ = clamp(MIN_GLOBE_ZOOM + t * (MAX_GLOBE_ZOOM - MIN_GLOBE_ZOOM), MIN_GLOBE_ZOOM, 4.5);

  return {
    lat: cluster.lat,
    lng: cluster.lng,
    zoom: Math.min(targetZ, currentZ * 0.6),
  };
}

export function buildFlyToState(coords, currentRotationY, currentZoom, requestedZoom) {
  const targetRotationY = normalizeAngle(-toRadians(coords.lng));
  const targetRotationX = clamp(-toRadians(coords.lat), -MAX_GLOBE_TILT, MAX_GLOBE_TILT);
  const deltaY = shortestAngleDelta(currentRotationY, targetRotationY);

  return {
    targetRotationX,
    targetRotationY,
    finalRotationY: currentRotationY + deltaY,
    targetZoom: requestedZoom != null
      ? clamp(requestedZoom, MIN_GLOBE_ZOOM, MAX_GLOBE_ZOOM)
      : Math.max(1.55, currentZoom - 0.5),
  };
}

export function normalizeAngle(angle) {
  let next = angle;
  while (next > Math.PI) next -= 2 * Math.PI;
  while (next < -Math.PI) next += 2 * Math.PI;
  return next;
}

export function shortestAngleDelta(from, to) {
  let delta = normalizeAngle(to) - normalizeAngle(from);
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  return delta;
}

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}
