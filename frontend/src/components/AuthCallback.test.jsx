import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import AuthCallback from "./AuthCallback";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/lib/supabase";

const mockNavigate = jest.fn();

jest.mock("@/contexts/AuthContext", () => ({
  useAuth: jest.fn(),
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: jest.fn(),
      setSession: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      onAuthStateChange: jest.fn(),
    },
  },
}));

jest.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}), { virtual: true });

describe("AuthCallback", () => {
  let container;
  let root;
  let refreshMock;
  let originalLocation;
  let replaceStateSpy;
  let authChangeHandler;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    refreshMock = jest.fn().mockResolvedValue(undefined);
    authChangeHandler = null;

    useAuth.mockReturnValue({ refresh: refreshMock });
    mockNavigate.mockReset();

    replaceStateSpy = jest.spyOn(window.history, "replaceState").mockImplementation(() => {});

    originalLocation = window.location;
    delete window.location;
    window.location = {
      hash: "#access_token=test-access&refresh_token=test-refresh",
      search: "",
      pathname: "/auth/callback",
    };

    supabase.auth.getSession.mockReset();
    supabase.auth.setSession.mockReset();
    supabase.auth.exchangeCodeForSession.mockReset();
    supabase.auth.onAuthStateChange.mockReset();

    supabase.auth.setSession.mockResolvedValue({ error: null });
    supabase.auth.exchangeCodeForSession.mockResolvedValue({ error: null });
    supabase.auth.onAuthStateChange.mockImplementation((callback) => {
      authChangeHandler = callback;
      return {
        data: {
          subscription: {
            unsubscribe: jest.fn(),
          },
        },
      };
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    replaceStateSpy.mockRestore();
    window.location = originalLocation;
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  async function renderComponent() {
    await act(async () => {
      root.render(<AuthCallback />);
    });
  }

  it("establishes a session from hash tokens and redirects home", async () => {
    supabase.auth.getSession
      .mockResolvedValueOnce({ data: { session: null } })
      .mockResolvedValueOnce({ data: { session: { access_token: "test-access" } } });

    await renderComponent();

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(supabase.auth.setSession).toHaveBeenCalledWith({
      access_token: "test-access",
      refresh_token: "test-refresh",
    });
    expect(refreshMock).toHaveBeenCalled();
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/auth/callback");
    expect(mockNavigate).toHaveBeenCalledWith("/", { replace: true });
  });

  it("times out gracefully when a session never becomes available", async () => {
    supabase.auth.getSession.mockResolvedValue({ data: { session: null } });

    await renderComponent();

    await act(async () => {
      jest.advanceTimersByTime(SESSION_TIMEOUT_FOR_TEST);
      await Promise.resolve();
    });

    expect(container.textContent).toContain("Giriş başarısız");
    expect(container.textContent).toContain("Oturum kurulamadı (timeout). Lütfen tekrar deneyin.");
  });
});

const SESSION_TIMEOUT_FOR_TEST = 16000;
