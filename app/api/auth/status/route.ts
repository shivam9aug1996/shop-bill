import { NextRequest, NextResponse } from "next/server";
import { env, isValidSession, SESSION_COOKIE_NAME } from "@/lib/auto-import";

export async function GET(request: NextRequest) {
  const sessionSecret = env("BILL_SESSION_SECRET");
  const connected = Boolean(
    sessionSecret &&
      isValidSession(request.cookies.get(SESSION_COOKIE_NAME)?.value, sessionSecret),
  );

  return NextResponse.json(
    { connected },
    { headers: { "Cache-Control": "no-store" } },
  );
}
