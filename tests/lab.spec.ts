import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  await page.goto("/");
});
test("guided custom inputs update registers and reset", async ({
  page,
  isMobile,
}) => {
  await page.screenshot({
    path: `artifacts/lab-${isMobile ? "mobile" : "desktop"}.png`,
    fullPage: true,
  });
  await page.getByLabel("Immediate value").fill("65535");
  await page.getByRole("button", { name: "Run instruction" }).click();
  await expect(page.locator(".destination-node")).toContainText("FFFFh");
  await page.getByRole("button", { name: "Reset", exact: false }).click();
  await expect(page.locator(".destination-node")).toContainText("—");
  await page.getByLabel("Immediate value").fill("hello");
  await page.getByRole("button", { name: "Run instruction" }).click();
  await expect(page.locator(".error-message")).toContainText("Invalid number");
});
test("register and indexed memory operands remain synchronized", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Register", exact: true }).click();
  await page.getByLabel("Initial BX", { exact: true }).fill("99");
  await page.getByRole("button", { name: "Run instruction" }).click();
  await expect(page.locator(".destination-node")).toContainText("0063h");
  await page.getByRole("tab", { name: "Indexed", exact: true }).click();
  await page.getByLabel("Displacement", { exact: true }).fill("2");
  await page.getByLabel("Memory word at address").fill("1234h");
  await page.getByRole("button", { name: "Run instruction" }).click();
  await expect(page.locator(".destination-node")).toContainText("1234h");
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await expect(page.getByLabel("Memory 0102", { exact: true })).toHaveValue(
    "34",
  );
  await expect(page.getByLabel("Memory 0103", { exact: true })).toHaveValue(
    "12",
  );
  await expect(page.locator(".access-detail")).toContainText("1000:0102");
});
test("memory edits after reset are used by stepping", async ({ page }) => {
  await page.getByRole("tab", { name: "Direct", exact: true }).click();
  await page.getByRole("button", { name: "Reset", exact: false }).click();
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await page.getByLabel("Memory 0100", { exact: true }).fill("7F");
  await page.getByRole("button", { name: "Step", exact: false }).click();
  await expect(page.locator(".destination-node")).toContainText("007Fh");
});
test("Monaco examples run and step with trace", async ({ page }) => {
  await page
    .getByRole("button", { name: "Program editor", exact: false })
    .click();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  await page.getByLabel("Example program").selectOption("Sum an array");
  await page.getByRole("button", { name: "Step instruction" }).click();
  await expect(page.locator(".run-count")).toContainText("1 instructions");
  await expect(page.locator(".executing-line")).toHaveCount(1);
  await page.getByRole("button", { name: "Run program" }).click();
  await expect(page.locator(".run-count")).toContainText("Halted");
  await page.getByRole("tab", { name: "Registers", exact: true }).click();
  await expect(
    page
      .locator(".register-card")
      .filter({ has: page.getByLabel("Initial AX", { exact: true }) })
      .locator("strong"),
  ).toHaveText("0064h");
  await page.getByRole("tab", { name: "Execution log" }).click();
  await expect(page.locator(".execution-log")).toContainText("JNZ NEXT");
});
test("custom editor reports unsupported syntax and Stop pauses a loop", async ({
  page,
  isMobile,
}) => {
  await page
    .getByRole("button", { name: "Program editor", exact: false })
    .click();
  await expect(page.locator(".monaco-editor")).toBeVisible();
  const editor = page.getByRole("textbox", { name: "Editor content" });
  await editor.focus();
  await page.keyboard.press(isMobile ? "Meta+A" : "Control+A");
  await page.keyboard.insertText("PUSH AX");
  await page.getByRole("button", { name: "Run program" }).click();
  await expect(page.locator(".error-message")).toContainText(
    "Unsupported instruction PUSH",
  );
  await editor.focus();
  await page.keyboard.press(isMobile ? "Meta+A" : "Control+A");
  await page.keyboard.insertText("again: JMP again");
  await expect(page.locator(".view-lines")).toContainText(/again:.*JMP.*again/);
  await page.getByRole("button", { name: "Run program" }).click();
  await expect(
    page.getByRole("button", { name: "Stop", exact: false }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Stop", exact: false }).click();
  await expect(page.getByRole("button", { name: "Run program" })).toBeEnabled();
  await expect(page.locator(".run-count")).toContainText("Ready");
});
test("comparison and reference work without layout overflow", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page
    .getByRole("button", { name: "Compare modes", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Moving one word into AX" }),
  ).toBeVisible();
  await expect(page.locator(".recharts-surface").first()).toBeVisible();
  await expect(
    page.getByRole("cell", { name: "MOV AX, [SI+10h]", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Learning guide", exact: false })
    .click();
  await expect(
    page.getByRole("heading", { name: "Supported instruction reference" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
});
