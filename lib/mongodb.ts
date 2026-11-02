import { MongoClient, type Db } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) {
  // Keep module initialization safe during builds; requests return a clear 503.
}

declare global {
  // eslint-disable-next-line no-var
  var shopBillMongoClient: Promise<MongoClient> | undefined;
}

export async function getDatabase(): Promise<Db> {
  const connectionString = process.env.MONGODB_URI;
  if (!connectionString) throw new Error("MONGODB_URI is not configured");
  global.shopBillMongoClient ??= new MongoClient(connectionString).connect();
  const client = await global.shopBillMongoClient;
  return client.db(process.env.MONGODB_DB_NAME || "shop_bill");
}
