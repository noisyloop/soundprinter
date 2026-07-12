import { chromium } from "playwright-core";

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
});
const page = await browser.newPage({ viewport: { width: 1360, height: 1400 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(m.text());
});

await page.goto(process.env.APP_URL ?? "http://localhost:3100/", { waitUntil: "networkidle" });

// Wait for boot to finish (status mentions "Ready").
await page.waitForFunction(
  () => document.querySelector(".status-line")?.textContent?.includes("Ready"),
  { timeout: 30000 }
);
const refRows = await page.locator(".ref-row").count();
console.log("library rows:", refRows);

await page.getByRole("button", { name: "Analyze" }).click();
await page.waitForFunction(
  () =>
    document
      .querySelector(".status-line")
      ?.textContent?.includes("Analysis complete"),
  { timeout: 60000 }
);
console.log("status:", await page.locator(".status-line").textContent());

const rows = await page.locator("table.results tbody tr").count();
console.log("result rows:", rows);
const names = await page
  .locator("table.results tbody tr td:first-child")
  .allTextContents();
console.log("matched refs:", names.map((n) => n.trim()).join(" | "));
const callout = await page.locator(".callout").count();
console.log("limitation callout present:", callout > 0);
const canvases = await page.locator("canvas").count();
console.log("canvases rendered:", canvases);

await page.screenshot({
  path: "/tmp/claude-0/-home-user-soundprinter/682e3ba1-8661-59f1-8820-fb22cf3c4291/scratchpad/soundprinter.png",
  fullPage: true,
});

// Click the second result row and confirm the histogram panel updates.
if (rows > 1) {
  await page.locator("table.results tbody tr").nth(1).click();
  await page.waitForTimeout(300);
}

console.log("page errors:", errors.length ? errors : "none");
await browser.close();
if (errors.length) process.exit(1);
