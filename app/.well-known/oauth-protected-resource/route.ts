import { NextResponse } from "next/server";
import { getOAuthIssuer, getOAuthResource } from "@/lib/shop-bill-oauth";

export async function GET() {
  return NextResponse.json({
    resource: getOAuthResource(),
    authorization_servers: [getOAuthIssuer()],
    scopes_supported: ["bills:write"],
    resource_documentation: "https://shop-bill-phi.vercel.app",
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
