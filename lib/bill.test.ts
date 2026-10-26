import { describe, expect, it } from "vitest";
import { billGrandTotal, parseBill, parseQuantity } from "./bill";

function withoutIds(items: ReturnType<typeof parseBill>) {
  return items.map(({ name, quantity, unit, price }) => ({
    name,
    quantity,
    unit,
    price,
  }));
}

describe("parseQuantity", () => {
  it("parses Hindi weight units", () => {
    expect(parseQuantity("2 किलो")).toEqual({ quantity: "2", unit: "kg" });
    expect(parseQuantity("500 ग्राम")).toEqual({ quantity: "500", unit: "g" });
  });

  it("defaults missing unit to Piece", () => {
    expect(parseQuantity("12")).toEqual({ quantity: "12", unit: "Piece" });
  });
});

describe("parseBill", () => {
  it("parses markdown table with quantity and unit combined", () => {
    const text = `
| सामान | मात्रा | कीमत |
| --- | --- | --- |
| चीनी | 2 किलो | ₹120 |
| दूध | 1 L | ₹60 |
`;

    expect(withoutIds(parseBill(text))).toEqual([
      { name: "चीनी", quantity: "2", unit: "kg", price: "120" },
      { name: "दूध", quantity: "1", unit: "L", price: "60" },
    ]);
  });

  it("parses plain text lines with em dashes", () => {
    const text = `1. चीनी — 2 किलो — ₹120
2. साबुन — 3 Piece — ₹45`;

    expect(withoutIds(parseBill(text))).toEqual([
      { name: "चीनी", quantity: "2", unit: "kg", price: "120" },
      { name: "साबुन", quantity: "3", unit: "Piece", price: "45" },
    ]);
  });

  it("parses four-column markdown tables", () => {
    const text = `| 1 | आटा | 5 | kg | ₹250 |`;

    expect(withoutIds(parseBill(text))).toEqual([
      { name: "आटा", quantity: "5", unit: "kg", price: "250" },
    ]);
  });

  it("returns empty array for unparseable text", () => {
    expect(parseBill("random notes\nno prices here")).toEqual([]);
  });
});

describe("billGrandTotal", () => {
  it("sums line totals only", () => {
    const items = parseBill("चीनी — 2 किलो — ₹120\nदूध — 1 L — ₹60");
    expect(billGrandTotal(items)).toBe(180);
  });
});
