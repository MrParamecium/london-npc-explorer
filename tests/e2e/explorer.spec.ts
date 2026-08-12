import { expect, test } from "@playwright/test";

test("locates, generates, and chats without layout overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "London NPC Atlas" }),
  ).toBeVisible();
  await expect(page.getByLabel("Latitude")).toHaveValue("51.5202");

  await page.getByRole("button", { name: "Locate" }).click();
  await expect(
    page.getByText("Location resolved", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("City of London 001A")).toBeVisible();
  await expect(page.getByText("Farringdon Within")).toBeVisible();
  await expect(
    page.getByLabel("Nearby places").getByRole("listitem"),
  ).toHaveCount(10);
  await expect(page.getByText("Local preview / mock mode")).toBeVisible();

  await page.getByRole("button", { name: "Generate NPC" }).click();
  await expect(
    page.getByRole("button", { name: "Building profile" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("heading", { name: "Amara Okafor" }),
  ).toBeVisible();

  await page.getByLabel("Message Amara Okafor").fill("Is this area busy?");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText("Is this area busy?")).toBeVisible();

  const hasHorizontalOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth + 1,
  );
  expect(hasHorizontalOverflow).toBe(false);

  await page.screenshot({
    path: `test-results/${testInfo.project.name}-generated.png`,
    fullPage: true,
  });
});

test("rejects coordinates outside Greater London", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Latitude").fill("40.7128");
  await page.getByLabel("Longitude").fill("-74.0060");
  await page.getByRole("button", { name: "Locate" }).click();

  await expect(
    page.getByText("Outside Greater London", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Outside V1 coverage" }),
  ).toBeDisabled();
});

test("selects a new London coordinate from the mock map", async ({ page }) => {
  await page.goto("/");

  const map = page.getByLabel(/Clickable map preview/);
  await map.click({ position: { x: 180, y: 250 } });

  await expect(
    page.getByText("Location resolved", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Latitude")).not.toHaveValue("51.5202");
  await expect(page.getByLabel("Longitude")).not.toHaveValue("-0.0979");
});

test("keeps official geography when address data is partial", async ({
  page,
}) => {
  await page.route("**/api/locations/resolve", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        coordinates: { latitude: 51.5202, longitude: -0.0979 },
        supported: true,
        geography: {
          lsoa: {
            code: "E01000001",
            name: "City of London 001A",
            version: "LSOA December 2021 BGC V5",
          },
          ward: {
            code: "E05009293",
            name: "Farringdon Within",
            version: "Wards May 2026 BGC",
          },
          borough: {
            code: "E09000001",
            name: "City of London",
            version: "LAD May 2025 BGC V2",
          },
        },
        address: null,
        nearbyPlaces: [],
        provenance: {
          geographyDatasets: [
            "LSOA December 2021 BGC V5",
            "Wards May 2026 BGC",
            "LAD May 2025 BGC V2",
          ],
          googleResolvedAt: null,
        },
      }),
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Locate" }).click();

  await expect(
    page.getByText("Partial location", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("City of London 001A")).toBeVisible();
});
