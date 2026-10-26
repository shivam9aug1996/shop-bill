import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const RESOURCE = "https://shop-bill-phi.vercel.app/api/mcp";
const ISSUER = "https://shop-bill-phi.vercel.app";
const CODE_TTL = 300;
const TOKEN_TTL = 3600;

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
  if (!response.ok) throw new Error("OAuth storage request failed");
  const payload = (await response.json()) as { result?: unknown; error?: string };
  if (payload.error) throw new Error("OAuth storage command failed");
  return payload.result;
}

function secret(): string {
  return requiredEnv("BILL_SESSION_SECRET");
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type OAuthCodeRecord = {
  clientId: string;
  redirectUri: string;
  challenge: string;
  resource: string;
  expiresAt: number;
};

export function createAuthorizationCode(): string {
  return randomBytes(32).toString("base64url");
}

export async function saveAuthorizationCode(code: string, record: OAuthCodeRecord): Promise<void> {
  await redisCommand(["SET", `shop-bill:oauth:code:${code}`, JSON.stringify(record), "EX", String(CODE_TTL), "NX"]);
}

export async function consumeAuthorizationCode(code: string): Promise<OAuthCodeRecord | null> {
  // GETDEL is atomic on Redis 6.2+, preventing authorization-code replay.
  const raw = await redisCommand(["GETDEL", `shop-bill:oauth:code:${code}`]);
  if (typeof raw !== "string") return null;
  try {
    const value = JSON.parse(raw) as OAuthCodeRecord;
    return value.expiresAt > Date.now() ? value : null;
  } catch {
    return null;
  }
}

type TokenClaims = {
  iss: string;
  aud: string;
  sub: string;
  scope: string;
  iat: number;
  exp: number;
  jti: string;
};

export function issueAccessToken(): { token: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000);
  const claims: TokenClaims = {
    iss: ISSUER,
    aud: RESOURCE,
    sub: "shop-owner",
    scope: "bills:write",
    iat: now,
    exp: now + TOKEN_TTL,
    jti: randomBytes(16).toString("hex"),
  };
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return { token: `${payload}.${sign(payload)}`, expiresIn: TOKEN_TTL };
}

export function verifyAccessToken(token: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 2 || !constantTimeEqual(parts[1], sign(parts[0]))) return false;
  try {
    const claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8")) as TokenClaims;
    const now = Math.floor(Date.now() / 1000);
    return claims.iss === ISSUER && claims.aud === RESOURCE &&
      claims.sub === "shop-owner" && claims.scope.split(" ").includes("bills:write") &&
      Number.isInteger(claims.exp) && claims.exp > now &&
      Number.isInteger(claims.iat) && claims.iat <= now + 30;
  } catch {
    return false;
  }
}

export function getOAuthResource(): string {
  return RESOURCE;
}

export function getOAuthIssuer(): string {
  return ISSUER;
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const actual = createHmac("sha256", "pkce-unused").update(verifier).digest("base64url");
  // PKCE S256 is plain SHA-256, not HMAC.
  const expected = Buffer.from(verifier).length ? requireSha256(verifier) : "";
  return constantTimeEqual(expected, challenge);
}

function requireSha256(value: string): string {
  // Avoid non-standard crypto APIs; digest is base64url as required by RFC 7636.
  const { createHash } = require("node:crypto") as typeof import("node:crypto");
  return createHash("sha256").update(value).digest("base64url");
}
