import React, { useEffect, useRef } from "react";
import * as Cesium from "cesium";
import { DEFAULT_CAMERA } from "@/features/globe/constants/defaultCamera";
import { getPinIcon } from "@/features/globe/utils/pinIcons";
import { flyToDefaultView, flyToLocation } from "@/features/globe/utils/cesiumCamera";

function buildPinEntity(pin, isSelected) {
  return {
    id: pin.id,
    position: Cesium.Cartesian3.fromDegrees(pin.lng, pin.lat),
    billboard: {
      image: getPinIcon(pin.category || pin.type),
      width: isSelected ? 38 : 30,
      height: isSelected ? 38 : 30,
      verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      scaleByDistance: new Cesium.NearFarScalar(1500000, 1.2, 18000000, 0.65),
    },
    label: {
      text: pin.title || pin.name || "",
      font: "14px sans-serif",
      fillColor: Cesium.Color.WHITE,
      showBackground: true,
      backgroundColor: Cesium.Color.fromCssColorString("#0b1220cc"),
      pixelOffset: new Cesium.Cartesian2(0, -44),
      scale: 0.75,
      distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 6000000),
    },
    properties: {
      pinData: pin,
    },
  };
}

export default function CesiumGlobe({
  pins,
  selectedPinId,
  onPinClick,
  onMapClick,
  onReady,
  initialCamera = DEFAULT_CAMERA,
  flyToTarget,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const clickHandlerRef = useRef(null);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;

    if (process.env.REACT_APP_CESIUM_ION_TOKEN) {
      Cesium.Ion.defaultAccessToken = process.env.REACT_APP_CESIUM_ION_TOKEN;
    }

    const viewer = new Cesium.Viewer(containerRef.current, {
      animation: false,
      baseLayerPicker: false,
      fullscreenButton: false,
      geocoder: false,
      homeButton: false,
      infoBox: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      selectionIndicator: false,
      timeline: false,
      vrButton: false,
      terrain: Cesium.Terrain.fromWorldTerrain(),
    });

    viewer.scene.globe.enableLighting = true;
    viewer.scene.skyAtmosphere.show = true;
    viewer.scene.screenSpaceCameraController.minimumZoomDistance = 1200000;
    viewer.scene.screenSpaceCameraController.maximumZoomDistance = 40000000;
    viewer.cesiumWidget.creditContainer.style.display = "none";

    clickHandlerRef.current = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    clickHandlerRef.current.setInputAction((movement) => {
      const picked = viewer.scene.pick(movement.position);
      const pickedPin = picked?.id?.properties?.pinData?.getValue?.() || picked?.id?.properties?.pinData;
      if (pickedPin) {
        onPinClick?.(pickedPin);
        return;
      }

      const ray = viewer.camera.getPickRay(movement.position);
      const cartesian = viewer.scene.globe.pick(ray, viewer.scene);
      if (!cartesian) return;
      const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
      onMapClick?.({
        lat: Number(Cesium.Math.toDegrees(cartographic.latitude).toFixed(6)),
        lng: Number(Cesium.Math.toDegrees(cartographic.longitude).toFixed(6)),
      });
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    viewerRef.current = viewer;
    flyToLocation(viewer, initialCamera.lat, initialCamera.lng, initialCamera.height);
    onReady?.(viewer);

    return () => {
      clickHandlerRef.current?.destroy();
      clickHandlerRef.current = null;
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [initialCamera, onMapClick, onPinClick, onReady]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;

    viewer.entities.removeAll();
    pins.forEach((pin) => {
      viewer.entities.add(buildPinEntity(pin, pin.id === selectedPinId));
    });
  }, [pins, selectedPinId]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !flyToTarget) return;
    flyToLocation(viewer, flyToTarget.lat, flyToTarget.lng, flyToTarget.height || 3500000);
  }, [flyToTarget]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || selectedPinId) return;
    if (pins.length === 0) {
      flyToDefaultView(viewer);
    }
  }, [pins.length, selectedPinId]);

  return <div ref={containerRef} className="absolute inset-0" data-testid="cesium-globe" />;
}
