import { expect, test } from "@playwright/test";

test("sign up, create a post, sign out", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Need an account? Sign up" }).click();
  await page.getByLabel("Name").fill("E2E User");
  await page.getByLabel("Email").fill("e2e-1@example.com");
  await page.getByLabel("Password").fill("password1234");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByText(/Signed in as/)).toBeVisible();

  await page.getByLabel("Title").fill("Hello e2e");
  await page.getByLabel("Content").fill("created by playwright");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.locator(".post-list")).toContainText("Hello e2e");

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(
    page.getByRole("button", { name: "Need an account? Sign up" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create" })).toBeHidden();
});

test("sign in rejects a wrong password and accepts the right one", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Need an account? Sign up" }).click();
  await page.getByLabel("Name").fill("E2E User 2");
  await page.getByLabel("Email").fill("e2e-2@example.com");
  await page.getByLabel("Password").fill("password1234");
  await page.getByRole("button", { name: "Sign up", exact: true }).click();
  await expect(page.getByText(/Signed in as/)).toBeVisible();
  // Success resets mode to signin, so the sign-in form is showing.
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.getByLabel("Email").fill("e2e-2@example.com");
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator(".form-error")).toBeVisible();
  await expect(page.locator(".form-error")).toContainText(/invalid/i);

  await page.getByLabel("Password").fill("password1234");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText(/Signed in as/)).toBeVisible();
});
