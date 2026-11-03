"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { billGrandTotal, normalizeUnit, STORAGE_KEY, UNITS, type BillItem } from "@/lib/bill";

const input = "w-full rounded-xl border border-stone-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-600/10";
const money = (n: number) => "₹" + n.toLocaleString("en-IN", { maximumFractionDigits: 2 });

export default function Home() {
  const [items, setItems] = useState<BillItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [billId, setBillId] = useState<string | null>(null);
  const [billNumber, setBillNumber] = useState("");
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setItems((JSON.parse(raw) as BillItem[]).map((x) => ({ ...x, unit: normalizeUnit(x.unit) })));
      const params = new URLSearchParams(window.location.search);
      const id = params.get("edit");
      if (id) {
        fetch("/api/bills/" + id, { cache: "no-store" }).then(async (r) => {
          const data = await r.json();
          if (!r.ok) throw new Error(data.error || "Bill load nahi hua");
          setItems(data.items || []);
          setCustomerName(data.customerName || "");
          setCustomerPhone(data.customerPhone || "");
          setBillId(id);
          setBillNumber(data.billNumber || "");
          setSaved(true);
        }).catch((e) => setMessage(e.message));
      }
    } catch { /* ignore invalid local draft */ }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded && !billId) localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items, loaded, billId]);

  const total = useMemo(() => billGrandTotal(items), [items]);
  const validItems = items.filter((x) => x.name.trim());

  function update(id: string, field: keyof BillItem, value: string) {
    setItems((old) => old.map((x) => x.id === id ? { ...x, [field]: value } : x));
    setSaved(false);
  }
  function addItem() {
    setItems((old) => [...old, { id: crypto.randomUUID(), name: "", quantity: "1", unit: "kg", price: "0" }]);
    setSaved(false);
  }
  function removeItem(id: string) { setItems((old) => old.filter((x) => x.id !== id)); setSaved(false); }

  function receiptText() {
    const rows = validItems.map((x, i) => `${i + 1}. ${x.name} — ${x.quantity} ${x.unit} — ${money(Number(x.price) || 0)}`);
    return [
      "RAMNATH PANSARI", "Pankaj Garg | 9634396572", "--------------------------------",
      billNumber ? "Bill: " + billNumber : "Bill: " + new Date().toLocaleDateString("en-IN"),
      customerName ? "Customer: " + customerName : "",
      customerPhone ? "Phone: " + customerPhone : "",
      "--------------------------------", ...rows, "--------------------------------",
      "TOTAL: " + money(total), "धन्यवाद! फिर आइए।"
    ].filter(Boolean).join("\n");
  }

  async function saveBill() {
    if (!validItems.length) { setMessage("पहले बिल में सामान जोड़ें।"); return; }
    setBusy(true);
    try {
      const response = await fetch(billId ? "/api/bills/" + billId : "/api/bills", {
        method: billId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: validItems, customerName, customerPhone, source: "Website" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "बिल सेव नहीं हुआ");
      if (!billId && data.id) setBillId(data.id);
      if (data.billNumber) setBillNumber(data.billNumber);
      setSaved(true);
      setMessage("बिल सुरक्षित हो गया।");
    } catch (e) { setMessage(e instanceof Error ? e.message : "बिल सेव नहीं हुआ।"); }
    finally { setBusy(false); }
  }

  function shareWhatsApp() {
    window.open("https://wa.me/?text=" + encodeURIComponent(receiptText()), "_blank", "noopener,noreferrer");
  }

  function printBill() { window.print(); }

  async function generateImage() {
    if (!validItems.length) { setMessage("पहले सामान जोड़ें।"); return; }
    const lines = receiptText().split("\n");
    const canvas = document.createElement("canvas");
    const width = 900, lineHeight = 42, padding = 54;
    canvas.width = width;
    canvas.height = padding * 2 + lines.length * lineHeight + 30;
    const ctx = canvas.getContext("2d");
    if (!ctx) { setMessage("Image generate नहीं हो पाई।"); return; }
    ctx.fillStyle = "#fffdf7"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#14532d"; ctx.font = "bold 36px Arial"; ctx.textAlign = "center";
    ctx.fillText("RAMNATH PANSARI", width / 2, padding + 18);
    ctx.fillStyle = "#57534e"; ctx.font = "20px Arial";
    ctx.fillText("Pankaj Garg  •  9634396572", width / 2, padding + 52);
    ctx.textAlign = "left";
    lines.forEach((line, i) => {
      ctx.fillStyle = line.startsWith("TOTAL:") ? "#166534" : "#292524";
      ctx.font = line.startsWith("TOTAL:") ? "bold 30px Arial" : "22px Arial";
      ctx.fillText(line, padding, padding + 112 + i * lineHeight, width - padding * 2);
    });
    const a = document.createElement("a");
    a.download = (billNumber || "ramnath-pansari-bill") + ".png";
    a.href = canvas.toDataURL("image/png");
    a.click();
    setMessage("बिल की image तैयार है।");
  }

  if (!loaded) return <main className="min-h-screen grid place-items-center bg-stone-50 text-stone-500">बिल लोड हो रहा है…</main>;

  return (
    <main className="min-h-screen bg-[#f7f8f5] px-3 py-5 text-stone-900 sm:px-6 sm:py-9">
      <div className="mx-auto max-w-5xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70 sm:p-7">
          <div className="flex items-center gap-4">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-emerald-800 text-2xl text-white">🌿</div>
            <div><p className="text-xs font-semibold uppercase tracking-[.18em] text-emerald-800">Shop billing</p><h1 className="text-2xl font-bold sm:text-3xl">Ramnath Pansari</h1><p className="mt-1 text-sm text-stone-500">Pankaj Garg · 9634396572</p></div>
          </div>
          <Link href="/history" className="rounded-xl border border-stone-200 px-4 py-3 text-sm font-semibold hover:bg-stone-50">📚 पुराने बिल</Link>
        </header>

        {message && <div role="status" className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>}

        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-stone-200/70 sm:p-7">
          <div className="mb-5"><h2 className="text-lg font-bold">ग्राहक की जानकारी</h2><p className="mt-1 text-sm text-stone-500">ग्राहक का नाम लिखें ताकि बिल पर दिखाई दे।</p></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-sm font-medium text-stone-700">Customer name <input className={input} value={customerName} onChange={(e) => { setCustomerName(e.target.value); setSaved(false); }} placeholder="ग्राहक का नाम (optional)" /></label>
            <label className="space-y-1.5 text-sm font-medium text-stone-700">Mobile number <input className={input} value={customerPhone} onChange={(e) => { setCustomerPhone(e.target.value); setSaved(false); }} placeholder="मोबाइल नंबर (optional)" inputMode="numeric" /></label>
          </div>
        </section>

        <section className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200/70">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5 sm:p-7">
            <div><h2 className="text-xl font-bold">बिल के सामान</h2><p className="mt-1 text-sm text-stone-500">मात्रा और सामान की कुल रकम भरें।</p></div>
            <button onClick={addItem} className="rounded-xl bg-emerald-800 px-4 py-3 text-sm font-semibold text-white hover:bg-emerald-900">＋ सामान जोड़ें</button>
          </div>
          <div className="space-y-3 p-4 sm:p-6">
            {items.map((item, index) => <div key={item.id} className="grid gap-2 rounded-xl border border-stone-100 bg-stone-50/70 p-3 sm:grid-cols-[minmax(0,2fr)_110px_125px_145px_40px] sm:items-end sm:bg-white sm:p-2">
              <label className="text-xs font-medium text-stone-500">सामान का नाम<input className={input} value={item.name} onChange={(e) => update(item.id, "name", e.target.value)} placeholder="जैसे आटा" /></label>
              <label className="text-xs font-medium text-stone-500">मात्रा<input className={input} type="number" min="0" step="any" value={item.quantity} onChange={(e) => update(item.id, "quantity", e.target.value)} /></label>
              <label className="text-xs font-medium text-stone-500">Unit<select className={input} value={item.unit} onChange={(e) => update(item.id, "unit", e.target.value)}>{UNITS.map((u) => <option key={u}>{u}</option>)}</select></label>
              <label className="text-xs font-medium text-stone-500">रकम (₹)<input className={input + " text-right font-semibold"} type="number" min="0" step="0.01" value={item.price} onChange={(e) => update(item.id, "price", e.target.value)} /></label>
              <button onClick={() => removeItem(item.id)} aria-label={"Remove item " + (index + 1)} className="h-10 rounded-lg text-xl text-stone-400 hover:bg-red-50 hover:text-red-600">×</button>
            </div>)}
            {!items.length && <div className="rounded-xl border border-dashed border-stone-300 px-5 py-12 text-center"><div className="text-3xl">🧾</div><p className="mt-3 font-semibold">आपका बिल अभी खाली है</p><p className="mt-1 text-sm text-stone-500">शुरू करने के लिए “सामान जोड़ें” पर क्लिक करें।</p></div>}
          </div>
          <div className="border-t border-stone-100 bg-stone-50/80 p-5 sm:p-7">
            <div className="flex items-center justify-between gap-4"><div><p className="text-sm font-medium text-stone-500">कुल बिल रकम</p><p className="mt-1 text-xs text-stone-400">{validItems.length} सामान</p></div><p className="text-3xl font-bold tracking-tight text-emerald-800">{money(total)}</p></div>
            <div className="mt-5 flex flex-wrap gap-2">
              <button onClick={saveBill} disabled={busy || !validItems.length} className="rounded-xl bg-emerald-800 px-5 py-3 text-sm font-semibold text-white hover:bg-emerald-900 disabled:opacity-50">{busy ? "सेव हो रहा है…" : saved ? "✓ बिल सेव है" : billId ? "बदलाव सेव करें" : "बिल सेव करें"}</button>
              <button onClick={generateImage} className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-stone-50">Image बनाएं</button>
              <button onClick={printBill} className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-stone-50">PDF सेव करें</button>
              <button onClick={printBill} className="rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm font-semibold hover:bg-stone-50">Print</button>
              <button onClick={shareWhatsApp} className="rounded-xl bg-[#16834b] px-4 py-3 text-sm font-semibold text-white hover:bg-[#116b3d]">WhatsApp पर भेजें</button>
            </div>
            <p className="mt-3 text-xs text-stone-400">PDF सेव करें या Print चुनने पर आपके ब्राउज़र का print dialog खुलेगा। PDF के लिए “Save as PDF” चुनें।</p>
          </div>
        </section>

        <section id="print-receipt" className="hidden print:block">
          <div className="mx-auto max-w-2xl border border-stone-300 p-8 text-black">
            <div className="text-center"><h1 className="text-2xl font-bold">Ramnath Pansari</h1><p>Pankaj Garg · 9634396572</p></div>
            <div className="my-5 border-y border-dashed border-stone-400 py-3 text-sm"><p>Bill: {billNumber || new Date().toLocaleDateString("en-IN")}</p><p>Customer: {customerName || "Walk-in Customer"}</p>{customerPhone && <p>Mobile: {customerPhone}</p>}</div>
            <table className="w-full text-sm"><thead><tr><th className="py-2 text-left">Item</th><th className="text-right">Qty</th><th className="text-right">Amount</th></tr></thead><tbody>{validItems.map((x) => <tr key={x.id} className="border-t border-stone-200"><td className="py-2">{x.name}</td><td className="text-right">{x.quantity} {x.unit}</td><td className="text-right">{money(Number(x.price) || 0)}</td></tr>)}</tbody></table>
            <div className="mt-5 border-t border-stone-400 pt-4 text-right text-xl font-bold">Total: {money(total)}</div><p className="mt-8 text-center text-sm">धन्यवाद! फिर आइए।</p>
          </div>
        </section>
        <footer className="pb-4 text-center text-xs text-stone-400">Ramnath Pansari · आपका भरोसेमंद किराना स्टोर</footer>
      </div>
      <style jsx global>{`@media print { body { background: white !important; } body * { visibility: hidden !important; } #print-receipt, #print-receipt * { visibility: visible !important; } #print-receipt { display: block !important; position: absolute; inset: 0; width: 100%; } }`}</style>
    </main>
  );
}
