import { NextRequest, NextResponse } from "next/server";
import {
  env,
  isValidBillItems,
  PENDING_BILL_KEY,
  PENDING_BILL_TTL_SECONDS,
  redisCommand,
  safeSecretEqual,
} from "@/lib/auto-import";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const expectedKey = env("BILL_IMPORT_API_KEY");
  if (!expectedKey) {
    return NextResponse.json({ error: "Bill import is not configured." }, { status: 503 });
  }
  const authorization = request.headers.get("authorization") ?? "";
  const providedKey = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!providedKey || !safeSecretEqual(providedKey, expectedKey)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: { source?: unknown; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (!isValidBillItems(body.items)) {
    return NextResponse.json({ error: "Items must include valid name, positive quantity, unit and line-total price." }, { status: 400 });
  }

  const bill = {
    source: typeof body.source === "string" ? body.source.slice(0, 80) : "ChatGPT",
    createdAt: new Date().toISOString(),
    items: body.items.map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity,
      unit: item.unit.trim(),
      price: item.price,
    })),
  };

  try {
    await redisCommand(["SET", PENDING_BILL_KEY, JSON.stringify(bill), "EX", PENDING_BILL_TTL_SECONDS]);
    return NextResponse.json({ queued: true, itemCount: bill.items.length, createdAt: bill.createdAt }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Could not save bill to Redis." }, { status: 503 });
  }
}
