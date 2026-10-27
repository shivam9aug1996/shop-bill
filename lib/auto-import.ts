import { createHmac, timingSafeEqual } from "node:crypto";

export const PENDING_BILL_KEY = "shop-bill:pending";
export const PENDING_BILL_TTL_SECONDS = 60 * 60 * 24;
export const SESSION_COOKIE_NAME = "shop_bill_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type IncomingBillItem = {
  name: string;
  quantity: number;
  unit: string;
  price: number;
};

export type PendingBill = {
  source: string;
  createdAt: string;
  items: IncomingBillItem[];
};

export function env(name: string): string | null {
  const value = process.env[name]?.trim();
  return value || null;
}

export async function redisCommand<T>(command: (string | number)[]): Promise<T> {
  const url = env("UPSTASH_REDIS_REST_URL");
  const token = env("UPSTASH_REDIS_REST_TOKEN");
  if (!url || !token) throw new Error("Redis is not configured");

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Redis request failed");
  const result = (await response.json()) as { result?: T; error?: string };
  if (result.error) throw new Error("Redis command failed");
  return result.result as T;
}

function sign(expiresAt: string, secret: string): string {
  return createHmac("sha256", secret).update(expiresAt).digest("base64url");
}

export function createSessionValue(secret: string): { value: string; maxAge: number } {
  const expiresAt = String(Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS);
  return { value: `${expiresAt}.${sign(expiresAt, secret)}`, maxAge: SESSION_TTL_SECONDS };
}

export function isValidSession(value: string | undefined, secret: string): boolean {
  if (!value) return false;
  const [expiresAt, signature, ...extra] = value.split(".");
  if (!expiresAt || !signature || extra.length || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) <= Math.floor(Date.now() / 1000)) return false;
  const expected = sign(expiresAt, secret);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function isValidBillItems(value: unknown): value is IncomingBillItem[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 100 &&
    value.every((item) =>
      item && typeof item.name === "string" && item.name.trim().length > 0 &&
      typeof item.quantity === "number" && Number.isFinite(item.quantity) && item.quantity > 0 &&
      typeof item.unit === "string" && item.unit.trim().length > 0 &&
      typeof item.price === "number" && Number.isFinite(item.price) && item.price >= 0
    );
}

export function safeSecretEqual(provided: string, expected: string): boolean {
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}
