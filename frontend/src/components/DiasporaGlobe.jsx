import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import * as THREE from "three";
import { PIN_TYPES, CITIES } from "@/lib/pinTypes";

const GLOBE_RADIUS = 1;

function latLngTo3D(lat, lng, r = GLOBE_RADIUS) {
  const phi = (90 - lat) * (Math.PI / 180);
  const theta = lng * (Math.PI / 180);
  return new THREE.Vector3(
    r * Math.sin(phi) * Math.sin(theta),
    r * Math.cos(phi),
    r * Math.sin(phi) * Math.cos(theta)
  );
}
function toScreen(world, camera, w, h) {
  const v = world.clone().project(camera);
  return { x: (v.x * 0.5 + 0.5) * w, y: (-v.y * 0.5 + 0.5) * h };
}
function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ---------- Clustering ----------
function clusterPins(pins, radiusDeg) {
  const clusters = [];
  for (const p of pins) {
    let added = false;
    for (const c of clusters) {
      const dlat = p.lat - c.lat;
      let dlng = p.lng - c.lng;
      while (dlng > 180) dlng -= 360;
      while (dlng < -180) dlng += 360;
      const lngScale = Math.max(0.3, Math.cos((c.lat * Math.PI) / 180));
      if (Math.abs(dlat) < radiusDeg && Math.abs(dlng) * lngScale < radiusDeg) {
        c.pins.push(p);
        c.lat = c.pins.reduce((s, x) => s + x.lat, 0) / c.pins.length;
        c.lng = c.pins.reduce((s, x) => s + x.lng, 0) / c.pins.length;
        added = true;
        break;
      }
    }
    if (!added) clusters.push({ pins: [p], lat: p.lat, lng: p.lng });
  }
  return clusters.map((c) => ({
    ...c,
    id: c.pins.length === 1 ? `p_${c.pins[0].id}` : `c_${c.pins.map((x) => x.id).slice(0, 4).join("_")}`,
  }));
}

export default function DiasporaGlobe({
  pins,
  filter,
  arrivedIds,
  onPinClick,
  onGlobeClick,
  searchQuery,
  searchTrigger,
  flyToCoords,
}) {
  const mountRef = useRef(null);
  const overlayRefs = useRef({});      // keyed by cluster.id
  const threeRef = useRef({});
  const sizeRef = useRef({ W: 0, H: 0 });
  const filterRef = useRef(filter);
  const clustersRef = useRef([]);
  const autoRotate = useRef(true);
  const dragTimer = useRef(null);
  const isDragging = useRef(false);
  const dragLast = useRef({ x: 0, y: 0 });
  const dragMoved = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const mouseNDC = useRef({ x: -10, y: -10 });
  const prevHover = useRef(null);
  const pinchRef = useRef({ active: false, dist: 0 });

  const [hovered, setHovered] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [zoomZ, setZoomZ] = useState(2.8);

  useEffect(() => { filterRef.current = filter; }, [filter]);

  // Clusters depend on pins, filter, zoom — radius shrinks aggressively as user zooms in
  const clusters = useMemo(() => {
    const visible = (filter && filter !== "all") ? pins.filter((p) => p.type === filter) : pins;
    // z range: 1.25 (max zoom in) → 5.5 (max zoom out)
    // radius range: 0.02° (separates pins ~2km apart) → 12° (clusters whole continents)
    const t = (zoomZ - 1.25) / (5.5 - 1.25);   // 0..1
    const radius = 0.02 + Math.pow(clamp(t, 0, 1), 1.4) * 12;
    return clusterPins(visible, radius);
  }, [pins, filter, zoomZ]);

  useEffect(() => { clustersRef.current = clusters; }, [clusters]);

  // ----- Three.js init (mount once) -----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const W = mount.clientWidth, H = mount.clientHeight;
    sizeRef.current = { W, H };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.z = 2.8;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const globe = new THREE.Group();
    scene.add(globe);

    const earthMat = new THREE.MeshPhongMaterial({ color: 0x1a3d78, shininess: 18, specular: 0x222244 });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), earthMat);
    globe.add(earthMesh);

    new THREE.TextureLoader().load(
      "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
      (tex) => { earthMat.map = tex; earthMat.color = new THREE.Color(0xffffff); earthMat.needsUpdate = true; },
      undefined, () => {}
    );

    globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.025, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.08, side: THREE.FrontSide })));
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.20, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x3366ff, transparent: true, opacity: 0.055, side: THREE.BackSide })));
    globe.add(new THREE.Mesh(new THREE.SphereGeometry(1.40, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x3366ff, transparent: true, opacity: 0.025, side: THREE.BackSide })));

    const makeStars = (count, size, range) => {
      const positions = new Float32Array(count * 3);
      for (let i = 0; i < count; i++) {
        positions[3 * i] = (Math.random() - 0.5) * range;
        positions[3 * i + 1] = (Math.random() - 0.5) * range;
        positions[3 * i + 2] = (Math.random() - 0.5) * range;
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({ color: 0xffffff, size, sizeAttenuation: true, transparent: true, opacity: 0.85 });
      return new THREE.Points(geom, mat);
    };
    scene.add(makeStars(3000, 0.10, 60));
    scene.add(makeStars(500, 0.20, 60));

    scene.add(new THREE.AmbientLight(0x334466, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(5, 3, 5); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x3366ff, 0.3); rim.position.set(-6, 1, -4); scene.add(rim);

    const overlayMeshes = []; // one per cluster
    const raycaster = new THREE.Raycaster();
    threeRef.current = { scene, camera, renderer, globe, earthMat, earthMesh, overlayMeshes, raycaster };

    const worldPos = new THREE.Vector3();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (autoRotate.current) globe.rotation.y += 0.0018;

      const { W, H } = sizeRef.current;
      overlayMeshes.forEach((mesh) => {
        const cid = mesh.userData.clusterId;
        const dom = overlayRefs.current[cid];
        if (!dom) return;
        mesh.getWorldPosition(worldPos);
        const sc = toScreen(worldPos, camera, W, H);
        const isVisible = worldPos.z > -0.05;
        const alpha = isVisible ? clamp(worldPos.z * 1.8, 0, 1) : 0;
        dom.style.left = sc.x + "px";
        dom.style.top = sc.y + "px";
        dom.style.opacity = alpha.toFixed(3);
        dom.style.pointerEvents = alpha > 0.3 ? "auto" : "none";
        mesh.visible = alpha > 0.05;
      });

      if (!isDragging.current && overlayMeshes.length > 0) {
        raycaster.setFromCamera(mouseNDC.current, camera);
        const hits = raycaster.intersectObjects(overlayMeshes);
        const newHover = hits.length ? hits[0].object.userData.clusterId : null;
        if (newHover !== prevHover.current) {
          prevHover.current = newHover;
          setHovered(newHover);
        }
      }

      renderer.render(scene, camera);
    };
    tick();

    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      sizeRef.current = { W: w, H: h };
      camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      try { mount.removeChild(renderer.domElement); } catch {}
      renderer.dispose();
      earthMesh.geometry.dispose();
      earthMat.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ----- Rebuild cluster hitboxes when `clusters` change -----
  useEffect(() => {
    const t = threeRef.current;
    if (!t.globe) return;
    t.overlayMeshes.forEach((m) => {
      t.globe.remove(m); m.geometry.dispose(); m.material.dispose();
    });
    t.overlayMeshes.length = 0;
    const hitGeom = new THREE.SphereGeometry(0.04, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    clusters.forEach((c) => {
      const pos = latLngTo3D(c.lat, c.lng, GLOBE_RADIUS * 1.015);
      const m = new THREE.Mesh(hitGeom, hitMat.clone());
      m.position.copy(pos);
      m.userData.clusterId = c.id;
      t.globe.add(m);
      t.overlayMeshes.push(m);
    });
  }, [clusters]);

  // ----- Zoom polling -----
  useEffect(() => {
    const id = setInterval(() => {
      const z = threeRef.current?.camera?.position?.z;
      if (z != null && Math.abs(z - zoomZ) > 0.08) setZoomZ(z);
    }, 250);
    return () => clearInterval(id);
  }, [zoomZ]);

  // ----- Mouse / touch interaction -----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const setNDC = (clientX, clientY) => {
      const rect = mount.getBoundingClientRect();
      mouseNDC.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };
    const beginInteract = () => { autoRotate.current = false; if (dragTimer.current) clearTimeout(dragTimer.current); };
    const endInteract = () => {
      if (dragTimer.current) clearTimeout(dragTimer.current);
      dragTimer.current = setTimeout(() => { autoRotate.current = true; }, 3500);
    };

    const onMouseDown = (e) => {
      isDragging.current = true; dragMoved.current = false;
      dragLast.current = { x: e.clientX, y: e.clientY };
      dragStart.current = { x: e.clientX, y: e.clientY };
      beginInteract();
    };
    const onMouseMove = (e) => {
      setNDC(e.clientX, e.clientY);
      if (!isDragging.current) return;
      const dx = e.clientX - dragLast.current.x;
      const dy = e.clientY - dragLast.current.y;
      if (Math.abs(e.clientX - dragStart.current.x) + Math.abs(e.clientY - dragStart.current.y) > 4) dragMoved.current = true;
      const t = threeRef.current;
      if (!t.globe) return;
      t.globe.rotation.y += dx * 0.005;
      t.globe.rotation.x = clamp(t.globe.rotation.x + dy * 0.005, -1.3, 1.3);
      dragLast.current = { x: e.clientX, y: e.clientY };
    };
    const onMouseUp = () => {
      const wasDragging = isDragging.current;
      isDragging.current = false;
      endInteract();
      if (wasDragging && !dragMoved.current && onGlobeClick) {
        const t = threeRef.current;
        if (!t.scene) return;
        t.raycaster.setFromCamera(mouseNDC.current, t.camera);
        const hits = t.raycaster.intersectObjects(t.overlayMeshes);
        if (hits.length > 0) return; // click on cluster handled by DOM
        const earthHits = t.raycaster.intersectObject(t.earthMesh);
        if (earthHits.length > 0) {
          const local = t.earthMesh.worldToLocal(earthHits[0].point.clone());
          const lat = 90 - (Math.acos(local.y / GLOBE_RADIUS) * 180 / Math.PI);
          const lng = (Math.atan2(local.x, local.z) * 180 / Math.PI);
          onGlobeClick({ lat, lng });
        }
      }
    };
    const onWheel = (e) => {
      e.preventDefault();
      const t = threeRef.current;
      if (!t.camera) return;
      t.camera.position.z = clamp(t.camera.position.z + e.deltaY * 0.002, 1.25, 5.5);
      beginInteract(); endInteract();
    };

    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDragging.current = true; dragMoved.current = false;
        dragLast.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        beginInteract();
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current = { active: true, dist: Math.hypot(dx, dy) };
        beginInteract();
      }
    };
    const onTouchMove = (e) => {
      if (e.touches.length === 1 && isDragging.current) {
        const t0 = e.touches[0];
        setNDC(t0.clientX, t0.clientY);
        const dx = t0.clientX - dragLast.current.x;
        const dy = t0.clientY - dragLast.current.y;
        if (Math.abs(t0.clientX - dragStart.current.x) + Math.abs(t0.clientY - dragStart.current.y) > 6) dragMoved.current = true;
        const t = threeRef.current;
        if (t.globe) {
          t.globe.rotation.y += dx * 0.005;
          t.globe.rotation.x = clamp(t.globe.rotation.x + dy * 0.005, -1.3, 1.3);
        }
        dragLast.current = { x: t0.clientX, y: t0.clientY };
      } else if (e.touches.length === 2) {
        e.preventDefault();
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        const dist = Math.hypot(dx, dy);
        if (pinchRef.current.active && pinchRef.current.dist > 0) {
          const delta = pinchRef.current.dist - dist;
          const t = threeRef.current;
          if (t.camera) t.camera.position.z = clamp(t.camera.position.z + delta * 0.005, 1.25, 5.5);
        }
        pinchRef.current.dist = dist;
      }
    };
    const onTouchEnd = (e) => {
      if (e.touches.length === 0) {
        isDragging.current = false;
        pinchRef.current.active = false;
        endInteract();
      }
    };

    mount.addEventListener("mousedown", onMouseDown);
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    mount.addEventListener("wheel", onWheel, { passive: false });
    mount.addEventListener("touchstart", onTouchStart, { passive: true });
    mount.addEventListener("touchmove", onTouchMove, { passive: false });
    mount.addEventListener("touchend", onTouchEnd);

    return () => {
      mount.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      mount.removeEventListener("wheel", onWheel);
      mount.removeEventListener("touchstart", onTouchStart);
      mount.removeEventListener("touchmove", onTouchMove);
      mount.removeEventListener("touchend", onTouchEnd);
    };
  }, [onGlobeClick]);

  // ----- Fly-to -----
  const flyTo = useCallback((coords, zoomTarget) => {
    const t = threeRef.current;
    if (!t.globe || !t.camera) return;
    autoRotate.current = false;
    const targetY = -coords.lng * (Math.PI / 180);
    // Match the actual globe coordinate system so fly-to centers the selected pin.
    const targetX = clamp(-(coords.lat * Math.PI) / 180, -1.3, 1.3);
    let diffY = targetY - t.globe.rotation.y;
    while (diffY > Math.PI) diffY -= 2 * Math.PI;
    while (diffY < -Math.PI) diffY += 2 * Math.PI;
    const finalY = t.globe.rotation.y + diffY;
    const sy = t.globe.rotation.y;
    const sx = t.globe.rotation.x;
    const sz = t.camera.position.z;
    const tz = zoomTarget != null ? clamp(zoomTarget, 1.25, 5.5) : Math.max(1.55, sz - 0.5);
    let p = 0;
    const fly = () => {
      p = Math.min(p + 0.025, 1);
      const e = easeOutCubic(p);
      t.globe.rotation.y = sy + (finalY - sy) * e;
      t.globe.rotation.x = sx + (targetX - sx) * e;
      t.camera.position.z = sz + (tz - sz) * e;
      if (p < 1) requestAnimationFrame(fly);
      else {
        if (dragTimer.current) clearTimeout(dragTimer.current);
        dragTimer.current = setTimeout(() => { autoRotate.current = true; }, 6000);
      }
    };
    fly();
  }, []);

  useEffect(() => {
    if (flyToCoords?.lat != null && flyToCoords?.lng != null) {
      flyTo(flyToCoords, flyToCoords.zoom);
      return;
    }
    if (!searchQuery) return;
    const key = String(searchQuery).trim().toLowerCase();
    const c = CITIES[key];
    if (c) { setNotFound(false); flyTo(c); }
    else { setNotFound(true); setTimeout(() => setNotFound(false), 800); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTrigger, flyToCoords]);

  // Hover tooltip target
  const hoveredCluster = useMemo(() => clusters.find((c) => c.id === hovered), [clusters, hovered]);

  const onClusterClick = (c) => {
    if (c.pins.length === 1) {
      onPinClick?.(c.pins[0]);
      return;
    }
    // Compute spread → choose zoom level that will guarantee cluster expands
    const lats = c.pins.map((p) => p.lat);
    const lngs = c.pins.map((p) => p.lng);
    const spread = Math.max(
      Math.max(...lats) - Math.min(...lats),
      Math.max(...lngs) - Math.min(...lngs),
      0.05
    );
    // Reverse cluster radius formula: r = 0.02 + t^1.4 * 12 → t = ((r-0.02)/12)^(1/1.4)
    // We want r ≈ spread * 0.4 so cluster breaks
    const desiredR = Math.max(0.05, spread * 0.4);
    const t = Math.pow(Math.max(0, (desiredR - 0.02) / 12), 1 / 1.4);
    const targetZ = clamp(1.25 + t * (5.5 - 1.25), 1.25, 4.5);
    // Always move closer than current
    const currentZ = threeRef.current?.camera?.position?.z ?? zoomZ;
    flyTo({ lat: c.lat, lng: c.lng }, Math.min(targetZ, currentZ * 0.6));
  };

  return (
    <div ref={mountRef} className="absolute inset-0 select-none" data-testid="globe-canvas-mount" style={{ touchAction: "none" }}>
      {clusters.map((c) => {
        if (c.pins.length === 1) {
          const p = c.pins[0];
          const t = PIN_TYPES[p.type] || PIN_TYPES.person;
          const isEvent = p.type === "event";
          const isArrived = arrivedIds && arrivedIds.has(p.id);
          return (
            <div
              key={c.id}
              ref={(el) => { if (el) overlayRefs.current[c.id] = el; }}
              data-testid={`pin-${p.id}`}
              className={`globe-pin ${isArrived ? "pin-arrived" : ""}`}
              style={{ borderColor: t.color, color: t.color, "--pin-color": t.color }}
              onClick={(e) => { e.stopPropagation(); onPinClick?.(p); }}
            >
              {(isEvent || isArrived) && (
                <>
                  <span className="pulse" style={{ background: t.color }} />
                  <span className="pulse" style={{ background: t.color, animationDelay: "0.7s" }} />
                </>
              )}
              {isArrived && (
                <>
                  <span className="arrive-ring" style={{ borderColor: t.color }} />
                  <span className="arrive-ring" style={{ borderColor: t.color, animationDelay: "0.6s" }} />
                  <span className="arrive-ring" style={{ borderColor: t.color, animationDelay: "1.2s" }} />
                </>
              )}
              <span className={`pin-emoji ${isEvent ? "blink" : ""} ${isArrived ? "arriving" : ""}`}>{t.emoji}</span>
            </div>
          );
        }
        // Multi-pin cluster
        const counts = {};
        c.pins.forEach((p) => { counts[p.type] = (counts[p.type] || 0) + 1; });
        const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);
        const dominant = PIN_TYPES[top[0][0]] || PIN_TYPES.person;
        return (
          <div
            key={c.id}
            ref={(el) => { if (el) overlayRefs.current[c.id] = el; }}
            data-testid={`cluster-${c.id}`}
            className="globe-cluster"
            style={{ "--cluster-color": dominant.color }}
            onClick={(e) => { e.stopPropagation(); onClusterClick(c); }}
          >
            <span className="cluster-ring" />
            <span className="cluster-bubble">
              <span className="cluster-emojis">{top.map(([k]) => PIN_TYPES[k]?.emoji).join("")}</span>
              <span className="cluster-count">{c.pins.length}</span>
            </span>
          </div>
        );
      })}

      {hoveredCluster && (
        <ClusterTooltip cluster={hoveredCluster} />
      )}

      {notFound && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-red-500/20 backdrop-blur border border-red-400/30 text-sm text-red-200" data-testid="search-not-found">
          Şehir bulunamadı, geocoding deneniyor…
        </div>
      )}
    </div>
  );
}

function ClusterTooltip({ cluster }) {
  const el = document.querySelector(cluster.pins.length === 1
    ? `[data-testid="pin-${cluster.pins[0].id}"]`
    : `[data-testid="cluster-${cluster.id}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const parentRect = el.parentElement.getBoundingClientRect();
  const top = rect.top - parentRect.top - 18;
  const left = rect.left - parentRect.left + 22;
  if (cluster.pins.length === 1) {
    const p = cluster.pins[0];
    const t = PIN_TYPES[p.type] || {};
    return (
      <div
        data-testid="pin-tooltip"
        className="absolute z-30 px-3 py-2 rounded-lg backdrop-blur-md text-xs whitespace-nowrap pointer-events-none"
        style={{
          top, left,
          background: "rgba(8,10,18,0.85)",
          border: `1px solid ${t.color}55`,
          color: "#fff",
          boxShadow: `0 6px 24px ${t.color}33`,
        }}
      >
        <div className="font-medium" style={{ color: t.color }}>{p.name}</div>
        <div className="text-white/60">{p.hood ? `${p.hood}, ` : ""}{p.city}</div>
      </div>
    );
  }
  // Multi-pin tooltip
  return (
    <div
      data-testid="cluster-tooltip"
      className="absolute z-30 px-3 py-2 rounded-lg backdrop-blur-md text-xs whitespace-nowrap pointer-events-none"
      style={{
        top, left,
        background: "rgba(8,10,18,0.9)",
        border: "1px solid rgba(255,255,255,0.15)",
        color: "#fff",
      }}
    >
      <div className="font-medium">{cluster.pins.length} yer</div>
      <div className="text-white/60">tıkla → yakınlaş</div>
    </div>
  );
}
