"use client";

import {
  billGrandTotal,
  parseBill,
  STORAGE_KEY,
  UNITS,
  type BillItem,
} from "@/lib/bill";
import { useCallback, useEffect, useState } from "react";

type IncomingBill = {
  id: string;
  createdAt: string;
  source: string;
  items: Array<{ name: string; quantity: string; unit: string; price: string }>;
};

const AUTO_IMPORT_KEY = "shop-bill-auto-import-connected-v1";

export default function Home() {
  const [items, setItems] = useState<BillItem[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [message, setMessage] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [pin, setPin] = useState("");
  const [autoConnected, setAutoConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [incomingBill, setIncomingBill] = useState<IncomingBill | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setItems(JSON.parse(saved));
      setAutoConnected(localStorage.getItem(AUTO_IMPORT_KEY) === "true");
    } catch {
      console.error("Could not load saved bill");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);

  const total = billGrandTotal(items);

  const pollForBill = useCallback(async () => {
    try {
      const response = await fetch("/api/bills/pending", { cache: "no-store" });
      if (response.status === 401) {
        setAutoConnected(false);
        localStorage.removeItem(AUTO_IMPORT_KEY);
        return;
      }
      if (!response.ok) return;
      const data = (await response.json()) as { bill: IncomingBill | null };
      if (!data.bill) return;

      const bill = data.bill;
      const importedItems: BillItem[] = bill.items.map((item) => ({
        ...item,
        id: crypto.randomUUID(),
      }));

      if (items.length === 0) {
        setItems(importedItems);
        setMessage(`ChatGPT se ${importedItems.length} items ka bill aa gaya.`);
      } else {
        setIncomingBill({ ...bill, items: importedItems });
        setMessage("Naya bill aa gaya hai. Apne current bill ko replace karne se pehle check karein.");
      }
    } catch {
      // A temporary network error should not interrupt normal billing.
    }
  }, [items.length]);

  useEffect(() => {
    if (!loaded || !autoConnected || incomingBill) return;
    void pollForBill();
    const timer = window.setInterval(() => void pollForBill(), 4000);
    return () => window.clearInterval(timer);
  }, [loaded, autoConnected, incomingBill, pollForBill]);

  function updateItem(id: string, field: keyof BillItem, value: string) {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    );
  }

  function addItem() {
    setItems((current) => [
      ...current,
      { id: crypto.randomUUID(), name: "", quantity: "1", unit: "Piece", price: "0" },
    ]);
  }

  function importBill() {
    const parsed = parseBill(pasteText);
    if (!parsed.length) {
      setMessage("Bill parse nahi hua. ChatGPT ki table copy karke dobara try karein.");
      return;
    }
    setItems(parsed);
    setPasteText("");
    setMessage(`${parsed.length} items successfully import ho gaye.`);
  }

  async function connectAutoImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnecting(true);
    setMessage("");
    try {
      const response = await fetch("/api/bills/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessage(data.error || "Auto Import connect nahi ho paya.");
        return;
      }
      localStorage.setItem(AUTO_IMPORT_KEY, "true");
      setAutoConnected(true);
      setPin("");
      setMessage("Auto Import connected. ChatGPT se bheje gaye bills yahan aayenge.");
    } catch {
      setMessage("Network error. Dobara try karein.");
    } finally {
      setConnecting(false);
    }
  }

  function disconnectAutoImport() {
    localStorage.removeItem(AUTO_IMPORT_KEY);
    setAutoConnected(false);
    setMessage("Auto Import polling band kar di gayi.");
  }

  function loadIncomingBill() {
    if (!incomingBill) return;
    if (items.length > 0 && !confirm("Current bill replace karna hai? Pehle current bill copy/share kar lein.")) {
      return;
    }
    setItems(incomingBill.items);
    setMessage(`${incomingBill.items.length} incoming items load ho gaye.`);
    setIncomingBill(null);
  }

  function getBillText() {
    const lines = items
      .filter((item) => item.name.trim())
      .map((item, index) => `${index + 1}. ${item.name} — ${item.quantity} ${item.unit} — ₹${Number(item.price) || 0}`);
    return `🧾 SHOP BILL\\n\\n${lines.join("\\n")}\\n\\nTotal: ₹${total.toLocaleString("en-IN")}`;
  }

  async function copyBill() {
    try {
      await navigator.clipboard.writeText(getBillText());
      setMessage("Bill copied! Ab ise ChatGPT ya WhatsApp mein paste karein.");
    } catch {
      setMessage("Copy nahi hua. Browser clipboard permission check karein.");
    }
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(getBillText())}`, "_blank", "noopener,noreferrer");
  }

  function clearBill() {
    if (confirm("Kya aap poora bill clear karna chahte hain?")) {
      setItems([]);
      setMessage("Bill clear ho gaya.");
    }
  }

  if (!loaded) return <main className="p-8">Loading bill...</main>;

  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-900">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-3xl font-bold">Shop Billing</h1>
          <p className="mt-2 text-sm text-slate-600">
            Paste bill, edit items, calculate total and share on WhatsApp.
          </p>
        </header>

        <section className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">ChatGPT Auto Import</h2>
              <p className="mt-1 max-w-2xl text-sm text-slate-600">
                Pair this browser once. When your configured ChatGPT Action sends a bill, it will appear here automatically.
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${autoConnected ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-600"}`}>
              {autoConnected ? "● Connected" : "Not connected"}
            </span>
          </div>

          {!autoConnected ? (
            <form onSubmit={connectAutoImport} className="mt-4 flex flex-col gap-2 sm:flex-row">
              <label className="sr-only" htmlFor="pairing-pin">Auto Import pairing PIN</label>
              <input
                id="pairing-pin"
                type="password"
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="Enter your Vercel pairing PIN"
                className="min-w-0 flex-1 rounded-xl border border-slate-300 px-3 py-2.5 outline-none focus:border-emerald-600"
                required
              />
              <button disabled={connecting} className="rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white disabled:opacity-60">
                {connecting ? "Connecting..." : "Connect Auto Import"}
              </button>
            </form>
          ) : (
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <p className="text-sm text-emerald-800">Listening for bills in this browser…</p>
              <button type="button" onClick={disconnectAutoImport} className="rounded-xl border border-slate-300 px-3 py-2 text-sm">Disconnect</button>
            </div>
          )}

          {incomingBill && (
            <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
              <p className="font-semibold">Incoming bill: {incomingBill.items.length} items</p>
              <p className="mt-1 text-sm text-slate-700">A bill arrived from ChatGPT, but your current bill is not empty. Loading it will replace the current bill.</p>
              <button type="button" onClick={loadIncomingBill} className="mt-3 rounded-xl bg-amber-700 px-4 py-2.5 font-semibold text-white">Review and load incoming bill</button>
            </div>
          )}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Paste ChatGPT Bill</h2>
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="ChatGPT se poori bill table copy karke yahan paste karein..."
            className="min-h-36 w-full rounded-xl border border-slate-300 p-3 outline-none focus:border-emerald-600"
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={importBill} className="rounded-xl bg-emerald-700 px-4 py-2.5 font-semibold text-white">Import Bill</button>
            <button type="button" onClick={() => setPasteText("")} className="rounded-xl bg-slate-100 px-4 py-2.5">Clear Text</button>
          </div>
          {message && <p aria-live="polite" className="mt-3 text-sm text-emerald-700">{message}</p>}
        </section>

        <section className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-semibold">Bill Items</h2>
            <button type="button" onClick={addItem} className="rounded-xl bg-slate-900 px-4 py-2.5 font-semibold text-white">+ Add Item</button>
          </div>
          <p className="mb-4 text-sm text-slate-600">
            Price column = line total (poori row ki rakam). Quantity se multiply nahi hota.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b bg-slate-50 text-sm text-slate-600">
                  <th className="p-3">#</th><th className="p-3">Item</th><th className="p-3">Quantity</th><th className="p-3">Unit</th><th className="p-3 text-right">Line total (₹)</th><th className="p-3">Delete</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, index) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="p-2">{index + 1}</td>
                    <td className="p-2"><input value={item.name} onChange={(event) => updateItem(item.id, "name", event.target.value)} placeholder="Item name" aria-label={`Item ${index + 1} name`} className="w-40 rounded-lg border p-2" /></td>
                    <td className="p-2"><input type="number" min="0" step="any" value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", event.target.value)} aria-label={`Item ${index + 1} quantity`} className="w-24 rounded-lg border p-2" /></td>
                    <td className="p-2">
                      <select value={item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value)} aria-label={`Item ${index + 1} unit`} className="w-28 rounded-lg border bg-white p-2">
                        {[...new Set([...UNITS, item.unit])].map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </td>
                    <td className="p-2"><input type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateItem(item.id, "price", event.target.value)} aria-label={`Item ${index + 1} line total`} className="w-28 rounded-lg border p-2 text-right" /></td>
                    <td className="p-2"><button type="button" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} className="rounded-lg bg-red-50 px-3 py-2 text-red-700" aria-label={`Delete ${item.name || "item"}`}>✕</button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="p-8 text-center text-slate-500">No items yet. Paste a bill above or add an item.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="mt-6 flex flex-wrap items-center justify-between gap-4 border-t pt-5">
            <span className="text-lg font-semibold">Grand Total</span>
            <span className="text-3xl font-bold text-emerald-700">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" onClick={copyBill} className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white">Copy Bill</button>
            <button type="button" onClick={shareWhatsApp} className="rounded-xl bg-green-600 px-4 py-3 font-semibold text-white">Share on WhatsApp</button>
            <button type="button" onClick={clearBill} className="rounded-xl bg-red-50 px-4 py-3 font-semibold text-red-700">Clear Bill</button>
          </div>
          <p className="mt-4 text-xs text-slate-500">
            Bill changes are saved in this browser. Auto Import receives bills through the connected browser session; it does not sync your manually edited bill to ChatGPT.
          </p>
        </section>
      </div>
    </main>
  );
}
