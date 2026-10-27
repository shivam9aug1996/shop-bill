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

export function normalizeUnit(value: string): string {
  const raw = value.trim();
  const key = raw.toLowerCase();
  const unitMap: Record<string, string> = {
    kg: "kg", kilo: "kg", kilos: "kg", kilogram: "kg", kilograms: "kg", "किलो": "kg", "किलोग्राम": "kg",
    g: "g", gm: "g", gram: "g", grams: "g", "ग्राम": "g",
    mg: "mg", "मिलीग्राम": "mg",
    l: "L", litre: "L", liter: "L", "लीटर": "L",
    ml: "ml", "मिलीलीटर": "ml",
    piece: "Piece", pieces: "Piece", pcs: "Piece", "पीस": "Piece", "नग": "Piece",
    packet: "Packet", packets: "Packet", "पैकेट": "Packet",
    box: "Box", boxes: "Box", "बॉक्स": "Box",
    dozen: "Dozen", "दर्जन": "Dozen",
  };
  return unitMap[key] || ((UNITS as readonly string[]).includes(raw) ? raw : "Piece");
}

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
    unit: normalizeUnit(rawUnit),
  };
}

function makeBillItem(name: string, quantityText: string, priceText: string): BillItem | null {
  const cleanName = name.replace(/\*\*/g, "").replace(/`/g, "").trim();
  const parsedQuantity = parseQuantity(quantityText.replace(/\*\*/g, "").trim());
  const numericPrice = priceText.replace(/[₹,\s]/g, "");

  if (!cleanName || !/^\d+(\.\d+)?$/.test(numericPrice)) return null;

  return {
    id: crypto.randomUUID(),
    name: cleanName,
    quantity: parsedQuantity.quantity,
    unit: parsedQuantity.unit,
    price: numericPrice,
  };
}

export function parseBill(text: string): BillItem[] {
  const result: BillItem[] = [];

  for (const originalLine of text.split(/\r?\n/)) {
    let line = originalLine.trim();
    if (!line) continue;

    // ChatGPT's readable bill format:
    // 1. सूजी — 2 kg × ₹40/kg = ₹80
    // Price stored is the final line total (₹80), not the per-unit rate (₹40/kg).
    const readableLine = line
      .replace(/^\*\*/, "")
      .replace(/\*\*$/, "")
      .replace(/^\s*(?:[-*]\s*)?\d+[.)]\s*/, "")
      .trim();
    const equalsIndex = readableLine.lastIndexOf("=");
    if (equalsIndex !== -1) {
      const left = readableLine.slice(0, equalsIndex).trim();
      const totalText = readableLine.slice(equalsIndex + 1).trim();
      const dashParts = left.split(/\s+[—–-]\s+/);

      if (dashParts.length >= 2) {
        const name = dashParts[0].trim();
        const details = dashParts.slice(1).join(" — ").trim();
        const multiplicationMatch = details.match(/^(.+?)\s*[×x]\s*₹?\s*[\d,.]+(?:\s*\/\s*[^=]+)?$/i);
        if (multiplicationMatch) {
          const item = makeBillItem(name, multiplicationMatch[1].trim(), totalText);
          if (item) {
            result.push(item);
            continue;
          }
        }
      }
    }

    if (line.includes("|")) {
      const columns = line
        .split("|")
        .map((part) => part.trim().replace(/\*\*/g, "").replace(/`/g, ""));

      if (columns[0] === "") columns.shift();
      if (columns[columns.length - 1] === "") columns.pop();

      if (columns.every((part) => /^:?-{2,}:?$/.test(part))) continue;

      if (
        columns.some((part) =>
          /^(क्र\.?|क्रम|सामान|item|product|नाम|मात्रा|quantity|वजन|unit|इकाई|कीमत|price|रकम|amount)$/i.test(part)
        )
      ) continue;

      if (columns.length >= 3 && /^\d+[.)]?$/.test(columns[0])) columns.shift();
      if (columns.length < 3) continue;

      let name = "";
      let quantity = "";
      let unit = "Piece";
      let price = "";

      if (columns.length >= 4) {
        name = columns[0];
        quantity = columns[1];
        unit = normalizeUnit(columns[2] || "Piece");
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

    line = line.replace(/^\d+[.)]\s*/, "");
    const parts = line.split(/\s+[—–-]\s+/);
    if (parts.length < 3) continue;

    const item = makeBillItem(parts[0], parts[1], parts[parts.length - 1]);
    if (item) result.push(item);
  }

  return result;
}
