import { test, expect, type Page } from "@playwright/test";

async function enterProgram(page: Page, source: string, isMobile: boolean) {
  await page
    .getByRole("button", { name: "Program editor", exact: false })
    .click();
  const editor = page.getByRole("textbox", { name: "Editor content" });
  await editor.waitFor();
  await editor.focus();
  // Monaco follows the emulated platform, rather than the test runner's OS.
  await page.keyboard.press(
    isMobile || process.platform === "darwin" ? "Meta+A" : "Control+A",
  );
  await page.keyboard.insertText(source);
}
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
  await page.keyboard.press(
    isMobile || process.platform === "darwin" ? "Meta+A" : "Control+A",
  );
  await page.keyboard.insertText("PUSH AX");
  await page.getByRole("button", { name: "Run program" }).click();
  await expect(page.locator(".error-message")).toContainText(
    "Unsupported instruction PUSH",
  );
  await editor.focus();
  await page.keyboard.press(
    isMobile || process.platform === "darwin" ? "Meta+A" : "Control+A",
  );
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

test("negative indexed displacement, alignment, and memory initialization are explicit", async ({
  page,
}) => {
  await page.getByRole("tab", { name: "Indexed", exact: true }).click();
  await page.getByLabel("Displacement", { exact: true }).fill("-1");
  await page.getByLabel("Memory word at address").fill("256");
  await page.getByRole("button", { name: "Run instruction" }).click();
  await expect(page.locator(".destination-node")).toContainText("0100h");
  await expect(
    page.locator(".metric").filter({ hasText: "Theoretical clocks" }),
  ).toContainText("21");
  await expect(page.locator(".flow-explanation")).toContainText("00FFh");
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await page.getByLabel("Inspect DS offset").fill("00FFh");
  await expect(page.getByLabel("Memory 00FF", { exact: true })).toHaveValue(
    "00",
  );
  await expect(page.getByLabel("Memory 0100", { exact: true })).toHaveValue(
    "01",
  );
  await page.getByRole("button", { name: "Reset", exact: false }).click();
  await page.getByLabel("Memory 00FF", { exact: true }).fill("FF");
  await page.getByRole("button", { name: "Step", exact: false }).click();
  await expect(page.locator(".destination-node")).toContainText("01FFh");
  await page.getByLabel("Inspect DS offset").fill("65536");
  await expect(page.getByRole("alert")).toContainText("between 0 and 65535");
});

test("Stop, resume, Step, and Reset preserve a paused program without stale timers", async ({
  page,
  isMobile,
}) => {
  await enterProgram(
    page,
    ".DATA\nvalue DW 1\n.CODE\nMOV SI, 0100h\nagain: INC WORD PTR [SI]\nJMP again",
    isMobile,
  );
  await page.getByRole("button", { name: "Run program" }).click();
  await expect
    .poll(async () =>
      parseInt(
        (await page.locator(".run-count").innerText()).replaceAll(",", ""),
      ),
    )
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Stop", exact: false }).click();
  const paused = await page.locator(".run-count").innerText();
  // A deliberate wait catches a previously queued execution batch after Stop.
  await page.waitForTimeout(100);
  await expect(page.locator(".run-count")).toHaveText(paused);
  const count = parseInt(paused.replaceAll(",", ""));
  await page.getByRole("button", { name: "Step instruction" }).click();
  await expect(page.locator(".run-count")).toContainText(
    `${(count + 1).toLocaleString()} instructions`,
  );
  await page.getByRole("button", { name: "Run program" }).click();
  await page.getByRole("button", { name: "Stop", exact: false }).click();
  await page.getByRole("button", { name: "Reset", exact: false }).click();
  await page.waitForTimeout(100);
  await expect(page.locator(".run-count")).toContainText("0 instructions");
  await page.getByRole("tab", { name: "Memory", exact: true }).click();
  await expect(page.getByLabel("Memory 0100", { exact: true })).toHaveValue(
    "01",
  );
  await page.getByRole("button", { name: "Step instruction" }).click();
  await page.getByRole("button", { name: "Step instruction" }).click();
  const cell = page.getByLabel("Memory 0100", { exact: true });
  await expect(cell).toHaveValue("02");
  await expect(cell.locator("..")).toHaveClass(/read write/);
});

test("custom byte program has accurate metrics, aliases, flags, and reset", async ({
  page,
  isMobile,
}) => {
  await enterProgram(
    page,
    "MOV AX, 65535\nINC AL\nCMP AL, 0\nJZ zero\nMOV BX, 1\nzero: HLT",
    isMobile,
  );
  await page.getByRole("button", { name: "Run program" }).click();
  await expect(page.locator(".run-count")).toContainText("Halted");
  await expect(
    page
      .locator(".register-card")
      .filter({ has: page.getByLabel("Initial AX", { exact: true }) })
      .locator("strong"),
  ).toHaveText("FF00h");
  await expect(page.locator(".flag")).toContainText("1");
  await expect(page.locator(".program-summary")).toContainText(
    "29 theoretical clocks",
  );
  await expect(page.locator(".program-summary")).toContainText(
    "13 static code bytes",
  );
  await page.getByRole("button", { name: "Reset", exact: false }).click();
  await expect(page.locator(".program-summary")).toContainText(
    "0 theoretical clocks",
  );
  await page.getByRole("tab", { name: "Execution log" }).click();
  await expect(page.locator(".execution-log")).toContainText(
    "Execute an instruction",
  );
});

test("out-of-range conditional branches and invalid operand combinations show errors", async ({
  page,
  isMobile,
}) => {
  await enterProgram(page, `JZ end\n${"NOP\n".repeat(128)}end: HLT`, isMobile);
  await page.getByRole("button", { name: "Run program" }).click();
  await expect(page.locator(".error-message")).toContainText(
    "out of SHORT range",
  );
  await enterProgram(page, "MOV AX, AL", isMobile);
  await page.getByRole("button", { name: "Step instruction" }).click();
  await expect(page.locator(".error-message")).toContainText(
    "widths do not match",
  );
});

test("infinite programs stop at exactly 10000 instructions", async ({
  page,
  isMobile,
}) => {
  test.setTimeout(45000);
  await enterProgram(page, "again: JMP again", isMobile);
  await page.getByRole("button", { name: "Run program" }).click();
  await expect(page.locator(".error-message")).toContainText(
    "10,000 instruction limit",
    { timeout: 35000 },
  );
  await expect(page.locator(".run-count")).toContainText("10,000 instructions");
  await expect(
    page.getByRole("button", { name: "Stop", exact: false }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Reset", exact: false }).click();
  await expect(page.locator(".run-count")).toContainText("0 instructions");
});

test("comparison distinguishes code size, setup, EA, and equivalent array work", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: "Compare modes", exact: false })
    .click();
  const direct = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Array direct (4 words)",
      exact: true,
    }),
  });
  const indexed = page.getByRole("row").filter({
    has: page.getByRole("rowheader", {
      name: "Array indexed loop (4 words)",
      exact: true,
    }),
  });
  await expect(direct).toContainText("76");
  await expect(direct).toContainText("23 / 10");
  await expect(indexed).toContainText("156");
  await expect(indexed).toContainText("21 / 10");
  await expect(indexed).toContainText("12");
  await expect(
    page.getByRole("heading", { name: "Explain the results in a viva" }),
  ).toBeVisible();
});
