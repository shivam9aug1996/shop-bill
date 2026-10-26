import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { createAuthorizationCode, saveAuthorizationCode, getOAuthResource, getOAuthIssuer } from "@/lib/shop-bill-oauth";

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

function validRedirect(uri: string): boolean {
  try {
    const url = new URL(uri);
    return url.protocol === "https:" && url.hostname === "chatgpt.com" &&
      (url.pathname.startsWith("/connector/oauth/") ||
       url.pathname === "/connector_platform_oauth_redirect");
  } catch { return false; }
}

function page(message = "") {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Authorize Shop Bill</title></head><body style="font:16px system-ui;max-width:440px;margin:12vh auto;padding:24px;color:#171717"><h1>Connect Shop Bill</h1><p>Enter your Shop Bill Auto Import PIN to authorize ChatGPT to send bills to your website.</p>${message ? `<p style="color:#b91c1c">${message}</p>` : ""}<form method="post"><input type="hidden" name="client_id" value="${escapeHtml(params.client_id)}"><input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirect_uri)}"><input type="hidden" name="state" value="${escapeHtml(params.state)}"><input type="hidden" name="code_challenge" value="${escapeHtml(params.code_challenge)}"><input type="hidden" name="code_challenge_method" value="S256"><input type="hidden" name="resource" value="${escapeHtml(params.resource)}"><input type="hidden" name="response_type" value="code"><label for="pin">Auto Import PIN</label><input id="pin" name="pin" type="password" required autocomplete="current-password" style="display:block;box-sizing:border-box;width:100%;padding:12px;margin:8px 0 16px"><button style="padding:12px 18px">Authorize</button></form></body></html>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]!));
}

let params = { client_id: "", redirect_uri: "", state: "", code_challenge: "", resource: "" };

export async function GET(request: Request) {
  const url = new URL(request.url);
  params = {
    client_id: url.searchParams.get("client_id") ?? "",
    redirect_uri: url.searchParams.get("redirect_uri") ?? "",
    state: url.searchParams.get("state") ?? "",
    code_challenge: url.searchParams.get("code_challenge") ?? "",
    resource: url.searchParams.get("resource") ?? "",
  };
  const validClient = params.client_id.startsWith("https://chatgpt.com/oauth/");
  const validChallenge = /^[A-Za-z0-9_-]{43,128}$/.test(params.code_challenge);
  if (url.searchParams.get("response_type") !== "code" || !validClient ||
      !validRedirect(params.redirect_uri) || !validChallenge ||
      url.searchParams.get("code_challenge_method") !== "S256" ||
      params.resource !== getOAuthResource()) {
    return new NextResponse("Invalid OAuth authorization request.", { status: 400 });
  }
  return new NextResponse(page(), { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const form = await request.formData();
  const clientId = String(form.get("client_id") ?? "");
  const redirectUri = String(form.get("redirect_uri") ?? "");
  const state = String(form.get("state") ?? "");
  const challenge = String(form.get("code_challenge") ?? "");
  const resource = String(form.get("resource") ?? "");
  const pin = String(form.get("pin") ?? "");
  const expectedPin = process.env.BILL_IMPORT_PIN ?? "";
  if (!expectedPin || !safeEqual(pin, expectedPin)) {
    return new NextResponse(page("Incorrect PIN. Please try again."), {
      status: 401, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
  if (!clientId.startsWith("https://chatgpt.com/oauth/") || !validRedirect(redirectUri) ||
      resource !== getOAuthResource() || !/^[A-Za-z0-9_-]{43,128}$/.test(challenge) ||
      !/^[A-Za-z0-9._~-]{1,512}$/.test(state)) {
    return new NextResponse("Invalid OAuth authorization request.", { status: 400 });
  }
  const code = createAuthorizationCode();
  await saveAuthorizationCode(code, {
    clientId, redirectUri, challenge, resource, expiresAt: Date.now() + 5 * 60 * 1000,
  });
  const callback = new URL(redirectUri);
  callback.searchParams.set("code", code);
  callback.searchParams.set("state", state);
  callback.searchParams.set("iss", getOAuthIssuer());
  return NextResponse.redirect(callback, 302);
}
