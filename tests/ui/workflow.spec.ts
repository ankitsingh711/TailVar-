// Browser walkthrough of the full admin + customer workflow (creates data).
//   BASE_URL=http://localhost:3000 npm run test:ui
import { expect, test, type Page } from "@playwright/test";

const SHOTS = process.env.SCREENSHOT_DIR;
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

async function login(page: Page, username: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Username").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function logout(page: Page) {
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);
}

const lastToast = (page: Page) => page.getByTestId("toast").last();

test("admin issues a policy, customer claims, admin decides, customer sees result", async ({ page }) => {
  // Bad credentials show an inline error.
  await login(page, "admin", "nope");
  await expect(page.locator(".callout-error")).toContainText("Invalid username or password");
  await shot(page, "0-login");

  // Demo account buttons fill the form.
  await page.getByRole("button", { name: /Administrator/ }).click();
  await expect(page.getByLabel("Username")).toHaveValue("admin");

  // Admin issues a policy to customer1.
  await login(page, "admin", "Admin@Demo26");
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole("button", { name: "New policy" }).click();
  const policyDialog = page.getByRole("dialog");
  await policyDialog.locator("label.option", { hasText: "Customer One" }).click();
  await expect(policyDialog.getByRole("radio", { name: /Customer One/ })).toBeChecked();
  await policyDialog.getByLabel("Coverage start date").fill("2026-01-01");
  await policyDialog.getByLabel("Coverage end date").fill("2026-12-31");
  await policyDialog.getByLabel("Sum insured").fill("10,00,000");
  await expect(policyDialog).toContainText("365 days of cover");
  await expect(policyDialog).toContainText("₹ 10 lakh");
  await shot(page, "1-admin-new-policy");
  await policyDialog.getByRole("button", { name: "Issue policy" }).click();
  await expect(lastToast(page)).toContainText(/POL-\d{6} issued to Customer One/);
  const policyRef = (await lastToast(page).textContent())!.match(/POL-\d{6}/)![0];
  await expect(page.getByRole("row").filter({ hasText: policyRef })).toContainText("₹10,00,000.00");
  await shot(page, "2-admin-policies");
  await logout(page);

  // customer2 must not see it.
  await login(page, "customer2", "Customer2@Demo26");
  await expect(page).toHaveURL(/\/customer$/);
  await expect(page.getByRole("heading", { name: "Your policies" })).toBeVisible();
  await expect(page.getByText(policyRef)).toHaveCount(0);
  await logout(page);

  // customer1 files a 6L claim; an over-limit 5L claim is blocked with a clear message.
  await login(page, "customer1", "Customer1@Demo26");
  const card = page.getByRole("article", { name: `Policy ${policyRef}` });
  await expect(card.getByTestId("policy-remaining")).toHaveText("₹10,00,000.00");
  await card.getByRole("button", { name: "Claim on this policy" }).click();
  let claimDialog = page.getByRole("dialog");
  await expect(claimDialog.getByRole("radio", { name: new RegExp(policyRef) })).toBeChecked();
  await claimDialog.getByLabel("Incident date").fill("2026-03-15");
  await claimDialog.getByLabel("Claim amount").fill("600000");
  await expect(claimDialog.getByTestId("amount-hint")).toContainText("₹4,00,000.00 will remain claimable");
  await claimDialog.getByRole("button", { name: "Submit claim" }).click();
  await expect(lastToast(page)).toContainText(/CLM-\d{6} submitted/);
  const claimRef = (await lastToast(page).textContent())!.match(/CLM-\d{6}/)![0];
  await expect(card.getByTestId("policy-remaining")).toHaveText("₹4,00,000.00");

  await card.getByRole("button", { name: "Claim on this policy" }).click();
  claimDialog = page.getByRole("dialog");
  await claimDialog.getByLabel("Incident date").fill("2026-03-16");
  await claimDialog.getByLabel("Claim amount").fill("500000");
  await expect(claimDialog.getByTestId("amount-hint")).toContainText("more than the ₹4,00,000.00 still claimable");
  await expect(claimDialog.getByRole("button", { name: "Submit claim" })).toBeDisabled();
  await shot(page, "3-customer-over-limit");
  await claimDialog.getByRole("button", { name: "Cancel" }).click();
  await shot(page, "4-customer-dashboard");
  await logout(page);

  // Admin rejects the 6L claim; the dialog previews the SI being released.
  await login(page, "admin", "Admin@Demo26");
  const claimRow = page.getByRole("row").filter({ hasText: claimRef });
  await expect(claimRow).toContainText("Submitted");
  await claimRow.getByRole("button", { name: "Reject" }).click();
  const decision = page.getByRole("dialog");
  await expect(decision).toContainText("₹10,00,000.00");
  await shot(page, "5-admin-reject-preview");
  await decision.getByRole("button", { name: "Reject claim" }).click();
  await expect(lastToast(page)).toContainText(`${claimRef} rejected. ${policyRef} now has ₹10,00,000.00 claimable.`);
  await page.getByRole("button", { name: /^All claims/ }).click();
  await expect(page.getByRole("row").filter({ hasText: claimRef })).toContainText("Rejected");
  await expect(page.getByRole("row").filter({ hasText: claimRef }).getByRole("button")).toHaveCount(0);
  await logout(page);

  // Customer sees the decision and can now claim 5L.
  await login(page, "customer1", "Customer1@Demo26");
  await expect(page.getByRole("row").filter({ hasText: claimRef })).toContainText("Rejected");
  await card.getByRole("button", { name: "Claim on this policy" }).click();
  claimDialog = page.getByRole("dialog");
  await claimDialog.getByLabel("Incident date").fill("2026-12-31");
  await claimDialog.getByLabel("Claim amount").fill("500000");
  await claimDialog.getByRole("button", { name: "Submit claim" }).click();
  await expect(lastToast(page)).toContainText("submitted");
  await expect(card.getByTestId("policy-remaining")).toHaveText("₹5,00,000.00");
  await logout(page);

  // Logged-out users are bounced back to login.
  await page.goto("/customer");
  await expect(page).toHaveURL(/\/login$/);
});
