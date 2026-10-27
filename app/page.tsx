"use client";

import {
  billGrandTotal,
  normalizeUnit,
  parseBill,
  STORAGE_KEY,
  UNITS,
  type BillItem,
} from "@/lib/bill";
import { useCallback, useEffect, useRef, useState } from "react";

const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 hover:border-slate-300 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10";

export default function Home() {
  const [items, setItems] = useState<BillItem[]>([]);
  const [pasteText, setPasteText] = useState("");
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState<"success" | "error">("success");
  const [loaded, setLoaded] = useState(false);
  const [connected, setConnected] = useState(false);
  const [pin, setPin] = useState("");
  const [connecting, setConnecting] = useState(false);
  const lastImportedBill = useRef<string | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setItems((JSON.parse(saved) as BillItem[]).map((item) => ({ ...item, unit: ({ "किलो": "kg", "किलोग्राम": "kg", "ग्राम": "g", "मिलीग्राम": "mg", "लीटर": "L", "मिलीलीटर": "ml", "पीस": "Piece", "पैकेट": "Packet", "बॉक्स": "Box", "दर्जन": "Dozen" } as Record<string, string>)[item.unit] || item.unit })));
    } catch {
      console.error("Could not load saved bill");
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded]);


  const pollPendingBill = useCallback(async () => {
    try {
      const response = await fetch("/api/bills/pending", { cache: "no-store" });
      if (response.status === 401) {
        setConnected(false);
        return;
      }
      if (!response.ok) {
        if (response.status === 503) {
          setMessageType("error");
          setMessage("Redis configuration जाँचें: Vercel environment variables सेट होने चाहिए।");
        }
        return;
      }

      const data = (await response.json()) as {
        connected: boolean;
        bill: { createdAt: string; items: { name: string; quantity: number; unit: string; price: number }[] } | null;
      };
      setConnected(true);
      if (!data.bill || !Array.isArray(data.bill.items)) return;
      if (lastImportedBill.current === data.bill.createdAt) return;

      const importedItems: BillItem[] = data.bill.items.map((item) => ({
        id: crypto.randomUUID(),
        name: item.name,
        quantity: String(item.quantity),
        unit: normalizeUnit(item.unit),
        price: String(item.price),
      }));
      lastImportedBill.current = data.bill.createdAt;
      setItems(importedItems);
      setMessageType("success");
      setMessage(`Redis से ${importedItems.length} सामान वाला बिल इम्पोर्ट हो गया।`);
    } catch {
      // Keep the bill editor usable if the network is temporarily unavailable.
    }
  }, []);

  useEffect(() => {
    if (loaded) void pollPendingBill();
  }, [loaded, pollPendingBill]);

  useEffect(() => {
    if (!connected) return;
    void pollPendingBill();
    const interval = window.setInterval(() => void pollPendingBill(), 4000);
    return () => window.clearInterval(interval);
  }, [connected, pollPendingBill]);

  async function connectAutoImport(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setConnecting(true);
    try {
      const response = await fetch("/api/auth/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setMessageType("error");
        setMessage(data.error || "Website connect नहीं हो पाई।");
        return;
      }
      setPin("");
      setConnected(true);
      setMessageType("success");
      setMessage("Website connect हो गई। Redis से bill अपने-आप check होगा।");
    } catch {
      setMessageType("error");
      setMessage("Connect नहीं हो पाया। Internet connection जाँचें।");
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectAutoImport() {
    await fetch("/api/auth/disconnect", { method: "POST" });
    setConnected(false);
    setMessageType("success");
    setMessage("Auto Import disconnect हो गया।");
  }

  const total = billGrandTotal(items);

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
      setMessageType("error");
      setMessage("बिल समझ नहीं आया। ChatGPT की पूरी टेबल कॉपी करके दोबारा कोशिश करें।");
      return;
    }
    setItems(parsed);
    setPasteText("");
    setMessageType("success");
    setMessage(`${parsed.length} सामान सफलतापूर्वक इम्पोर्ट हो गया।`);
  }

  function getBillText() {
    const lines = items
      .filter((item) => item.name.trim())
      .map((item, index) => `${index + 1}. ${item.name} — ${item.quantity} ${item.unit} — ₹${Number(item.price) || 0}`);
    return `🧾 दुकान का बिल\\n\\n${lines.join("\\n")}\\n\\nकुल बिल: ₹${total.toLocaleString("en-IN")}`;
  }

  async function copyBill() {
    try {
      await navigator.clipboard.writeText(getBillText());
      setMessageType("success");
      setMessage("बिल कॉपी हो गया। अब इसे WhatsApp पर पेस्ट कर सकते हैं।");
    } catch {
      setMessageType("error");
      setMessage("कॉपी नहीं हुआ। ब्राउज़र की clipboard permission जाँचें।");
    }
  }

  function shareWhatsApp() {
    window.open(`https://wa.me/?text=${encodeURIComponent(getBillText())}`, "_blank", "noopener,noreferrer");
  }

  function clearBill() {
    if (confirm("क्या आप पूरा बिल साफ़ करना चाहते हैं?")) {
      setItems([]);
      setMessageType("success");
      setMessage("बिल साफ़ हो गया।");
    }
  }

  if (!loaded) return <main className="grid min-h-screen place-items-center bg-slate-50 text-slate-500">बिल लोड हो रहा है…</main>;

  return (
    <main className="min-h-screen bg-slate-50 px-3 py-6 text-slate-900 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">
              <span className="h-2 w-2 rounded-full bg-emerald-600" /> दुकान का हिसाब
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Shop Billing</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-500">
              बिल इम्पोर्ट करें, सामान और कीमत बदलें, फिर कुल जोड़कर WhatsApp पर भेजें।
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
            <p className="text-xs font-medium text-slate-500">कुल सामान</p>
            <p className="mt-1 text-2xl font-bold">{items.length} <span className="text-sm font-medium text-slate-500">आइटम</span></p>
          </div>
        </header>

        <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold">Redis Auto Import</h2>
              <p className="mt-1 text-sm text-slate-500">
                {connected ? "Connected — नए bills अपने-आप हर 4 सेकंड में check होंगे।" : "PIN डालकर connect करें, फिर Redis का pending bill अपने-आप आएगा।"}
              </p>
            </div>
            {connected ? (
              <button type="button" onClick={disconnectAutoImport} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                Disconnect
              </button>
            ) : (
              <form onSubmit={connectAutoImport} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input
                  type="password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="Connection PIN"
                  aria-label="Auto Import connection PIN"
                  autoComplete="current-password"
                  required
                  className={`${inputClass} sm:w-52`}
                />
                <button type="submit" disabled={connecting} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {connecting ? "Connecting…" : "Connect Auto Import"}
                </button>
              </form>
            )}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-4">
            <h2 className="text-lg font-bold">ChatGPT से बिल इम्पोर्ट करें</h2>
            <p className="mt-1 text-sm text-slate-500">बिल की टेबल कॉपी करके नीचे पेस्ट करें।</p>
          </div>
          <textarea
            value={pasteText}
            onChange={(event) => setPasteText(event.target.value)}
            placeholder="यहाँ पूरा बिल पेस्ट करें…"
            className={`${inputClass} min-h-36 resize-y leading-6`}
          />
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={importBill} className="rounded-xl bg-emerald-700 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 focus:outline-none focus:ring-4 focus:ring-emerald-700/20">
              बिल इम्पोर्ट करें
            </button>
            <button type="button" onClick={() => { setPasteText(""); setMessage(""); }} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
              टेक्स्ट साफ़ करें
            </button>
          </div>
          {message && (
            <p aria-live="polite" className={`mt-4 rounded-xl px-4 py-3 text-sm font-medium ${messageType === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-800"}`}>
              {message}
            </p>
          )}
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <div>
              <h2 className="text-xl font-bold">बिल के सामान</h2>
              <p className="mt-1 text-sm text-slate-500">हर पंक्ति में कीमत उस सामान की पूरी रकम है।</p>
            </div>
            <button type="button" onClick={addItem} className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">
              <span className="text-lg leading-none">+</span> सामान जोड़ें
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left">
              <thead>
                <tr className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="w-12 px-4 py-3">#</th>
                  <th className="px-3 py-3">सामान का नाम</th>
                  <th className="w-32 px-3 py-3">मात्रा</th>
                  <th className="w-36 px-3 py-3">Unit</th>
                  <th className="w-40 px-3 py-3 text-right">रकम (₹)</th>
                  <th className="w-20 px-4 py-3 text-center">हटाएँ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => (
                  <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-sm font-medium text-slate-400">{index + 1}</td>
                    <td className="px-3 py-3"><input value={item.name} onChange={(event) => updateItem(item.id, "name", event.target.value)} placeholder="जैसे चीनी" aria-label={`सामान ${index + 1} का नाम`} className={inputClass} /></td>
                    <td className="px-3 py-3"><input type="number" min="0" step="any" value={item.quantity} onChange={(event) => updateItem(item.id, "quantity", event.target.value)} aria-label={`सामान ${index + 1} की मात्रा`} className={inputClass} /></td>
                    <td className="px-3 py-3">
                      <select value={item.unit} onChange={(event) => updateItem(item.id, "unit", event.target.value)} aria-label={`Item ${index + 1} unit`} className={`${inputClass} cursor-pointer`}>
                        {UNITS.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3"><div className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">₹</span><input type="number" min="0" step="0.01" value={item.price} onChange={(event) => updateItem(item.id, "price", event.target.value)} aria-label={`सामान ${index + 1} की रकम`} className={`${inputClass} pl-7 text-right font-semibold tabular-nums`} /></div></td>
                    <td className="px-4 py-3 text-center"><button type="button" onClick={() => setItems((current) => current.filter((row) => row.id !== item.id))} className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus:outline-none focus:ring-4 focus:ring-red-100" aria-label={`${item.name || "सामान"} हटाएँ`}>×</button></td>
                  </tr>
                ))}
                {items.length === 0 && <tr><td colSpan={6} className="px-6 py-14 text-center"><div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-2xl">🧾</div><p className="font-semibold text-slate-700">अभी कोई सामान नहीं है</p><p className="mt-1 text-sm text-slate-500">ऊपर बिल पेस्ट करें या “सामान जोड़ें” दबाएँ।</p></td></tr>}
              </tbody>
            </table>
          </div>

          <div className="border-t border-slate-100 bg-slate-50/70 p-4 sm:p-6">
            <div className="flex flex-col gap-2 rounded-2xl border border-emerald-100 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-500">बिल की कुल रकम</p>
                <p className="mt-1 text-xs text-slate-400">सभी सामान की रकम का जोड़</p>
              </div>
              <p className="text-3xl font-bold tracking-tight text-emerald-700 sm:text-4xl">₹{total.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={copyBill} className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700">बिल कॉपी करें</button>
              <button type="button" onClick={shareWhatsApp} className="rounded-xl bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700">WhatsApp पर भेजें</button>
              <button type="button" onClick={clearBill} className="rounded-xl border border-red-100 bg-white px-4 py-3 font-semibold text-red-600 transition hover:bg-red-50">पूरा बिल साफ़ करें</button>
            </div>
            <p className="mt-4 text-center text-xs text-slate-400">आपके बदलाव इसी ब्राउज़र में सेव होते हैं।</p>
          </div>
        </section>
      </div>
    </main>
  );
}
