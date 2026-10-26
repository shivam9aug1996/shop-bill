import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  getSessionCookieName,
  isValidSessionToken,
  takePendingRemoteBill,
} from "@/lib/remote-bills";


export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get(getSessionCookieName())?.value;
  try {
    if (!isValidSessionToken(token)) {
      return NextResponse.json({ error: "Connect Auto Import first." }, { status: 401 });
    }
    const bill = await takePendingRemoteBill();
    return NextResponse.json({ bill });
  } catch {
    return NextResponse.json({ error: "Could not check for pending bills." }, { status: 503 });
  }
}
