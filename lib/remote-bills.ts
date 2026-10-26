import { createHmac, timingSafeEqual } from "node:crypto";

const QUEUE_KEY = "shop-bill:pending-import";
const SESSION_COOKIE = "shop_bill_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const BILL_TTL_SECONDS = 60 * 60 * 24;

export type RemoteBillItem = {
  name: string;
  quantity: string;
  unit: string;
  price: string;
};

export type RemoteBill = {
  id: string;
  createdAt: string;
  source: string;
  items: RemoteBillItem[];
};

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

async function redisCommand(command: string[]): Promise<unknown> {
  const url = requiredEnv("UPSTASH_REDIS_REST_URL").replace(/\/$/, "");
  const token = requiredEnv("UPSTASH_REDIS_REST_TOKEN");
  const response = await fetch(`${url}/${command.map(encodeURIComponent).join("/")}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Remote bill storage request failed");
  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) throw new Error("Remote bill storage command failed");
  return payload.result;
}

export async function enqueueRemoteBill(bill: RemoteBill): Promise<void> {
  await redisCommand(["SET", QUEUE_KEY, JSON.stringify(bill), "EX", String(BILL_TTL_SECONDS)]);
}

export async function takePendingRemoteBill(): Promise<RemoteBill | null> {
  const value = await redisCommand(["GET", QUEUE_KEY]);
  if (typeof value !== "string") return null;
  await redisCommand(["DEL", QUEUE_KEY]);
  try {
    return JSON.parse(value) as RemoteBill;
  } catch {
    return null;
  }
}

export function createSessionToken(expiresAt: number): string {
  const signature = createHmac("sha256", requiredEnv("BILL_SESSION_SECRET"))
    .update(String(expiresAt))
    .digest("hex");
  return `${expiresAt}.${signature}`;
}

export function isValidSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const separator = token.indexOf(".");
  if (separator < 1) return false;
  const expiresText = token.slice(0, separator);
  const signature = token.slice(separator + 1);
  const expiresAt = Number(expiresText);
  if (!Number.isSafeInteger(expiresAt) || expiresAt < Date.now()) return false;

  const expected = createHmac("sha256", requiredEnv("BILL_SESSION_SECRET"))
    .update(expiresText)
    .digest("hex");
  const actualBuffer = Buffer.from(signature, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}

export function getSessionCookieName(): string {
  return SESSION_COOKIE;
}

export function getSessionExpiry(): number {
  return Date.now() + SESSION_TTL_SECONDS * 1000;
}

export function getSessionMaxAge(): number {
  return SESSION_TTL_SECONDS;
}
