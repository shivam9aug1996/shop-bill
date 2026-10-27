import { NextRequest, NextResponse } from "next/server";
import {
  createSessionValue,
  env,
  safeSecretEqual,
  SESSION_COOKIE_NAME,
} from "@/lib/auto-import";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const pin = env("BILL_IMPORT_PIN");
  const sessionSecret = env("BILL_SESSION_SECRET");
  if (!pin || !sessionSecret) {
    return NextResponse.json({ error: "Website authentication is not configured." }, { status: 503 });
  }

  let body: { pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.pin !== "string" || !safeSecretEqual(body.pin, pin)) {
    return NextResponse.json({ error: "PIN गलत है। दोबारा कोशिश करें।" }, { status: 401 });
  }

  const session = createSessionValue(sessionSecret);
  const response = NextResponse.json({ connected: true });
  response.cookies.set(SESSION_COOKIE_NAME, session.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: session.maxAge,
  });
  return response;
}
