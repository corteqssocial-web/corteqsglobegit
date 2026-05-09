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

export default function DiasporaGlobe({
  pins,
  filter,
  onPinClick,
  onGlobeClick,
  searchQuery,        // string to fly to (city dict or geocoded result)
  searchTrigger,      // increments when search triggered
  flyToCoords,        // optional {lat,lng} override
}) {
  const mountRef = useRef(null);
  const pinRefs = useRef({});
  const threeRef = useRef({});
  const sizeRef = useRef({ W: 0, H: 0 });
  const filterRef = useRef(filter);
  const pinsRef = useRef(pins);
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

  // Keep refs in sync
  useEffect(() => { filterRef.current = filter; }, [filter]);
  useEffect(() => { pinsRef.current = pins; }, [pins]);

  // ----- Three.js init (mount once) -----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const W = mount.clientWidth;
    const H = mount.clientHeight;
    sizeRef.current = { W, H };

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 100);
    camera.position.z = 2.8;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(W, H);
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    // Globe group
    const globe = new THREE.Group();
    scene.add(globe);

    // Earth
    const earthMat = new THREE.MeshPhongMaterial({
      color: 0x1a3d78,
      shininess: 18,
      specular: 0x222244,
    });
    const earthMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 64), earthMat);
    globe.add(earthMesh);

    // Texture (NASA Blue Marble) — async load
    new THREE.TextureLoader().load(
      "https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg",
      (tex) => {
        earthMat.map = tex;
        earthMat.color = new THREE.Color(0xffffff);
        earthMat.needsUpdate = true;
      },
      undefined,
      () => {}
    );

    // Atmosphere + glow layers
    const atmosMesh = new THREE.Mesh(
      new THREE.SphereGeometry(1.025, 64, 64),
      new THREE.MeshBasicMaterial({ color: 0x4488ff, transparent: true, opacity: 0.08, side: THREE.FrontSide })
    );
    globe.add(atmosMesh);
    const glow1 = new THREE.Mesh(
      new THREE.SphereGeometry(1.20, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x3366ff, transparent: true, opacity: 0.055, side: THREE.BackSide })
    );
    globe.add(glow1);
    const glow2 = new THREE.Mesh(
      new THREE.SphereGeometry(1.40, 32, 32),
      new THREE.MeshBasicMaterial({ color: 0x3366ff, transparent: true, opacity: 0.025, side: THREE.BackSide })
    );
    globe.add(glow2);

    // Stars
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

    // Lights
    scene.add(new THREE.AmbientLight(0x334466, 0.9));
    const sun = new THREE.DirectionalLight(0xffffff, 1.1); sun.position.set(5, 3, 5); scene.add(sun);
    const rim = new THREE.DirectionalLight(0x3366ff, 0.3); rim.position.set(-6, 1, -4); scene.add(rim);

    // Pin hitboxes (rebuilt when pins change — see effect below)
    const pinMeshes = [];

    // Raycaster
    const raycaster = new THREE.Raycaster();

    threeRef.current = {
      scene, camera, renderer, globe, earthMat, earthMesh, pinMeshes, raycaster,
    };

    // Animation loop
    const worldPos = new THREE.Vector3();
    let raf = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      if (autoRotate.current) globe.rotation.y += 0.0018;

      // Pin DOM positioning
      const { W, H } = sizeRef.current;
      pinMeshes.forEach((mesh) => {
        const pinId = mesh.userData.pinId;
        const domEl = pinRefs.current[pinId];
        if (!domEl) return;
        const pin = pinsRef.current.find((p) => p.id === pinId);
        if (!pin) return;
        const visibleByFilter = !filterRef.current || filterRef.current === "all" || filterRef.current === pin.type;

        mesh.getWorldPosition(worldPos);
        const sc = toScreen(worldPos, camera, W, H);
        const isVisible = worldPos.z > -0.05;
        const alpha = visibleByFilter && isVisible ? clamp(worldPos.z * 1.8, 0, 1) : 0;

        domEl.style.left = sc.x + "px";
        domEl.style.top = sc.y + "px";
        domEl.style.opacity = alpha.toFixed(3);
        domEl.style.pointerEvents = alpha > 0.3 ? "auto" : "none";
        mesh.visible = alpha > 0.05;
      });

      // Hover detection (only when not dragging)
      if (!isDragging.current && pinMeshes.length > 0) {
        raycaster.setFromCamera(mouseNDC.current, camera);
        const hits = raycaster.intersectObjects(pinMeshes);
        const newHover = hits.length ? hits[0].object.userData.pinId : null;
        if (newHover !== prevHover.current) {
          prevHover.current = newHover;
          setHovered(newHover);
        }
      }

      renderer.render(scene, camera);
    };
    tick();

    // Resize
    const onResize = () => {
      const w = mount.clientWidth, h = mount.clientHeight;
      sizeRef.current = { W: w, H: h };
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
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

  // ----- Rebuild pin hitboxes when `pins` array changes -----
  useEffect(() => {
    const t = threeRef.current;
    if (!t.globe) return;
    // Remove old
    t.pinMeshes.forEach((m) => {
      t.globe.remove(m);
      m.geometry.dispose();
      m.material.dispose();
    });
    t.pinMeshes.length = 0;
    // Add new
    const hitGeom = new THREE.SphereGeometry(0.04, 8, 8);
    const hitMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 });
    pins.forEach((p) => {
      const pos = latLngTo3D(p.lat, p.lng, GLOBE_RADIUS * 1.015);
      const m = new THREE.Mesh(hitGeom, hitMat.clone());
      m.position.copy(pos);
      m.userData.pinId = p.id;
      t.globe.add(m);
      t.pinMeshes.push(m);
    });
  }, [pins]);

  // ----- Mouse / touch interaction -----
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const setNDC = (clientX, clientY) => {
      const rect = mount.getBoundingClientRect();
      mouseNDC.current.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      mouseNDC.current.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    };

    const beginInteract = () => {
      autoRotate.current = false;
      if (dragTimer.current) clearTimeout(dragTimer.current);
    };
    const endInteract = () => {
      if (dragTimer.current) clearTimeout(dragTimer.current);
      dragTimer.current = setTimeout(() => { autoRotate.current = true; }, 3500);
    };

    const onMouseDown = (e) => {
      isDragging.current = true;
      dragMoved.current = false;
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
    const onMouseUp = (e) => {
      const wasDragging = isDragging.current;
      isDragging.current = false;
      endInteract();
      // Click on globe (no drag)? Trigger onGlobeClick with lat/lng
      if (wasDragging && !dragMoved.current && onGlobeClick) {
        const t = threeRef.current;
        if (!t.scene) return;
        // If we hit a pin, ignore globe click (pin click handled separately)
        t.raycaster.setFromCamera(mouseNDC.current, t.camera);
        const pinHits = t.raycaster.intersectObjects(t.pinMeshes);
        if (pinHits.length > 0) return;
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

    // Touch
    const onTouchStart = (e) => {
      if (e.touches.length === 1) {
        isDragging.current = true;
        dragMoved.current = false;
        dragLast.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        dragStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        beginInteract();
      } else if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX;
        const dy = e.touches[0].clientY - e.touches[1].clientY;
        pinchRef.current.active = true;
        pinchRef.current.dist = Math.hypot(dx, dy);
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
  const flyTo = useCallback((coords) => {
    const t = threeRef.current;
    if (!t.globe || !t.camera) return;
    autoRotate.current = false;

    const targetY = -coords.lng * (Math.PI / 180);
    const targetX = -coords.lat * (Math.PI / 180) * 0.4;

    let diffY = targetY - t.globe.rotation.y;
    while (diffY > Math.PI) diffY -= 2 * Math.PI;
    while (diffY < -Math.PI) diffY += 2 * Math.PI;
    const finalY = t.globe.rotation.y + diffY;

    const sy = t.globe.rotation.y;
    const sx = t.globe.rotation.x;
    const sz = t.camera.position.z;
    const tz = Math.max(1.55, sz - 0.5);

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

  // External: searchQuery / flyToCoords trigger
  useEffect(() => {
    if (flyToCoords?.lat != null && flyToCoords?.lng != null) {
      flyTo(flyToCoords);
      return;
    }
    if (!searchQuery) return;
    const key = String(searchQuery).trim().toLowerCase();
    const c = CITIES[key];
    if (c) {
      setNotFound(false);
      flyTo(c);
    } else {
      setNotFound(true);
      setTimeout(() => setNotFound(false), 800);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTrigger]);

  // Hovered pin tooltip
  const hoveredPin = useMemo(() => pins.find((p) => p.id === hovered), [pins, hovered]);

  return (
    <div ref={mountRef} className="absolute inset-0 select-none" data-testid="globe-canvas-mount" style={{ touchAction: "none" }}>
      {/* Pin DOM overlays */}
      {pins.map((p) => {
        const t = PIN_TYPES[p.type] || PIN_TYPES.person;
        const isEvent = p.type === "event";
        return (
          <div
            key={p.id}
            ref={(el) => { if (el) pinRefs.current[p.id] = el; }}
            data-testid={`pin-${p.id}`}
            className="globe-pin"
            style={{ borderColor: t.color, color: t.color }}
            onClick={(e) => { e.stopPropagation(); onPinClick?.(p); }}
          >
            {isEvent && (
              <>
                <span className="pulse" style={{ background: t.color }} />
                <span className="pulse" style={{ background: t.color, animationDelay: "0.7s" }} />
              </>
            )}
            <span className={`pin-emoji ${isEvent ? "blink" : ""}`}>{t.emoji}</span>
          </div>
        );
      })}

      {/* Hover tooltip */}
      {hoveredPin && (
        <PinTooltip pin={hoveredPin} />
      )}

      {/* Search not-found shake (handled by parent for shake) */}
      {notFound && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-red-500/20 backdrop-blur border border-red-400/30 text-sm text-red-200" data-testid="search-not-found">
          Şehir bulunamadı, geocoding deneniyor…
        </div>
      )}
    </div>
  );
}

function PinTooltip({ pin }) {
  const t = PIN_TYPES[pin.type] || {};
  // Find DOM element to position tooltip near (we'll just use fixed offset from pin)
  const el = document.querySelector(`[data-testid="pin-${pin.id}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  const parentRect = el.parentElement.getBoundingClientRect();
  const top = rect.top - parentRect.top - 18;
  const left = rect.left - parentRect.left + 22;
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
      <div className="font-medium" style={{ color: t.color }}>{pin.name}</div>
      <div className="text-white/60">{pin.hood ? `${pin.hood}, ` : ""}{pin.city}</div>
    </div>
  );
}
