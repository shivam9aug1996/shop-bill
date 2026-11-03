"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

type BillItem = { id?: string; name: string; quantity: string | number; unit: string; price: string | number };
type Bill = { id: string; billNumber?: string; createdAt: string; total: number; customerName?: string; customerPhone?: string; source?: string; items: BillItem[] };

const field = "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm outline-none focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10";
const money = (n: number) => "₹" + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function HistoryPage() {
  const [pin, setPin] = useState("");
  const [connected, setConnected] = useState(false);
  const [bills, setBills] = useState<Bill[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const loadBills = useCallback(async (q = query) => {
    setLoading(true);
    try {
      const response = await fetch("/api/bills" + (q.trim() ? "?q=" + encodeURIComponent(q.trim()) : ""), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "बिल लोड नहीं हुए।");
      setBills(data.bills || []);
      setConnected(true);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "बिल लोड नहीं हुए।");
    } finally { setLoading(false); }
  }, [query]);

  useEffect(() => {
    fetch("/api/auth/status", { cache: "no-store" }).then(r => r.json()).then(data => {
      if (data.connected) { setConnected(true); }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (connected) loadBills("");
  }, [connected, loadBills]);

  async function connect(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const response = await fetch("/api/auth/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "PIN से connect नहीं हुआ।");
      setConnected(true); setPin(""); setMessage("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Connect नहीं हुआ।"); }
    finally { setLoading(false); }
  }

  async function disconnect() {
    await fetch("/api/auth/disconnect", { method: "POST" });
    setConnected(false); setBills([]); setMessage("आप disconnect हो गए हैं।");
  }

  async function removeBill(id: string) {
    if (!window.confirm("क्या आप यह बिल delete करना चाहते हैं?")) return;
    try {
      const response = await fetch("/api/bills/" + id, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "बिल delete नहीं हुआ।");
      setBills(old => old.filter(b => b.id !== id));
      setMessage("बिल delete हो गया।");
    } catch (error) { setMessage(error instanceof Error ? error.message : "बिल delete नहीं हुआ।"); }
  }

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-3 py-5 text-stone-900 sm:px-6 sm:py-9">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70 sm:p-7">
          <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-800">Ramnath Pansari</p><h1 className="mt-1 text-2xl font-bold sm:text-3xl">पुराने बिल</h1><p className="mt-1 text-sm text-stone-500">Pankaj Garg · 9634396572</p></div>
          <Link href="/" className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold hover:bg-stone-50">← नया बिल बनाएं</Link>
        </header>

        {message && <div role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}

        {!connected ? (
          <section className="mx-auto max-w-md rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70 sm:p-7">
            <h2 className="text-lg font-bold">बिल हिस्ट्री खोलें</h2>
            <p className="mt-1 text-sm text-stone-500">सुरक्षा के लिए अपना Bill PIN डालकर connect करें।</p>
            <form onSubmit={connect} className="mt-5 space-y-3">
              <label className="block space-y-1.5 text-sm font-medium">Bill PIN<input className={field} type="password" value={pin} onChange={e => setPin(e.target.value)} placeholder="अपना PIN डालें" required /></label>
              <button disabled={loading || !pin} className="w-full rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{loading ? "Connect हो रहा है…" : "Connect करें"}</button>
            </form>
          </section>
        ) : (
          <>
            <section className="flex flex-col gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70 sm:flex-row sm:items-center sm:p-5">
              <input className={field} value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === "Enter") loadBills(query); }} placeholder="सामान या Bill ID से खोजें…" />
              <button onClick={() => loadBills(query)} disabled={loading} className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50">{loading ? "लोड हो रहा है…" : "खोजें"}</button>
              <button onClick={() => { setQuery(""); loadBills(""); }} className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold">Reset</button>
              <button onClick={disconnect} className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold text-stone-600">Disconnect</button>
            </section>
            <div className="flex items-center justify-between px-1"><p className="text-sm text-stone-500">कुल {bills.length} बिल दिख रहे हैं (अधिकतम 200)</p><button onClick={() => loadBills(query)} className="text-sm font-semibold text-emerald-800">↻ Refresh</button></div>
            {!bills.length && !loading ? (
              <section className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-14 text-center"><div className="text-3xl">🧾</div><p className="mt-3 font-semibold">कोई बिल नहीं मिला</p><p className="mt-1 text-sm text-stone-500">नया बिल सेव करने के बाद यहाँ दिखाई देगा।</p></section>
            ) : (
              <section className="space-y-3">
                {bills.map(bill => (
                  <article key={bill.id} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200/70 sm:p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div><p className="font-bold">{bill.billNumber || "Bill"}</p><p className="mt-1 text-xs text-stone-500">{bill.createdAt ? new Date(bill.createdAt).toLocaleString("en-IN") : "—"}</p><p className="mt-1 text-sm text-stone-700">{bill.customerName || "Walk-in Customer"}{bill.customerPhone ? " · " + bill.customerPhone : ""}</p></div>
                      <p className="text-xl font-bold text-emerald-800">{money(bill.total)}</p>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">{(bill.items || []).slice(0, 4).map((item, i) => <span key={item.id || i} className="rounded-lg bg-stone-100 px-2.5 py-1.5">{item.name} · {item.quantity} {item.unit}</span>)}{bill.items?.length > 4 && <span className="px-2 py-1.5">+{bill.items.length - 4} और</span>}</div>
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-stone-100 pt-3">
                      <Link href={"/?edit=" + bill.id} className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-semibold hover:bg-stone-50">बिल खोलें / Edit</Link>
                      <button onClick={() => removeBill(bill.id)} className="rounded-lg border border-red-100 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">Delete</button>
                    </div>
                  </article>
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
