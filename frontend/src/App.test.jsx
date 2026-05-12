import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { MainScreen } from "./App";
import { useAuth } from "@/contexts/AuthContext";

jest.mock("@/contexts/AuthContext", () => ({
  AuthProvider: ({ children }) => children,
  useAuth: jest.fn(),
}));

jest.mock("@/features/globe/components/GlobePage", () => function GlobePageMock(props) {
  return (
    <div data-testid="globe-page">
      <span data-testid="globe-user">{props.user ? props.user.email : "anonymous"}</span>
      <button type="button" data-testid="require-login" onClick={props.onRequireLogin}>
        require login
      </button>
      <button type="button" data-testid="logout" onClick={props.onLogout}>
        logout
      </button>
    </div>
  );
});

jest.mock("@/components/AuthModal", () => function AuthModalMock({ open }) {
  return open ? <div data-testid="auth-modal">auth modal</div> : null;
});

jest.mock("@/components/AdminPanel", () => () => null);
jest.mock("@/components/AuthCallback", () => () => null);
jest.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
jest.mock("react-router-dom", () => ({
  Routes: ({ children }) => children,
  Route: () => null,
  useNavigate: () => jest.fn(),
}), { virtual: true });

describe("MainScreen", () => {
  let container;
  let root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    jest.clearAllMocks();
  });

  it("passes the authenticated user through to GlobePage", () => {
    useAuth.mockReturnValue({
      user: { id: "1", email: "user@example.com" },
      logout: jest.fn(),
    });

    act(() => {
      root.render(<MainScreen />);
    });

    expect(container.querySelector('[data-testid="globe-user"]').textContent).toBe("user@example.com");
  });

  it("opens the auth modal when GlobePage requires login", () => {
    useAuth.mockReturnValue({
      user: null,
      logout: jest.fn(),
    });

    act(() => {
      root.render(<MainScreen />);
    });

    act(() => {
      container.querySelector('[data-testid="require-login"]').click();
    });

    expect(container.querySelector('[data-testid="auth-modal"]')).not.toBeNull();
  });
});
