import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import DiasporaGlobe from "./DiasporaGlobe";

jest.mock("three", () => {
  class Vector3 {
    constructor(x = 0, y = 0, z = 1) {
      this.x = x;
      this.y = y;
      this.z = z;
    }

    clone() {
      return new Vector3(this.x, this.y, this.z);
    }

    project() {
      return this;
    }

    copy(other) {
      this.x = other.x;
      this.y = other.y;
      this.z = other.z;
      return this;
    }
  }

  class Object3D {
    constructor() {
      this.children = [];
      this.rotation = { x: 0, y: 0 };
      this.position = new Vector3(0, 0, 1);
      this.userData = {};
      this.visible = true;
    }

    add(child) {
      this.children.push(child);
    }

    remove(child) {
      this.children = this.children.filter((item) => item !== child);
    }

    getWorldPosition(target) {
      target.copy(this.position);
      if (!target.z) target.z = 1;
      return target;
    }

    worldToLocal(vector) {
      return vector;
    }
  }

  class Scene extends Object3D {}
  class Group extends Object3D {}

  class PerspectiveCamera extends Object3D {
    constructor() {
      super();
      this.aspect = 1;
      this.position.z = 2.8;
      globalThis.__THREE_LAST_CAMERA__ = this;
    }

    updateProjectionMatrix() {}
  }

  class WebGLRenderer {
    constructor() {
      this.domElement = global.document.createElement("canvas");
    }

    setPixelRatio() {}
    setSize() {}
    setClearColor() {}
    render() {}
    dispose() {}
  }

  class SphereGeometry {
    dispose() {}
  }

  class MeshBasicMaterial {
    constructor(options = {}) {
      Object.assign(this, options);
    }

    clone() {
      return new MeshBasicMaterial({ ...this });
    }

    dispose() {}
  }

  class MeshPhongMaterial extends MeshBasicMaterial {}

  class Mesh extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class BufferGeometry {
    setAttribute() {}
  }

  class BufferAttribute {
    constructor(array, itemSize) {
      this.array = array;
      this.itemSize = itemSize;
    }
  }

  class PointsMaterial extends MeshBasicMaterial {}
  class Points extends Object3D {
    constructor(geometry, material) {
      super();
      this.geometry = geometry;
      this.material = material;
    }
  }

  class AmbientLight extends Object3D {}
  class DirectionalLight extends Object3D {
    constructor() {
      super();
      this.position = { set: () => {} };
    }
  }

  class TextureLoader {
    load(_url, onLoad) {
      onLoad?.({});
    }
  }

  class Raycaster {
    setFromCamera() {}
    intersectObjects() {
      return [];
    }
    intersectObject() {
      return [];
    }
  }

  class Color {
    constructor(value) {
      this.value = value;
    }
  }

  return {
    Vector3,
    Scene,
    Group,
    PerspectiveCamera,
    WebGLRenderer,
    SphereGeometry,
    MeshBasicMaterial,
    MeshPhongMaterial,
    Mesh,
    BufferGeometry,
    BufferAttribute,
    PointsMaterial,
    Points,
    AmbientLight,
    DirectionalLight,
    TextureLoader,
    Raycaster,
    Color,
    FrontSide: "front",
    BackSide: "back",
  };
});

const singlePin = {
  id: 1,
  name: "Berlin",
  city: "Berlin",
  type: "person",
  lat: 52.52,
  lng: 13.405,
};

const clusterPins = [
  { id: 2, name: "Paris A", city: "Paris", type: "person", lat: 48.8566, lng: 2.3522 },
  { id: 3, name: "Paris B", city: "Paris", type: "event", lat: 48.857, lng: 2.3526 },
];

describe("DiasporaGlobe interactions", () => {
  let container;
  let root;
  let rafSpy;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    Object.defineProperty(container, "clientWidth", { configurable: true, value: 800 });
    Object.defineProperty(container, "clientHeight", { configurable: true, value: 600 });

    rafSpy = jest.spyOn(window, "requestAnimationFrame").mockImplementation(() => 1);
    jest.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    jest.restoreAllMocks();
    delete globalThis.__THREE_LAST_CAMERA__;
  });

  async function renderGlobe(props) {
    await act(async () => {
      root.render(
        <DiasporaGlobe
          pins={[]}
          filter="all"
          arrivedIds={new Set()}
          searchFlyToCommand={null}
          flyToCommand={null}
          {...props}
        />
      );
    });
  }

  it("keeps single-pin clicks drawer-only without triggering a direct zoom", async () => {
    const onPinClick = jest.fn();

    await renderGlobe({
      pins: [singlePin],
      onPinClick,
    });

    const camera = globalThis.__THREE_LAST_CAMERA__;
    const startingZ = camera.position.z;

    await act(async () => {
      container.querySelector('[data-testid="pin-1"]').click();
    });

    expect(onPinClick).toHaveBeenCalledWith(singlePin);
    expect(camera.position.z).toBe(startingZ);
  });

  it("keeps cluster clicks on the direct-zoom path", async () => {
    const onPinClick = jest.fn();

    await renderGlobe({
      pins: clusterPins,
      onPinClick,
    });

    const camera = globalThis.__THREE_LAST_CAMERA__;
    const startingZ = camera.position.z;
    const clusterNode = container.querySelector('[data-testid^="cluster-"]');

    await act(async () => {
      clusterNode.click();
    });

    expect(onPinClick).not.toHaveBeenCalled();
    expect(camera.position.z).toBeLessThan(startingZ);
  });

  it("replays the fly-to path when the same coordinates arrive as a fresh command", async () => {
    await renderGlobe({
      pins: [singlePin],
    });

    const initialRafCalls = rafSpy.mock.calls.length;

    await renderGlobe({
      pins: [singlePin],
      flyToCommand: { id: 1, lat: singlePin.lat, lng: singlePin.lng, zoom: 1.7, source: "pin-drawer" },
    });

    const afterFirstCommand = rafSpy.mock.calls.length;

    await renderGlobe({
      pins: [singlePin],
      flyToCommand: { id: 2, lat: singlePin.lat, lng: singlePin.lng, zoom: 1.7, source: "pin-drawer" },
    });

    expect(afterFirstCommand).toBeGreaterThan(initialRafCalls);
    expect(rafSpy.mock.calls.length).toBeGreaterThan(afterFirstCommand);
  });
});
