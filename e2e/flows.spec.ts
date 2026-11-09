import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const unique = Date.now();
const account = (tag: string) => ({ name: `Test ${tag}`, email: `${tag}-${unique}@hangar.test`, password: "correct-horse-1" });

async function register(page: Page, tag: string) {
  const a = account(tag);
  await page.goto("/register");
  await page.getByLabel("Name").fill(a.name);
  await page.getByLabel("Email").fill(a.email);
  await page.getByLabel("Password").fill(a.password);
  const home = page.getByRole("heading", { name: "Your collection, at a glance." });
  const limited = page.getByText("Too many attempts. Please wait a minute.");
  // Sign-up allows 5 per minute; the suite creates more accounts than that, so it waits out the window.
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(home.or(limited)).toBeVisible();
    if (await home.isVisible()) return a;
    await page.waitForTimeout(61_000);
  }
  await expect(home).toBeVisible();
  return a;
}

async function smartAdd(page: Page, query: string, pick: RegExp, fill?: (p: Page) => Promise<void>) {
  await page.getByRole("button", { name: "Add Aircraft" }).first().click();
  await page.getByPlaceholder("Search aircraft, airline, registration or item number...").fill(query);
  await page.getByRole("button", { name: pick }).first().click();
  if (fill) await fill(page);
  await page.getByRole("button", { name: "Add to Collection" }).click();
}

test.describe.configure({ mode: "serial" });

test("core flow: smart add, dashboard, collection, detail, picker, delete + undo", async ({ page }) => {
  await register(page, "core");
  await expect(page.getByText("Your hangar is empty")).toBeVisible();

  // Smart Add, from the spec's ideal flow.
  await smartAdd(page, "Swiss A350 1:400", /A350-900/, async (p) => {
    await p.getByLabel("Model Manufacturer").fill("NG Models");
    await expect(p.getByLabel("Airline", { exact: true })).toHaveValue("Swiss Int. Airlines");
    await p.getByLabel("Registration").fill("hbifa");
    await p.getByLabel("Registration").blur();
    await expect(p.getByLabel("Registration")).toHaveValue("HB-IFA");
    await p.getByLabel("Item Number").fill("E2E-1");
    await p.getByRole("textbox", { name: "Purchase Price" }).fill("49,99");
    await p.getByRole("textbox", { name: "Current Value" }).fill("59.99");
  });
  await expect(page.getByText("Added to your collection").first()).toBeVisible();
  // Statistics update without a reload.
  await expect(page.getByText("€49.99").first()).toBeVisible();
  await expect(page.getByText("+€10.00").first()).toBeVisible();

  // Manual entry with only the two required fields; empty submit is refused first.
  await page.getByRole("button", { name: "Add Aircraft" }).first().click();
  await page.getByRole("button", { name: /Add it manually/ }).click();
  await page.getByLabel("Model Manufacturer").fill("");
  await page.getByRole("button", { name: "Add to Collection" }).click();
  await expect(page.getByText("Enter the aircraft type")).toBeVisible();
  await page.getByLabel("Aircraft Type").fill("Boeing 747-8");
  await page.getByLabel("Model Manufacturer").fill("Herpa");
  await page.getByRole("button", { name: "Add to Collection" }).click();
  await expect(page.getByText("Total Models")).toBeVisible();

  // Duplicate detection.
  await smartAdd(page, "Swiss A350", /A350-900/, async (p) => {
    await p.getByLabel("Model Manufacturer").fill("NG Models");
    await p.getByLabel("Item Number").fill("E2E-1");
  });
  await expect(page.getByText("This model is already in your collection.")).toBeVisible();
  await page.getByRole("button", { name: "Add another copy" }).click();
  await expect(page.getByText("Added to your collection").first()).toBeVisible();

  // Collection + typo-tolerant search.
  await page.goto("/collection");
  await page.getByLabel("Search your collection").fill("Swis A359");
  await expect(page.locator("article")).toHaveCount(2);
  await page.getByLabel("Search your collection").fill("");
  await expect(page.locator("article")).toHaveCount(3);

  // Table: inline edit.
  await page.getByRole("button", { name: "Table view" }).click();
  const row = page.locator('[role="row"]', { hasText: "Boeing 747-8" });
  await row.getByRole("button", { name: "—" }).first().click();
  await page.getByRole("textbox", { name: "Registration" }).fill("d-abya");
  await page.keyboard.press("Enter");
  await expect(row.getByText("D-ABYA")).toBeVisible();

  // Picker: reveal mode, result is a real model; double clicking cannot overlap.
  await page.getByRole("button", { name: "Pick Random Aircraft" }).click();
  await expect(page.getByText("Aircraft Selected")).toBeVisible({ timeout: 8000 });
  await page.getByRole("button", { name: "Spin Again" }).dblclick();
  await expect(page.getByRole("button", { name: "Spinning" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Spin Again" })).toBeEnabled({ timeout: 8000 });
  await page.getByRole("link", { name: "View Aircraft" }).click();
  await expect(page).toHaveURL(/\/collection\/[0-9a-f-]{36}/);

  // Delete + undo.
  const url = page.url();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Model deleted")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-item]")).toHaveCount(3);
  await page.goto(url);
  await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
});

test("picker highlight mode finds a model outside the current filter", async ({ page }) => {
  await register(page, "hl");
  await smartAdd(page, "Lufthansa 747-8", /747-8/, async (p) => {
    await p.getByLabel("Model Manufacturer").fill("Herpa");
    await p.getByRole("button", { name: "1:500", exact: true }).click();
  });
  await page.goto("/collection");
  // Opening the picker spins at once, in the mode chosen last time; the choice is remembered.
  await page.evaluate(() => localStorage.setItem("hangar:picker-mode", "highlight"));
  await page.getByRole("button", { name: "Pick Random Aircraft" }).click();
  await expect(page.locator(".highlighted")).toBeVisible({ timeout: 8000 });
});

test("import: csv mapping, validation, duplicates, nothing written before confirm", async ({ page }) => {
  await register(page, "imp");
  const csv = [
    "Airline Name;Aircraft Model;Scale;Reg;Manufacturer;Price Paid;Item Number",
    'swiss;B77W;1/400;HB-JNA;jc wings;"42,99 €";A-1',
    "Lufthansa;747-8;1:500;D-ABYA;Herpa;;H-1",
    "Lufthansa;747-8;1:500;D-ABYA;Herpa;;H-1",
    "Nowhere Air;;1:400;;NG Models;lots;N-1",
  ].join("\n");
  const file = path.join(test.info().outputDir, "import.csv");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, csv);
  await page.goto("/import");
  await page.getByLabel("Choose a file").setInputFiles(file);
  await page.getByRole("button", { name: "Review 4 rows" }).click();
  await expect(page.getByText("Aircraft type is missing")).toBeVisible();
  await expect(page.getByText("Same as row 3")).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Your hangar is empty")).toBeVisible();

  await page.goto("/import");
  await page.getByLabel("Choose a file").setInputFiles(file);
  await page.getByRole("button", { name: "Review 4 rows" }).click();
  await page.getByRole("button", { name: "Import 2 models" }).click();
  await expect(page.getByText("2 models imported")).toBeVisible();
  await page.getByRole("link", { name: "Open collection" }).click();
  await expect(page.getByText("Swiss Int. Airlines")).toBeVisible();
  await expect(page.locator("article")).toHaveCount(2);

  // Export contains the data.
  const res = await page.request.get("/api/export?format=json");
  expect((await res.json()).items).toHaveLength(2);
  const xlsx = await page.request.get("/api/export?format=xlsx");
  expect(xlsx.ok()).toBe(true);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
});

test("users are isolated, uploads are checked, sharing hides private fields", async ({ page, browser }) => {
  await register(page, "owner");
  await smartAdd(page, "Emirates A380", /A380-800/, async (p) => {
    await p.getByLabel("Model Manufacturer").fill("GeminiJets");
    await p.getByRole("textbox", { name: "Purchase Price" }).fill("99");
    await p.getByRole("button", { name: "More details" }).click();
    await p.getByLabel("Notes").fill("secret-note-text");
    await p.getByLabel("Storage Location").fill("secret-shelf");
  });
  const { items } = await (await page.request.get("/api/items")).json();
  const id = items[0].id as string;

  // A file that claims to be an image is refused; a real one is stored without its metadata.
  const bad = await page.request.post(`/api/items/${id}/images`, { multipart: { file: { name: "x.png", mimeType: "image/png", buffer: Buffer.from("<script>alert(1)</script>") } } });
  expect(bad.status()).toBe(415);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==", "base64");
  const good = await page.request.post(`/api/items/${id}/images`, { multipart: { file: { name: "ok.png", mimeType: "image/png", buffer: png } } });
  expect(good.ok()).toBe(true);
  const imageId = (await good.json()).image.id;
  expect((await page.request.get(`/api/images/${imageId}`)).headers()["content-type"]).toBe("image/webp");

  // Another account can see none of it.
  const other = await browser.newContext({ baseURL: "http://localhost:3217" });
  const otherPage = await other.newPage();
  await register(otherPage, "other");
  expect((await otherPage.request.get(`/api/items/${id}`)).status()).toBe(404);
  expect((await otherPage.request.patch(`/api/items/${id}`, { data: { notes: "x" } })).status()).toBe(404);
  expect((await otherPage.request.get(`/api/images/${imageId}`)).status()).toBe(404);
  expect((await (await otherPage.request.get("/api/items")).json()).items).toHaveLength(0);

  // No session at all.
  const anon = await browser.newContext({ baseURL: "http://localhost:3217" });
  expect((await anon.request.get("/api/items")).status()).toBe(401);
  await (await anon.newPage()).goto("/collection").then(async (r) => expect(r?.url()).toContain("/login"));

  // Sharing: off by default, then on without the private fields.
  const { share } = await (await page.request.get("/api/settings")).json();
  expect(share.enabled).toBe(false);
  const anonPage = await anon.newPage();
  expect((await anonPage.goto(`/s/${share.token}`))?.status()).toBe(404);
  await page.request.patch("/api/settings", { data: { share: { enabled: true, showPrices: false, showValues: false, showDates: false, showNotes: false, showStorage: false } } });
  const html = await (await anonPage.goto(`/s/${share.token}`))!.text();
  expect(html).toContain("Airbus A380-800");
  for (const secret of ["secret-note-text", "secret-shelf", "99.00", "9900", account("owner").email]) expect(html).not.toContain(secret);
  expect((await anon.request.get(`/api/images/${imageId}?share=${share.token}`)).ok()).toBe(true);
  expect((await anon.request.get(`/api/images/${imageId}`)).status()).toBe(404);
});

test("german interface, dark mode and mobile quick add", async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: "http://localhost:3217", viewport: { width: 390, height: 780 }, hasTouch: true });
  const page = await ctx.newPage();
  await register(page, "mobile");
  await ctx.addCookies([{ name: "locale", value: "de", url: "http://localhost:3217" }, { name: "theme", value: "dark", url: "http://localhost:3217" }]);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Deine Sammlung auf einen Blick." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Flugzeug hinzufügen" }).last().click();
  await page.getByPlaceholder(/Flugzeug, Airline/).fill("SWISS 777-300ER");
  await page.getByRole("button", { name: /777-300ER/ }).first().click();
  await page.getByLabel("Modellhersteller").fill("JC Wings");
  await page.getByRole("button", { name: "Zur Sammlung hinzufügen" }).click();
  await expect(page.getByText("Zur Sammlung hinzugefügt")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});

