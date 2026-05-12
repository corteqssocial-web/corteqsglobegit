import {
  buildClusterFlyToTarget,
  buildFlyToState,
  MAX_GLOBE_ZOOM,
  MIN_GLOBE_ZOOM,
} from "./flyToCommands";

describe("flyToCommands", () => {
  it("computes globe fly-to rotations using longitude-first targeting", () => {
    const state = buildFlyToState(
      { lat: 52.52, lng: 13.405 },
      0,
      2.8,
      1.7
    );

    expect(state.targetRotationX).toBeCloseTo(-0.9166, 3);
    expect(state.targetRotationY).toBeCloseTo(-0.2339, 3);
    expect(state.finalRotationY).toBeCloseTo(-0.2339, 3);
    expect(state.targetZoom).toBe(1.7);
  });

  it("uses the shortest wrap-around path for longitude rotation", () => {
    const state = buildFlyToState(
      { lat: 0, lng: 179 },
      -3.05,
      2.8,
      1.7
    );

    expect(Math.abs(state.finalRotationY + 3.1241)).toBeLessThan(0.2);
    expect(Math.abs(state.finalRotationY - (-3.05))).toBeLessThan(0.2);
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
