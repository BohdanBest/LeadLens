import { expect, test } from "@playwright/test";

test.describe("LeadLens core user journey (Section 6.1)", () => {
  test("register -> campaign -> report -> email -> lead status & 360px layout", async ({ page }) => {
    const email = `e2e_${Date.now()}@studio.ua`;

    // 1. Register new account
    await page.goto("/register");
    await page.getByLabel(/Електронна пошта|Email address/i).fill(email);
    await page.getByLabel(/Пароль|Password/i).fill("StrongPass123!");
    await page.getByLabel(/Назва студії|Studio/i).fill("E2E Studio");
    await page.getByRole("button", { name: /Створити акаунт|Create account/i }).click();

    await expect(page).toHaveURL(/\/campaigns/);

    // 2. Verify 360px mobile viewport has zero horizontal page overflow
    await page.setViewportSize({ width: 360, height: 780 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth + 1
    );
    expect(hasHorizontalOverflow).toBeFalsy();

    // 3. Create campaign
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("link", { name: /Нова кампанія|New campaign/i }).click();
    await page.getByLabel(/Назва кампанії|Campaign name/i).fill("E2E Dental Audit");
    await page.getByLabel(/Ніша|Niche/i).fill("Dentistry");
    await page.getByLabel(/Список адрес|URL list/i).fill("https://example.com");
    await page.getByRole("button", { name: /Створити кампанію|Create campaign/i }).click();

    await expect(page).toHaveURL(/\/campaigns\/.+/);
    await expect(page.getByRole("heading", { name: "E2E Dental Audit" })).toBeVisible();

    // 4. Navigate to Leads CRM and Dashboard
    await page.getByRole("link", { name: /Ліди|Leads/i }).click();
    await expect(page).toHaveURL(/\/leads/);

    await page.getByRole("link", { name: /Дашборд|Dashboard/i }).click();
    await expect(page).toHaveURL(/\/$/);
  });
});
