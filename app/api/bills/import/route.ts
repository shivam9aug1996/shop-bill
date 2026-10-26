import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { enqueueRemoteBill, type RemoteBill, type RemoteBillItem } from "@/lib/remote-bills";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type IncomingItem = {
  name?: unknown;
  quantity?: unknown;
  unit?: unknown;
  price?: unknown;
};

function toItem(item: IncomingItem): RemoteBillItem | null {
  if (typeof item.name !== "string" || !item.name.trim()) return null;
  const quantity = String(item.quantity ?? "").trim();
  const unit = String(item.unit ?? "").trim();
  const price = Number(item.price);
  if (!quantity || !unit || !Number.isFinite(Number(quantity)) || Number(quantity) <= 0) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  return {
    name: item.name.trim().slice(0, 120),
    quantity: quantity.slice(0, 24),
    unit: unit.slice(0, 24),
    price: String(Math.round(price * 100) / 100),
  };
}

export async function POST(request: Request) {
  const apiKey = process.env.BILL_IMPORT_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "Bill import is not configured on the server." }, { status: 503 });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const supplied = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(apiKey);
  const { timingSafeEqual } = await import("node:crypto");
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { items?: unknown; source?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 100) {
    return NextResponse.json({ error: "Provide between 1 and 100 bill items." }, { status: 400 });
  }

  const items = body.items.map((item) => toItem((item ?? {}) as IncomingItem));
  if (items.some((item) => item === null)) {
    return NextResponse.json({
      error: "Each item needs a name, positive numeric quantity, unit, and non-negative price.",
    }, { status: 400 });
  }

  const bill: RemoteBill = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: typeof body.source === "string" ? body.source.slice(0, 80) : "ChatGPT",
    items: items as RemoteBillItem[],
  };

  try {
    await enqueueRemoteBill(bill);
    return NextResponse.json({
      success: true,
      billId: bill.id,
      itemCount: bill.items.length,
      message: "Bill sent to Shop Bill. Open the website and keep Auto Import connected.",
    }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Could not queue the bill. Check the server storage configuration." }, { status: 503 });
  }
}
