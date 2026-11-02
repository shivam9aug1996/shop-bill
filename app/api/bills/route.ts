import { NextRequest, NextResponse } from "next/server";
import { ObjectId } from "mongodb";
import { getDatabase } from "@/lib/mongodb";
import { databaseUnavailable, normalizeSavedItems, requireBillSession } from "@/lib/bill-history";
import { billGrandTotal, type BillItem } from "@/lib/bill";

export async function GET(request: NextRequest) {
  const unauthorized = requireBillSession(request);
  if (unauthorized) return unauthorized;
  try {
    const db = await getDatabase();
    const { searchParams } = new URL(request.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    const q = searchParams.get("q")?.trim();
    const filter: Record<string, unknown> = {};
    if (from || to) {
      const range: Record<string, string> = {};
      if (from) range.$gte = new Date(from + "T00:00:00.000+05:30").toISOString();
      if (to) range.$lte = new Date(to + "T23:59:59.999+05:30").toISOString();
      filter.createdAt = range;
    }
    if (q) {
      const safe = q.replace(/[.*+?^\u0024{}()|[\\]\\\\]/g, "\\\\$&");
      if (ObjectId.isValid(q)) filter.$or = [{ _id: new ObjectId(q) }, { "items.name": { $regex: safe, $options: "i" } }];
      else filter["items.name"] = { $regex: safe, $options: "i" };
    }
    const bills = await db.collection("bills").find(filter).sort({ createdAt: -1 }).limit(200).toArray();
    const total = await db.collection("bills").countDocuments(filter);
    const daily = await db.collection("bills").aggregate([
      { $match: filter },
      { $group: { _id: { $substrBytes: ["$createdAt", 0, 10] }, amount: { $sum: "$total" }, bills: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]).toArray();
    return NextResponse.json({
      bills: bills.map((bill) => ({ ...bill, id: bill._id.toString(), _id: undefined })),
      count: total,
      daily,
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return databaseUnavailable(error);
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireBillSession(request);
  if (unauthorized) return unauthorized;
  try {
    const body = await request.json();
    const items = normalizeSavedItems(body.items);
    if (!items) return NextResponse.json({ error: "Please add at least one valid item." }, { status: 400 });
    const db = await getDatabase();
    const createdAt = new Date().toISOString();
    const total = billGrandTotal(items as BillItem[]);
    const document = {
      billNumber: "SB-" + Date.now().toString().slice(-8),
      createdAt,
      updatedAt: createdAt,
      source: typeof body.source === "string" ? body.source.slice(0, 80) : "Website",
      items,
      total,
      ...(typeof body.sourceCreatedAt === "string" && body.sourceCreatedAt
        ? { sourceCreatedAt: body.sourceCreatedAt }
        : {}),
    };
    if (document.sourceCreatedAt) {
      const collection = db.collection("bills");
      await collection.createIndex({ sourceCreatedAt: 1 }, { unique: true, sparse: true });
      await collection.updateOne(
        { sourceCreatedAt: document.sourceCreatedAt },
        { $setOnInsert: document },
        { upsert: true },
      );
      const saved = await collection.findOne({ sourceCreatedAt: document.sourceCreatedAt });
      return NextResponse.json({ id: saved?._id.toString(), createdAt, total }, { status: 200 });
    }
    const result = await db.collection("bills").insertOne(document);
    return NextResponse.json({ id: result.insertedId.toString(), createdAt, total }, { status: 201 });
  } catch (error) {
    return databaseUnavailable(error);
  }
}
