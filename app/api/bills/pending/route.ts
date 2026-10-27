import { NextRequest, NextResponse } from "next/server";
import {
  env,
  isValidSession,
  PENDING_BILL_KEY,
  redisCommand,
  SESSION_COOKIE_NAME,
  type PendingBill,
} from "@/lib/auto-import";

export async function GET(request: NextRequest) {
  const sessionSecret = env("BILL_SESSION_SECRET");
  if (!sessionSecret || !isValidSession(request.cookies.get(SESSION_COOKIE_NAME)?.value, sessionSecret)) {
    return NextResponse.json({ error: "Connect the website first." }, { status: 401 });
  }

  const missing = ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"].filter((name) => !env(name));
  if (missing.length) {
    console.error("Pending bill API missing environment variables:", missing.join(", "));
    return NextResponse.json(
      { error: "Redis server configuration is incomplete.", missing },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const raw = await redisCommand<string | null>(["GET", PENDING_BILL_KEY]);
    if (!raw) {
      return NextResponse.json(
        { connected: true, bill: null },
        { headers: { "Cache-Control": "no-store" } },
      );
    }

    let bill: PendingBill;
    try {
      bill = JSON.parse(raw) as PendingBill;
    } catch {
      return NextResponse.json({ error: "Pending bill data is invalid." }, { status: 502 });
    }
    if (!bill || !Array.isArray(bill.items)) {
      return NextResponse.json({ error: "Pending bill data is invalid." }, { status: 502 });
    }
    return NextResponse.json(
      { connected: true, bill },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    // Log a diagnostic message in Vercel without exposing credentials to the client.
    console.error(
      "Pending bill Redis read failed:",
      error instanceof Error ? error.message : "Unknown error",
    );
    return NextResponse.json(
      { error: "Redis read failed. Check server configuration and Vercel runtime logs." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
