import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import {
  createSessionToken,
  getSessionCookieName,
  getSessionExpiry,
  getSessionMaxAge,
} from "@/lib/remote-bills";


export async function POST(request: Request) {
  const expectedPin = process.env.BILL_IMPORT_PIN;
  if (!expectedPin || !process.env.BILL_SESSION_SECRET) {
    return NextResponse.json({ error: "Auto Import is not configured yet. Add the required Vercel environment variables." }, { status: 503 });
  }

  let body: { pin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Enter the pairing PIN." }, { status: 400 });
  }

  const supplied = typeof body.pin === "string" ? body.pin : "";
  const suppliedBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expectedPin);
  if (suppliedBuffer.length !== expectedBuffer.length || !timingSafeEqual(suppliedBuffer, expectedBuffer)) {
    return NextResponse.json({ error: "Incorrect pairing PIN." }, { status: 401 });
  }

  const expiresAt = getSessionExpiry();
  const response = NextResponse.json({ success: true });
  response.cookies.set(getSessionCookieName(), createSessionToken(expiresAt), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: getSessionMaxAge(),
  });
  return response;
}
