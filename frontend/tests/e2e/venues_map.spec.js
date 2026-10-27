import { test, expect } from "@playwright/test";

test("venue detail renders its map and map controls when coordinates are available", async ({ page }) => {
  await page.goto("/venues/venue/1");

  const map = page.locator("#venue-map");
  await expect(map).toBeVisible();

  const coordinates = await page.evaluate(() => ({
    latitude: JSON.parse(document.querySelector("#venue_lat").textContent),
    longitude: JSON.parse(document.querySelector("#venue_lng").textContent),
  }));

  test.skip(
    !coordinates.latitude || !coordinates.longitude,
    "The E2E seed venue has no map coordinates.",
  );

  await expect(map).toHaveClass(/leaflet-container/);
  await expect(page.locator(".leaflet-control-zoom-in")).toBeVisible();
  await expect(page.locator(".leaflet-control-zoom-out")).toBeVisible();
  await page.locator(".leaflet-control-zoom-in").click();
  await expect(page.locator(".leaflet-marker-icon")).toBeVisible();
});
