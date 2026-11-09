import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, readyDb } from "../src/db";
import { user } from "../src/db/schema";
import { createItem, getItem, listItems, setDeleted, updateItem, updateItems, valuesFor } from "../src/server/items";

/** Runs against a real, in-memory Postgres (PGlite) with the production migrations. */
beforeAll(async () => {
  process.env.PGLITE_DATA_DIR = "memory://";
  const db = await readyDb();
  await db.insert(user).values([
    { id: "alice", name: "Alice", email: "a@test" },
    { id: "bob", name: "Bob", email: "b@test" },
  ]);
});
afterAll(closeDb);

const model = { aircraftName: "Boeing 777-300ER", modelManufacturerName: "JC Wings" };

describe("data isolation between users", () => {
  it("does not list another user's models", async () => {
    await createItem("alice", model);
    expect(await listItems("alice")).toHaveLength(1);
    expect(await listItems("bob")).toHaveLength(0);
  });
  it("does not read, update or delete across users", async () => {
    const item = await createItem("alice", { ...model, notes: "private" });
    expect(await getItem("bob", item.id)).toBeNull();
    expect(await updateItem("bob", item.id, { notes: "hacked" })).toBeNull();
    expect(await updateItems("bob", [item.id], { notes: "hacked" })).toBe(0);
    expect(await setDeleted("bob", [item.id], true)).toBe(0);
    expect((await getItem("alice", item.id))?.notes).toBe("private");
  });
  it("keeps value history per user", async () => {
    const item = await createItem("alice", { ...model, valueCents: 6500, valueCurrency: "EUR" });
    expect(await valuesFor("bob", item.id)).toEqual([]);
    expect((await valuesFor("alice", item.id)).map((v) => v.cents)).toEqual([6500]);
  });
});

describe("items", () => {
  it("stores only the two required fields when that is all there is", async () => {
    const i = await createItem("bob", model);
    expect(i.registration).toBeNull();
    expect(i.purchasePriceCents).toBeNull();
    expect(i.status).toBe("collection");
  });
  it("derives the registration country", async () => {
    const i = await createItem("bob", { ...model, registration: "HB-JNA" });
    expect(i.registrationCountry).toBe("CH");
  });
  it("soft delete hides the model and undo restores it", async () => {
    const i = await createItem("bob", model);
    await setDeleted("bob", [i.id], true);
    expect(await getItem("bob", i.id)).toBeNull();
    await setDeleted("bob", [i.id], false);
    expect((await getItem("bob", i.id))?.id).toBe(i.id);
  });
  it("records a new value entry only when the value changes", async () => {
    const i = await createItem("bob", { ...model, valueCents: 1000, valueCurrency: "EUR" });
    await updateItem("bob", i.id, { notes: "x" });
    await updateItem("bob", i.id, { valueCents: 1200, valueCurrency: "EUR" });
    expect((await valuesFor("bob", i.id)).map((v) => v.cents)).toEqual([1000, 1200]);
  });
  it("wishlist to collection keeps all data", async () => {
    const i = await createItem("bob", { ...model, status: "wishlist", dealer: "Shop", desiredPriceCents: 4000, desiredCurrency: "CHF" });
    const moved = await updateItem("bob", i.id, { status: "collection" });
    expect(moved).toMatchObject({ status: "collection", dealer: "Shop", desiredPriceCents: 4000, desiredCurrency: "CHF" });
  });
  it("two copies of one model are independent", async () => {
    const base = { ...model, itemNumber: "X1", scale: "1:400" };
    const a = await createItem("bob", { ...base, purchasePriceCents: 4000, condition: "mint" });
    const b = await createItem("bob", { ...base, purchasePriceCents: 2500, condition: "fair" });
    expect(a.id).not.toBe(b.id);
    expect((await getItem("bob", a.id))?.condition).toBe("mint");
  });
});
