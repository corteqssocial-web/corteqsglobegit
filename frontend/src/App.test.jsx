import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MainScreen } from "./App";
import api from "@/lib/api";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";

let latestGlobeProps = null;

jest.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: jest.fn(),
}));

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
  },
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    channel: jest.fn(),
    removeChannel: jest.fn(),
  },
}));

jest.mock("@/components/DiasporaGlobe", () => function DiasporaGlobeMock(props) {
  latestGlobeProps = props;
  const pin = props.pins[0];

  return (
    <div data-testid="globe-mock">
      <button
        data-testid="mock-pin-click"
        type="button"
        onClick={() => pin && props.onPinClick?.(pin)}
      >
        pin
      </button>
      <output data-testid="mock-flyto-command">
        {props.flyToCommand ? JSON.stringify(props.flyToCommand) : "none"}
      </output>
    </div>
  );
});

jest.mock("@/components/PinDetailDrawer", () => function PinDetailDrawerMock({ pin, open, onFlyTo }) {
  if (!open || !pin) return null;

  return (
    <div data-testid="pin-detail-drawer">
      <div data-testid="pin-detail-name">{pin.name}</div>
      <button data-testid="pin-detail-flyto" type="button" onClick={() => onFlyTo?.(pin)}>
        Buraya yakinlas
      </button>
    </div>
  );
});

jest.mock("@/components/SearchBar", () => function SearchBarMock({ onFly }) {
  return (
    <div data-testid="search-bar">
      <button
        data-testid="mock-search-fly"
        type="button"
        onClick={() => onFly?.({ lat: 39.93, lng: 32.85 })}
      >
        search
      </button>
    </div>
  );
});
jest.mock("@/components/AuthModal", () => () => null);
jest.mock("@/components/AddPinModal", () => () => null);
jest.mock("@/components/AdminPanel", () => () => null);
jest.mock("@/components/AuthCallback", () => () => null);
jest.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
jest.mock("react-router-dom", () => ({
  Routes: ({ children }) => children,
  Route: () => null,
  useNavigate: () => jest.fn(),
}), { virtual: true });

const TEST_PIN = {
  id: 7,
  name: "Berlin Pin",
  city: "Berlin",
  type: "person",
  lat: 52.52,
  lng: 13.405,
  created_at: "2026-05-12T10:00:00.000Z",
};

function flushPromises() {
  return Promise.resolve();
}

describe("MainScreen fly-to wiring", () => {
  let container;
  let root;

  beforeEach(() => {
    jest.useFakeTimers();
    latestGlobeProps = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);

    useAuth.mockReturnValue({
      user: null,
      logout: jest.fn(),
    });

    api.get.mockImplementation((url) => {
      if (url === "/pins") {
        return Promise.resolve({ data: { pins: [TEST_PIN] } });
      }
      if (url === "/geoip") {
        return Promise.resolve({ data: {} });
      }
      return Promise.resolve({ data: {} });
    });

    const channel = {
      on: jest.fn().mockReturnThis(),
      subscribe: jest.fn().mockReturnThis(),
    };
    supabase.channel.mockReturnValue(channel);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
      await flushPromises();
    });
    container.remove();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  async function renderScreen() {
    await act(async () => {
      root.render(
        <MainScreen />
      );
      await flushPromises();
    });
  }

  it("opens the drawer from a single pin click without auto-zooming", async () => {
    await renderScreen();

    await act(async () => {
      container.querySelector('[data-testid="mock-pin-click"]').click();
      await flushPromises();
    });

    expect(container.querySelector('[data-testid="pin-detail-drawer"]')).not.toBeNull();
    expect(latestGlobeProps.flyToCommand).toBeNull();
  });

  it("dispatches a fly-to command from the drawer CTA and closes the drawer", async () => {
    await renderScreen();

    await act(async () => {
      container.querySelector('[data-testid="mock-pin-click"]').click();
      await flushPromises();
    });

    await act(async () => {
      container.querySelector('[data-testid="pin-detail-flyto"]').click();
      await flushPromises();
    });

    expect(latestGlobeProps.flyToCommand).toMatchObject({
      lat: TEST_PIN.lat,
      lng: TEST_PIN.lng,
      zoom: 1.7,
      source: "pin-drawer",
    });
    expect(container.querySelector('[data-testid="pin-detail-drawer"]')).toBeNull();
  });

  it("emits a fresh fly-to command when the same pin is focused twice", async () => {
    await renderScreen();

    await act(async () => {
      container.querySelector('[data-testid="mock-pin-click"]').click();
      await flushPromises();
    });

    await act(async () => {
      container.querySelector('[data-testid="pin-detail-flyto"]').click();
      await flushPromises();
    });

    const firstCommandId = latestGlobeProps.flyToCommand.id;

    await act(async () => {
      container.querySelector('[data-testid="mock-pin-click"]').click();
      await flushPromises();
    });

    await act(async () => {
      container.querySelector('[data-testid="pin-detail-flyto"]').click();
      await flushPromises();
    });

    expect(latestGlobeProps.flyToCommand).toMatchObject({
      lat: TEST_PIN.lat,
      lng: TEST_PIN.lng,
      zoom: 1.7,
    });
    expect(latestGlobeProps.flyToCommand.id).not.toBe(firstCommandId);
  });

  it("does not let the delayed geoip fly-to override a manual search fly-to", async () => {
    api.get.mockImplementation((url) => {
      if (url === "/pins") {
        return Promise.resolve({ data: { pins: [TEST_PIN] } });
      }
      if (url === "/geoip") {
        return Promise.resolve({ data: { lat: 10, lng: 20, city: "Geo City", country_name: "Geo Country" } });
      }
      return Promise.resolve({ data: {} });
    });

    await renderScreen();

    await act(async () => {
      container.querySelector('[data-testid="mock-search-fly"]').click();
      await flushPromises();
    });

    expect(latestGlobeProps.searchFlyToCommand).toMatchObject({
      lat: 39.93,
      lng: 32.85,
      source: "search",
    });

    await act(async () => {
      jest.advanceTimersByTime(1500);
      await flushPromises();
    });

    expect(latestGlobeProps.flyToCommand).toBeNull();
    expect(latestGlobeProps.searchFlyToCommand).toMatchObject({
      lat: 39.93,
      lng: 32.85,
      source: "search",
    });
  });
});
