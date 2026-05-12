const { test, expect } = require("@playwright/test");

const pin = {
  id: 101,
  name: "Berlin Pin",
  city: "Berlin",
  hood: "Kreuzberg",
  type: "person",
  status: "approved",
  lat: 52.52,
  lng: 13.405,
  description: "Drawer to globe fly-to test pin",
  created_at: "2026-05-12T09:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    window.__corteqsFlyToEvents = [];
    window.addEventListener("corteqs:fly-to", (event) => {
      window.__corteqsFlyToEvents.push(event.detail);
    });
  });

  await page.route("**/api/pins", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ pins: [pin] }),
    });
  });

  await page.route("**/api/geoip", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({}),
    });
  });

  await page.route("**/api/auth/me", async (route) => {
    await route.fulfill({
      status: 401,
      contentType: "application/json",
      body: JSON.stringify({ detail: "unauthorized" }),
    });
  });
});

test("single pin click opens drawer, CTA triggers fly-to, and repeated CTA still emits a fresh fly-to", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByTestId("main-screen")).toBeVisible();
  await expect(page.getByTestId("pin-101")).toBeVisible();

  await page.getByTestId("pin-101").evaluate((node) => node.click());

  await expect(page.getByTestId("pin-detail-drawer")).toBeVisible();
  await expect(page.getByTestId("pin-detail-name")).toContainText("Berlin Pin");

  const countAfterPinClick = await page.evaluate(() => window.__corteqsFlyToEvents.length);
  expect(countAfterPinClick).toBe(0);

  await page.getByTestId("pin-detail-flyto").click();

  await expect(page.getByTestId("pin-detail-drawer")).toBeHidden();

  await expect.poll(async () => {
    return page.evaluate(() => window.__corteqsFlyToEvents.length);
  }).toBe(1);

  const firstEvent = await page.evaluate(() => window.__corteqsFlyToEvents[0]);
  expect(firstEvent).toMatchObject({
    lat: 52.52,
    lng: 13.405,
  });
  expect(firstEvent.zoom).toBeGreaterThan(1.6);
  expect(firstEvent.zoom).toBeLessThan(1.8);

  await page.getByTestId("pin-101").evaluate((node) => node.click());
  await expect(page.getByTestId("pin-detail-drawer")).toBeVisible();
  await page.getByTestId("pin-detail-flyto").click();

  await expect.poll(async () => {
    return page.evaluate(() => window.__corteqsFlyToEvents.length);
  }).toBe(2);

  const secondEvent = await page.evaluate(() => window.__corteqsFlyToEvents[1]);
  expect(secondEvent).toMatchObject({
    lat: 52.52,
    lng: 13.405,
  });
  expect(secondEvent.zoom).toBeGreaterThan(1.6);
  expect(secondEvent.zoom).toBeLessThan(1.8);
});
