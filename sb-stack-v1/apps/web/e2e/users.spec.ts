import { expect, test } from "@playwright/test";

// The [id] route's "Next user" link must track the route param across
// client-side navigations: navigating 1 → 2 → 3 without a full reload
// re-renders the same component, so the link/title are reactive memos.
test("next-user link updates across client-side user navigation", async ({
  page,
}) => {
  await page.goto("/users");
  await page.getByRole("link", { name: "Ada Lovelace" }).click();
  await expect(
    page.getByRole("heading", { name: "Ada Lovelace" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Next user" }).click();
  await expect(
    page.getByRole("heading", { name: "Grace Hopper" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Next user" }).click();
  await expect(
    page.getByRole("heading", { name: "Alan Turing" }),
  ).toBeVisible();
  // Last record: no Next link — it must not dead-end on a missing user.
  await expect(page.getByRole("link", { name: "Next user" })).toHaveCount(0);
});
