export type BillItem = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  price: string;
};

export const STORAGE_KEY = "shop-billing-items-v1";

export const UNITS = [
  "kg",
  "g",
  "mg",
  "L",
  "ml",
  "Piece",
  "Packet",
  "Box",
  "Dozen",
] as const;

/** Sum of each row's price (line total), not quantity × rate. */
export function billGrandTotal(items: BillItem[]): number {
  return items.reduce((sum, item) => sum + (Number(item.price) || 0), 0);
}

export function parseQuantity(value: string) {
  const match = value.trim().match(/^([\d.]+)\s*(.*)$/);

  if (!match) {
    return { quantity: value.trim(), unit: "Piece" };
  }

  const rawUnit = match[2].trim().toLowerCase();

  const unitMap: Record<string, string> = {
    kg: "kg",
    kilo: "kg",
    kilogram: "kg",
    किलो: "kg",
    किलोग्राम: "kg",

    g: "g",
    gm: "g",
    gram: "g",
    grams: "g",
    ग्राम: "g",

    mg: "mg",
    मिलीग्राम: "mg",

    l: "L",
    litre: "L",
    liter: "L",
    लीटर: "L",

    ml: "ml",
    मिलीलीटर: "ml",

    piece: "Piece",
    pieces: "Piece",
    pcs: "Piece",
    पीस: "Piece",
    नग: "Piece",

    packet: "Packet",
    पैकेट: "Packet",

    box: "Box",
    बॉक्स: "Box",

    dozen: "Dozen",
    दर्जन: "Dozen",
  };

  return {
    quantity: match[1],
    unit: unitMap[rawUnit] || rawUnit || "Piece",
  };
}

export function parseBill(text: string): BillItem[] {
  const result: BillItem[] = [];

  for (const originalLine of text.split(/\r?\n/)) {
    let line = originalLine.trim();

    if (!line) continue;

    if (line.includes("|")) {
      let columns = line
        .split("|")
        .map((part) => part.trim().replace(/\*\*/g, "").replace(/`/g, ""));

      if (columns[0] === "") columns.shift();
      if (columns[columns.length - 1] === "") columns.pop();

      if (columns.every((part) => /^:?-{2,}:?$/.test(part))) {
        continue;
      }

      if (
        columns.some((part) =>
          /^(क्र\.?|क्रम|सामान|item|product|नाम|मात्रा|quantity|वजन|unit|इकाई|कीमत|price|रकम|amount)$/i.test(
            part
          )
        )
      ) {
        continue;
      }

      if (columns.length >= 3 && /^\d+[\.)]?$/.test(columns[0])) {
        columns.shift();
      }

      if (columns.length < 3) continue;

      let name = "";
      let quantity = "";
      let unit = "Piece";
      let price = "";

      if (columns.length >= 4) {
        name = columns[0];
        quantity = columns[1];
        unit = columns[2] || "Piece";
        price = columns[columns.length - 1];
      } else {
        name = columns[0];

        const parsedQuantity = parseQuantity(columns[1]);
        quantity = parsedQuantity.quantity;
        unit = parsedQuantity.unit;
        price = columns[2];
      }

      const numericPrice = price.replace(/[₹,\s]/g, "");

      if (!name || !/^\d+(\.\d+)?$/.test(numericPrice)) continue;

      result.push({
        id: crypto.randomUUID(),
        name,
        quantity,
        unit,
        price: numericPrice,
      });

      continue;
    }

    line = line.replace(/^\d+[\.)]\s*/, "");

    const parts = line.split(/\s+[—–-]\s+/);

    if (parts.length < 3) continue;

    const name = parts[0].trim();
    const parsedQuantity = parseQuantity(parts[1]);
    const price = parts[parts.length - 1].replace(/[₹,\s]/g, "");

    if (!name || !/^\d+(\.\d+)?$/.test(price)) continue;

    result.push({
      id: crypto.randomUUID(),
      name,
      quantity: parsedQuantity.quantity,
      unit: parsedQuantity.unit,
      price,
    });
  }

  return result;
}
