import { timingSafeEqual, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { enqueueRemoteBill, type RemoteBill, type RemoteBillItem } from "@/lib/remote-bills";

type JsonRpcRequest = {
  jsonrpc?: unknown;
  id?: unknown;
  method?: unknown;
  params?: unknown;
};

function jsonRpc(id: unknown, result: unknown, status = 200) {
  return NextResponse.json({ jsonrpc: "2.0", id, result }, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function jsonRpcError(id: unknown, code: number, message: string, status = 400) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message },
  }, { status, headers: { "Cache-Control": "no-store" } });
}

function isAuthorized(request: Request): boolean {
  const expected = process.env.BILL_IMPORT_API_KEY;
  if (!expected) return false;
  const header = request.headers.get("authorization") ?? "";
  const supplied = header.startsWith("Bearer ") ? header.slice(7) : "";
  const actualBuffer = Buffer.from(supplied);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer);
}

function toItem(value: unknown): RemoteBillItem | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  if (typeof item.name !== "string" || !item.name.trim()) return null;
  const quantity = Number(item.quantity);
  const price = Number(item.price);
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  if (!Number.isFinite(price) || price < 0) return null;
  if (typeof item.unit !== "string" || !item.unit.trim()) return null;
  return {
    name: item.name.trim().slice(0, 120),
    quantity: String(quantity),
    unit: item.unit.trim().slice(0, 24),
    price: String(Math.round(price * 100) / 100),
  };
}

const IMPORT_TOOL = {
  name: "import_shop_bill",
  description:
    "Send a prepared shop bill to the paired Shop Bill website. Price is the full line total for each item, not the unit rate. Only call when the user explicitly asks to send/import the bill.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["items"],
    properties: {
      source: { type: "string", description: "Usually ChatGPT.", default: "ChatGPT" },
      items: {
        type: "array",
        minItems: 1,
        maxItems: 100,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["name", "quantity", "unit", "price"],
          properties: {
            name: { type: "string" },
            quantity: { type: "number", exclusiveMinimum: 0 },
            unit: { type: "string", description: "Examples: g, kg, ml, L, Piece." },
            price: { type: "number", minimum: 0, description: "Full line total in rupees." },
          },
        },
      },
    },
  },
};

async function handleToolCall(params: unknown) {
  if (!params || typeof params !== "object") {
    return { isError: true, content: [{ type: "text", text: "Missing tool parameters." }] };
  }
  const input = params as { name?: unknown; arguments?: unknown };
  if (input.name !== IMPORT_TOOL.name) {
    return { isError: true, content: [{ type: "text", text: "Unknown tool." }] };
  }
  if (!input.arguments || typeof input.arguments !== "object") {
    return { isError: true, content: [{ type: "text", text: "Provide bill items in arguments." }] };
  }
  const args = input.arguments as { items?: unknown; source?: unknown };
  if (!Array.isArray(args.items) || args.items.length < 1 || args.items.length > 100) {
    return { isError: true, content: [{ type: "text", text: "Provide between 1 and 100 items." }] };
  }
  const items = args.items.map(toItem);
  if (items.some((item) => item === null)) {
    return {
      isError: true,
      content: [{ type: "text", text: "Each item needs a name, positive numeric quantity, unit, and non-negative line total." }],
    };
  }

  const bill: RemoteBill = {
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    source: typeof args.source === "string" ? args.source.slice(0, 80) : "ChatGPT",
    items: items as RemoteBillItem[],
  };
  try {
    await enqueueRemoteBill(bill);
    const total = bill.items.reduce((sum, item) => sum + Number(item.price), 0);
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          success: true,
          billId: bill.id,
          itemCount: bill.items.length,
          total: Math.round(total * 100) / 100,
          message: "Bill queued. Check that the user's Shop Bill website is open and Auto Import is connected.",
        }),
      }],
    };
  } catch {
    return { isError: true, content: [{ type: "text", text: "Could not queue the bill. Check Upstash configuration." }] };
  }
}

export async function POST(request: Request) {
  if (!process.env.BILL_IMPORT_API_KEY) {
    return NextResponse.json({ error: "MCP server is not configured." }, { status: 503 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, {
      status: 401,
      headers: { "WWW-Authenticate": 'Bearer realm="Shop Bill MCP"' },
    });
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json() as JsonRpcRequest;
  } catch {
    return jsonRpcError(null, -32700, "Parse error");
  }

  if (body.jsonrpc !== "2.0" || typeof body.method !== "string") {
    return jsonRpcError(body.id, -32600, "Invalid JSON-RPC request");
  }

  // MCP notifications do not include an id and must not receive a JSON-RPC response.
  if (body.id === undefined) {
    return new NextResponse(null, { status: 202, headers: { "Cache-Control": "no-store" } });
  }

  if (body.method === "initialize") {
    return jsonRpc(body.id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: {} },
      serverInfo: { name: "shop-bill-importer", version: "1.0.0" },
    });
  }

  if (body.method === "ping") return jsonRpc(body.id, {});

  if (body.method === "tools/list") {
    return jsonRpc(body.id, { tools: [IMPORT_TOOL] });
  }

  if (body.method === "tools/call") {
    const result = await handleToolCall(body.params);
    return jsonRpc(body.id, result);
  }

  if (body.method === "resources/list") return jsonRpc(body.id, { resources: [] });
  if (body.method === "prompts/list") return jsonRpc(body.id, { prompts: [] });

  return jsonRpcError(body.id, -32601, "Method not found");
}

export async function GET() {
  return new NextResponse("Shop Bill MCP endpoint. Use POST with MCP JSON-RPC.", {
    status: 405,
    headers: { Allow: "POST", "Cache-Control": "no-store" },
  });
}
