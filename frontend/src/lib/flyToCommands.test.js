import {
  buildClusterFlyToTarget,
  buildFlyToState,
  GLOBE_LONGITUDE_OFFSET_DEG,
  MAX_GLOBE_ZOOM,
  MIN_GLOBE_ZOOM,
  normalizeAngle,
} from "./flyToCommands";

function latLngTo3D(lat, lng, r = 1) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = (lng + GLOBE_LONGITUDE_OFFSET_DEG) * (Math.PI / 180);

  return {
    x: r * Math.sin(phi) * Math.sin(theta),
    y: r * Math.cos(phi),
    z: r * Math.sin(phi) * Math.cos(theta),
  };
}

function rotateY(point, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return {
    x: point.x * c + point.z * s,
    y: point.y,
    z: -point.x * s + point.z * c,
  };
}

function rotateX(point, angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);

  return {
    x: point.x,
    y: point.y * c - point.z * s,
    z: point.y * s + point.z * c,
  };
}

describe("flyToCommands", () => {
  it("computes globe fly-to rotations using longitude-first targeting", () => {
    const state = buildFlyToState(
      { lat: 52.52, lng: 13.405 },
      0,
      2.8,
      1.7
    );

    expect(state.targetRotationX).toBeCloseTo(0.9166, 3);
    expect(state.targetRotationY).toBeCloseTo(-1.8047, 3);
    expect(state.finalRotationY).toBeCloseTo(-1.8047, 3);
    expect(state.targetZoom).toBe(1.7);
  });

  it("centers northern hemisphere targets on the front of the globe", () => {
    const coords = { lat: 52.52, lng: 13.405 };
    const state = buildFlyToState(coords, 0, 2.8, 1.7);
    const rotated = rotateX(
      rotateY(latLngTo3D(coords.lat, coords.lng), state.finalRotationY),
      state.targetRotationX
    );

    expect(rotated.x).toBeCloseTo(0, 6);
    expect(rotated.y).toBeCloseTo(0, 6);
    expect(rotated.z).toBeCloseTo(1, 6);
  });

  it("centers southern hemisphere targets on the front of the globe", () => {
    const coords = { lat: -33.87, lng: 151.21 };
    const state = buildFlyToState(coords, 0, 2.8, 1.7);
    const rotated = rotateX(
      rotateY(latLngTo3D(coords.lat, coords.lng), state.finalRotationY),
      state.targetRotationX
    );

    expect(rotated.x).toBeCloseTo(0, 6);
    expect(rotated.y).toBeCloseTo(0, 6);
    expect(rotated.z).toBeCloseTo(1, 6);
  });

  it("centers targets with very different longitudes on the front of the globe", () => {
    const coords = { lat: 41.01, lng: 28.96 };
    const state = buildFlyToState(coords, 0, 2.8, 1.7);
    const rotated = rotateX(
      rotateY(latLngTo3D(coords.lat, coords.lng), state.finalRotationY),
      state.targetRotationX
    );

    expect(rotated.x).toBeCloseTo(0, 6);
    expect(rotated.y).toBeCloseTo(0, 6);
    expect(rotated.z).toBeCloseTo(1, 6);
  });

  it("uses the shortest wrap-around path for longitude rotation", () => {
    const state = buildFlyToState(
      { lat: 0, lng: 179 },
      -3.05,
      2.8,
      1.7
    );

    expect(Math.abs(normalizeAngle(state.finalRotationY) - 1.5883)).toBeLessThan(0.2);
  });

  it("clamps zoom requests into the supported camera range", () => {
    const low = buildFlyToState({ lat: 0, lng: 0 }, 0, 2.8, 0.1);
    const high = buildFlyToState({ lat: 0, lng: 0 }, 0, 2.8, 99);

    expect(low.targetZoom).toBe(MIN_GLOBE_ZOOM);
    expect(high.targetZoom).toBe(MAX_GLOBE_ZOOM);
  });

  it("keeps cluster fly-to zooming inward", () => {
    const target = buildClusterFlyToTarget({
      lat: 48.8568,
      lng: 2.3524,
      pins: [
        { lat: 48.8566, lng: 2.3522 },
        { lat: 48.857, lng: 2.3526 },
      ],
    }, 2.8);

    expect(target.lat).toBeCloseTo(48.8568, 4);
    expect(target.lng).toBeCloseTo(2.3524, 4);
    expect(target.zoom).toBeLessThan(2.8);
  });
});
