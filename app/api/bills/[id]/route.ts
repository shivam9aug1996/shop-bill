import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";
import { databaseUnavailable, normalizeSavedItems, requireBillSession } from "@/lib/bill-history";
import { billGrandTotal, type BillItem } from "@/lib/bill";

type Context = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: Context) {
  const unauthorized = requireBillSession(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  try {
    const bill = await (await getDatabase()).collection("bills").findOne({ _id: new ObjectId(id) });
    if (!bill) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
    return NextResponse.json({ ...bill, id: bill._id.toString(), _id: undefined }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return databaseUnavailable(error);
  }
}

export async function PATCH(request: NextRequest, context: Context) {
  const unauthorized = requireBillSession(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  try {
    const body = await request.json();
    const items = normalizeSavedItems(body.items);
    if (!items) return NextResponse.json({ error: "Please add at least one valid item." }, { status: 400 });
    const updatedAt = new Date().toISOString();
    const result = await (await getDatabase()).collection("bills").updateOne(
      { _id: new ObjectId(id) },
      { $set: { items, total: billGrandTotal(items as BillItem[]), updatedAt } },
    );
    if (!result.matchedCount) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
    return NextResponse.json({ updated: true, updatedAt });
  } catch (error) {
    return databaseUnavailable(error);
  }
}

export async function DELETE(request: NextRequest, context: Context) {
  const unauthorized = requireBillSession(request);
  if (unauthorized) return unauthorized;
  const { id } = await context.params;
  if (!ObjectId.isValid(id)) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
  try {
    const result = await (await getDatabase()).collection("bills").deleteOne({ _id: new ObjectId(id) });
    if (!result.deletedCount) return NextResponse.json({ error: "Bill not found." }, { status: 404 });
    return NextResponse.json({ deleted: true });
  } catch (error) {
    return databaseUnavailable(error);
  }
}
