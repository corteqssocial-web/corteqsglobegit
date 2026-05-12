import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import SearchBar from "./SearchBar";
import api from "@/lib/api";

jest.mock("@/lib/api", () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
  },
}));

describe("SearchBar", () => {
  let container;
  let root;

  beforeEach(() => {
    jest.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    api.get.mockReset();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    jest.useRealTimers();
  });

  async function renderSearch(onFly = jest.fn()) {
    await act(async () => {
      root.render(<SearchBar onFly={onFly} />);
    });
    return onFly;
  }

  function setInputValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  }

  it("uses the local city coordinates for exact Ankara searches", async () => {
    const onFly = await renderSearch();
    const input = container.querySelector('[data-testid="search-input"]');
    const form = input.closest("form");

    api.get.mockResolvedValue({
      data: {
        results: [
          {
            label: "Ankara, Turkey",
            city: "Ankara",
            canonical_name: "Ankara",
            country: "Turkey",
            country_code: "TR",
            precision: "city",
            lat: 39.93,
            lng: 32.85,
            provider: "google",
            provider_id: "ankara-1",
          },
        ],
      },
    });

    await act(async () => {
      setInputValue(input, "Ankara");
    });

    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });

    expect(api.get).toHaveBeenCalledWith("/locations/search", { params: { q: "Ankara" } });
    expect(onFly).toHaveBeenCalledWith({ lat: 39.93, lng: 32.85 });
    expect(input.value).toBe("Ankara");
  });

  it("shows canonical backend results and filters out noisy matches upstream", async () => {
    api.get.mockResolvedValue({
      data: {
        results: [
          {
            city: "Ankara",
            label: "Ankara, Turkey",
            canonical_name: "Ankara",
            country: "Turkey",
            country_code: "TR",
            precision: "city",
            lat: 39.93,
            lng: 32.85,
            provider: "google",
            provider_id: "ankara-city",
          },
          {
            city: "Ankara Province",
            label: "Ankara Province, Turkey",
            canonical_name: "Ankara Province",
            country: "Turkey",
            country_code: "TR",
            precision: "region",
            lat: 39.95,
            lng: 32.86,
            provider: "google",
            provider_id: "ankara-region",
          },
        ],
      },
    });

    await renderSearch();
    const input = container.querySelector('[data-testid="search-input"]');

    await act(async () => {
      setInputValue(input, "ank");
    });

    await act(async () => {
      jest.advanceTimersByTime(300);
      await Promise.resolve();
    });

    const firstResult = container.querySelector('[data-testid="search-result-0"]');
    expect(firstResult).not.toBeNull();
    const resultText = firstResult.textContent;

    expect(api.get).toHaveBeenCalledWith("/locations/search", { params: { q: "ank" } });
    expect(resultText).toContain("Ankara");
    expect(resultText).toContain("city");
    expect(container.textContent).not.toContain("Austin, TX, USA");
  });
});
