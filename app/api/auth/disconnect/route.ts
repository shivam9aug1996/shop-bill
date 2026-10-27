import { NextResponse } from "next/server";
import { SESSION_COOKIE_NAME } from "@/lib/auto-import";

export async function POST() {
  const response = NextResponse.json({ connected: false });
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
