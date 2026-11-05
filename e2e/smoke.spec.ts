import { test, expect } from "@playwright/test";

// A "smoke test": the quickest proof that the site is alive and the main path works.
// STAGING ONLY. The login comes from environment variables, never from this file.
// Use a test org admin or manager, never a real person's account.

const BASE = process.env.E2E_BASE_URL;
const EMAIL = process.env.E2E_EMAIL;
const PASSWORD = process.env.E2E_PASSWORD;

test.skip(!BASE || !EMAIL || !PASSWORD, "Set E2E_BASE_URL, E2E_EMAIL and E2E_PASSWORD to run this test.");

test("the sign-in page loads", async ({ page }) => {
  await page.goto("/auth");
  await expect(page.locator("#loginEmail")).toBeVisible();
  await expect(page.locator("#loginPassword")).toBeVisible();
});

test("a test admin or manager can sign in and reach the Roster", async ({ page }) => {
  await page.goto("/auth");
  await page.locator("#loginEmail").fill(EMAIL!);
  await page.locator("#loginPassword").fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in with email/i }).click();

  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByText(/present today/i).first()).toBeVisible();
});

test("the Roster shows no crash message", async ({ page }) => {
  await page.goto("/auth");
  await page.locator("#loginEmail").fill(EMAIL!);
  await page.locator("#loginPassword").fill(PASSWORD!);
  await page.getByRole("button", { name: /sign in with email/i }).click();
  await expect(page).toHaveURL(/\/dashboard/, { timeout: 20_000 });
  await expect(page.getByText(/something went wrong|internal server error/i)).toHaveCount(0);
});
