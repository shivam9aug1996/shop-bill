import { NextRequest, NextResponse } from "next/server";
import { isAuthenticatedCookie, SESSION_COOKIE_NAME } from "@/lib/auto-import";

export function requireBillSession(request: NextRequest) {
  if (!isAuthenticatedCookie(request.cookies.get(SESSION_COOKIE_NAME)?.value)) {
    return NextResponse.json({ error: "Please connect with your admin PIN." }, { status: 401 });
  }
  return null;
}

export function normalizeSavedItems(value: unknown) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 100) return null;
  const items = [];
  for (const item of value) {
    if (!item || typeof item.name !== "string" || !item.name.trim() ||
      !Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 ||
      typeof item.unit !== "string" || !item.unit.trim() ||
      !Number.isFinite(Number(item.price)) || Number(item.price) < 0) return null;
    items.push({
      id: typeof item.id === "string" ? item.id : crypto.randomUUID(),
      name: item.name.trim().slice(0, 160),
      quantity: String(item.quantity),
      unit: item.unit.trim().slice(0, 24),
      price: String(item.price),
    });
  }
  return items;
}

export function databaseUnavailable(error: unknown) {
  console.error("Bill history database error:", error instanceof Error ? error.message : "Unknown error");
  return NextResponse.json({ error: "Bill history database is unavailable. Check MONGODB_URI in Vercel." }, { status: 503 });
}
