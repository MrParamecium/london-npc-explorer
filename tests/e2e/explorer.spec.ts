import { expect, test } from "@playwright/test";

test("locates, generates, and chats without layout overflow", async ({
  page,
}, testInfo) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "London NPC Atlas" }),
  ).toBeVisible();
  await expect(page.getByLabel("Latitude")).toHaveValue("51.5202");

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
    page.getByText("This version supports Greater London coordinates."),
  ).toBeVisible();
});
