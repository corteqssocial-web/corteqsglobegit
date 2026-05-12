import * as Cesium from "cesium";
import { DEFAULT_CAMERA } from "@/features/globe/constants/defaultCamera";

export function flyToLocation(viewer, lat, lng, height = DEFAULT_CAMERA.height) {
  if (!viewer) return;
  viewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
    duration: 1.8,
  });
}

export function flyToPin(viewer, pin) {
  if (!viewer || !pin) return;
  flyToLocation(viewer, pin.lat, pin.lng, 3500000);
}

export function flyToDefaultView(viewer) {
  if (!viewer) return;
  flyToLocation(viewer, DEFAULT_CAMERA.lat, DEFAULT_CAMERA.lng, DEFAULT_CAMERA.height);
}
