import { NextResponse } from "next/server";
import { getOAuthIssuer } from "@/lib/shop-bill-oauth";

export async function GET() {
  const issuer = getOAuthIssuer();
  return NextResponse.json({
    issuer,
    authorization_response_iss_parameter_supported: true,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
    scopes_supported: ["bills:write"],
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
