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
  const [checkingRedis, setCheckingRedis] = useState(false);
  const [history, setHistory] = useState<Array<{ id: string; billNumber: string; createdAt: string; total: number; items: BillItem[] }>>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyQuery, setHistoryQuery] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [editingBillId, setEditingBillId] = useState<string | null>(null);
  const [savingBill, setSavingBill] = useState(false);
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

  // Restore the connection indicator from the existing HTTP-only session cookie.
  // This checks authentication only; it does not read or import a pending bill.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : { connected: false }))
      .then((data: { connected?: boolean }) => {
        if (!cancelled) setConnected(data.connected === true);
      })
      .catch(() => {
        if (!cancelled) setConnected(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      const importedAt = data.bill.createdAt;
      if (
        lastImportedBill.current === importedAt ||
        localStorage.getItem("shop-bill-last-imported-at") === importedAt
      ) {
        lastImportedBill.current = importedAt;
        return;
      }

      const importedItems: BillItem[] = data.bill.items.map((item) => ({
        id: crypto.randomUUID(),
        name: item.name,
        quantity: String(item.quantity),
        unit: normalizeUnit(item.unit),
        price: String(item.price),
      }));
      const savedResponse = await fetch("/api/bills", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items: importedItems, source: "ChatGPT", sourceCreatedAt: importedAt }) });
      setItems(importedItems);
      if (savedResponse.ok) {
        lastImportedBill.current = importedAt;
        localStorage.setItem("shop-bill-last-imported-at", importedAt);
        setMessageType("success");
        setMessage(`Redis से ${importedItems.length} सामान वाला बिल इम्पोर्ट और history में सेव हो गया।`);
      } else {
        const saveError = await savedResponse.json();
        setMessageType("error");
        setMessage(saveError.error || "Bill import हुआ, लेकिन history में save नहीं हो पाया। दोबारा चेक करें।");
      }
    } catch {
      // Keep the bill editor usable if the network is temporarily unavailable.
    }
  }, []);

  async function checkRedisNow() {
    setCheckingRedis(true);
    try {
      await pollPendingBill();
    } finally {
      setCheckingRedis(false);
    }
  }

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
      setMessage("Website connect हो गई। Bill import करने के लिए “अभी चेक करें” दबाएँ।");
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

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (historyFrom) params.set("from", historyFrom);
      if (historyTo) params.set("to", historyTo);
      if (historyQuery.trim()) params.set("q", historyQuery.trim());
      const response = await fetch(`/api/bills?${params.toString()}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "History load नहीं हुई।");
      setHistory(data.bills || []);
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "History load नहीं हुई।");
    } finally {
      setHistoryLoading(false);
    }
  }

  async function saveCurrentBill() {
    const validItems = items.filter((item) => item.name.trim());
    if (!validItems.length) {
      setMessageType("error");
      setMessage("सेव करने से पहले बिल में सामान जोड़ें।");
      return;
    }
    setSavingBill(true);
    try {
      const response = await fetch(editingBillId ? `/api/bills/${editingBillId}` : "/api/bills", {
        method: editingBillId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: validItems, source: "Website" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "बिल सेव नहीं हुआ।");
      setEditingBillId(null);
      setMessageType("success");
      setMessage(editingBillId ? "पुराना बिल अपडेट हो गया।" : "बिल MongoDB में सेव हो गया।");
      if (showHistory) await loadHistory();
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "बिल सेव नहीं हुआ।");
    } finally {
      setSavingBill(false);
    }
  }

  async function openHistoryBill(id: string) {
    try {
      const response = await fetch(`/api/bills/${id}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "बिल नहीं खुला।");
      setItems(data.items);
      setEditingBillId(id);
      setMessageType("success");
      setMessage(`Bill ${data.billNumber} edit करने के लिए खुल गया।`);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      setMessageType("error");
      setMessage(error instanceof Error ? error.message : "बिल नहीं खुला।");
    }
  }

  async function deleteHistoryBill(id: string) {
    if (!confirm("क्या आप यह पुराना बिल हमेशा के लिए delete करना चाहते हैं?")) return;
    const response = await fetch(`/api/bills/${id}`, { method: "DELETE" });
    if (response.ok) {
      setMessageType("success");
      setMessage("पुराना बिल delete हो गया।");
      await loadHistory();
    } else {
      const data = await response.json();
      setMessageType("error");
      setMessage(data.error || "बिल delete नहीं हुआ।");
    }
  }

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
    return `🧾 दुकान का बिल\n\n${lines.join("\n")}\n\nकुल बिल: ₹${total.toLocaleString("en-IN")}`;
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
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => { setShowHistory((value) => !value); if (!showHistory) void loadHistory(); }} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50">📚 Bill History</button>
            <div className="rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
              <p className="text-xs font-medium text-slate-500">कुल सामान</p>
              <p className="mt-1 text-2xl font-bold">{items.length} <span className="text-sm font-medium text-slate-500">आइटम</span></p>
            </div>
          </div>
        </header>

        <section className="rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-bold">Redis से बिल इम्पोर्ट</h2>
              <p className="mt-1 text-sm text-slate-500">
                {connected ? "Connected — नए bill import करने के लिए “अभी चेक करें” दबाएँ।" : "PIN डालकर connect करें। उसके बाद bill manually check कर सकते हैं।"}
              </p>
            </div>
            {connected ? (
              <div className="flex flex-col gap-2 sm:flex-row">
                <button type="button" onClick={checkRedisNow} disabled={checkingRedis} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60">
                  {checkingRedis ? "Checking Redis…" : "अभी चेक करें"}
                </button>
                <button type="button" onClick={disconnectAutoImport} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                  Disconnect
                </button>
              </div>
            ) : (
              <form onSubmit={connectAutoImport} className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <input
                  type="password"
                  value={pin}
                  onChange={(event) => setPin(event.target.value)}
                  placeholder="Connection PIN"
                  aria-label="Redis connection PIN"
                  autoComplete="current-password"
                  required
                  className={`${inputClass} sm:w-52`}
                />
                <button type="submit" disabled={connecting} className="rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60">
                  {connecting ? "Connecting…" : "Redis से कनेक्ट करें"}
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
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <button type="button" onClick={saveCurrentBill} disabled={savingBill} className="flex-1 rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-60">{savingBill ? "सेव हो रहा है…" : editingBillId ? "बदलाव सेव करें" : "बिल सेव करें"}</button>
              {editingBillId && <button type="button" onClick={() => setEditingBillId(null)} className="rounded-xl border border-slate-200 px-4 py-3 font-semibold text-slate-700">Edit रद्द करें</button>}
            </div>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <button type="button" onClick={copyBill} className="rounded-xl bg-slate-900 px-4 py-3 font-semibold text-white transition hover:bg-slate-700">बिल कॉपी करें</button>
              <button type="button" onClick={shareWhatsApp} className="rounded-xl bg-green-600 px-4 py-3 font-semibold text-white transition hover:bg-green-700">WhatsApp पर भेजें</button>
              <button type="button" onClick={clearBill} className="rounded-xl border border-red-100 bg-white px-4 py-3 font-semibold text-red-600 transition hover:bg-red-50">पूरा बिल साफ़ करें</button>
            </div>
            <p className="mt-4 text-center text-xs text-slate-400">आपके बदलाव इसी ब्राउज़र में सेव होते हैं।</p>
          </div>
        </section>

        {showHistory && (
          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div><h2 className="text-xl font-bold">📚 Bill History</h2><p className="mt-1 text-sm text-slate-500">MongoDB में सेव सभी पुराने बिल (एक बार में अधिकतम 200)।</p></div>
              <button type="button" onClick={loadHistory} disabled={historyLoading} className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white">{historyLoading ? "लोड हो रहा है…" : "Refresh"}</button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input aria-label="From date" type="date" value={historyFrom} onChange={(e) => setHistoryFrom(e.target.value)} className={inputClass}/>
              <input aria-label="To date" type="date" value={historyTo} onChange={(e) => setHistoryTo(e.target.value)} className={inputClass}/>
              <input aria-label="Search bills" value={historyQuery} onChange={(e) => setHistoryQuery(e.target.value)} placeholder="Bill number या सामान खोजें" className={inputClass}/>
              <button type="button" onClick={loadHistory} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white">Search</button>
            </div>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[620px] text-left text-sm">
                <thead><tr className="border-b bg-slate-50 text-slate-500"><th className="p-3">Bill No.</th><th className="p-3">Date & Time</th><th className="p-3 text-center">Items</th><th className="p-3 text-right">Total</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {history.map((bill) => (
                    <tr key={bill.id}>
                      <td className="p-3 font-semibold">{bill.billNumber}</td>
                      <td className="p-3">{new Date(bill.createdAt).toLocaleString("en-IN")}</td>
                      <td className="p-3 text-center">{bill.items?.length || 0}</td>
                      <td className="p-3 text-right font-bold">₹{Number(bill.total).toLocaleString("en-IN")}</td>
                      <td className="p-3"><div className="flex justify-end gap-2"><button type="button" onClick={() => openHistoryBill(bill.id)} className="rounded-lg border px-3 py-1.5 font-medium hover:bg-slate-50">Open / Edit</button><button type="button" onClick={() => deleteHistoryBill(bill.id)} className="rounded-lg border border-red-100 px-3 py-1.5 font-medium text-red-600 hover:bg-red-50">Delete</button></div></td>
                    </tr>
                  ))}
                  {!history.length && <tr><td colSpan={5} className="p-8 text-center text-slate-500">{historyLoading ? "लोड हो रहा है…" : "इस filter में कोई पुराना बिल नहीं मिला।"}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
