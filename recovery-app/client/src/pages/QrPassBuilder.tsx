import { useMemo, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

type OutputKey = "pinGate" | "appointmentPass" | "editContact" | "campaignReference" | "smsQrUrl";

const outputs: Array<{ key: OutputKey; number: string; title: string; placement: string }> = [
  { key: "pinGate", number: "01", title: "Numeric PIN Gate", placement: "First Custom JS/HTML element" },
  { key: "appointmentPass", number: "02", title: "Appointment Pass Card", placement: "Below the PIN Gate" },
  { key: "editContact", number: "03", title: "Edit This Contact", placement: "Below the Appointment Pass Card" },
  { key: "campaignReference", number: "04", title: "Campaign Reference", placement: "Below Edit This Contact" },
  { key: "smsQrUrl", number: "05", title: "Appointment SMS QR URL", placement: "SMS workflow QR image URL" },
];

const normal = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export default function QrPassBuilder() {
  const [, navigate] = useLocation();
  const access = useMemo(() => new URLSearchParams(window.location.search).get("access")?.trim() ?? "", []);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [copied, setCopied] = useState<OutputKey | null>(null);

  const dealershipsQuery = trpc.qrPass.dealerships.useQuery({ access }, { enabled: Boolean(access), retry: false });
  const dealerships = dealershipsQuery.data ?? [];
  const matchingDealer = useMemo(() => {
    const typed = normal(search);
    return dealerships.find(dealer => normal(dealer.name) === typed) ?? dealerships.find(dealer => dealer.id === selectedId) ?? null;
  }, [dealerships, search, selectedId]);
  const packageQuery = trpc.qrPass.generate.useQuery(
    { access, dealershipId: selectedId },
    { enabled: Boolean(access && selectedId), retry: false }
  );

  const selectDealer = (value: string) => {
    setSearch(value);
    const dealer = dealerships.find(item => normal(item.name) === normal(value));
    setSelectedId(dealer?.id ?? "");
    setCopied(null);
  };

  const generate = () => {
    if (!matchingDealer) return;
    setSelectedId(matchingDealer.id);
    setCopied(null);
  };

  const copy = async (key: OutputKey, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(key);
    window.setTimeout(() => setCopied(current => (current === key ? null : current)), 1800);
  };

  if (!access) {
    return (
      <main className="min-h-screen bg-slate-950 px-6 py-16 text-slate-100">
        <section className="mx-auto max-w-xl rounded-3xl border border-slate-700 bg-slate-900 p-10 shadow-2xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-red-400">ADO internal tool</p>
          <h1 className="mt-3 text-3xl font-bold">QR Pass Page Builder</h1>
          <p className="mt-4 leading-7 text-slate-300">Open this page from the authorized ADO GoHighLevel custom-menu link.</p>
          <Link href="/" className="mt-8 inline-block text-sm font-semibold text-red-300 underline underline-offset-4">Return to relay status</Link>
        </section>
      </main>
    );
  }

  const generated = packageQuery.data;
  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b-4 border-[#ed2726] bg-[#14243d] text-white">
        <div className="mx-auto max-w-7xl px-5 py-4 sm:px-8">
          <img
            src="/manus-storage/ado-logo-hires_78935c88.png"
            alt="Auto Dealers Only"
            className="mx-auto h-10 w-auto object-contain sm:h-12"
          />
          <div className="mt-3 flex items-end justify-between gap-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-200">Internal page tools</p>
              <h1 className="text-xl font-bold sm:text-2xl">QR Pass Page Builder</h1>
            </div>
            <button onClick={() => navigate("/")} className="shrink-0 text-sm font-semibold text-slate-200 underline-offset-4 hover:underline">Relay status</button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-7xl px-5 py-8 sm:px-8">
        <div className="grid gap-7 xl:grid-cols-[370px_minmax(0,1fr)]">
          <aside className="h-fit rounded-2xl border border-slate-200 bg-white p-6 shadow-sm xl:sticky xl:top-6">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ed2726]">Step 1</p>
            <h2 className="mt-2 text-xl font-bold">Choose a dealership</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Choose from the list or type the dealership name. The builder uses only the selected dealership’s saved values.</p>
            <label className="mt-6 block text-sm font-bold text-slate-700" htmlFor="dealer-search">Dealership</label>
            <input
              id="dealer-search"
              list="dealer-options"
              value={search}
              onChange={event => selectDealer(event.target.value)}
              placeholder={dealershipsQuery.isLoading ? "Loading dealerships…" : "Search or select a dealership"}
              className="mt-2 w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm outline-none ring-[#ed2726] transition focus:ring-2"
              autoComplete="off"
            />
            <datalist id="dealer-options">
              {dealerships.map(dealer => <option key={dealer.id} value={dealer.name}>{[dealer.city, dealer.state].filter(Boolean).join(", ")}</option>)}
            </datalist>
            {dealershipsQuery.error && <p className="mt-3 text-sm font-medium text-red-700">The dealership list could not be loaded. Open the menu link again or contact ADO operations.</p>}
            {search && !matchingDealer && !dealershipsQuery.isLoading && <p className="mt-3 text-sm text-amber-700">Select a matching dealership name from the suggested list.</p>}
            {matchingDealer && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-bold">{matchingDealer.name}</p><p className="mt-1 text-sm text-slate-600">{[matchingDealer.city, matchingDealer.state].filter(Boolean).join(", ") || "ADO Dealership record"}</p>{!matchingDealer.ready && <p className="mt-3 text-sm font-semibold text-red-700">This dealership is missing an API key, location ID, or QR Pass Page URL in ADO.</p>}</div>}
            <button onClick={generate} disabled={!matchingDealer?.ready || packageQuery.isFetching} className="mt-5 w-full rounded-xl bg-[#ed2726] px-4 py-3 text-sm font-bold text-white shadow-sm transition hover:bg-[#cc1b1d] disabled:cursor-not-allowed disabled:bg-slate-300">{packageQuery.isFetching ? "Generating codes…" : "Generate codes"}</button>
            <div className="mt-6 border-t border-slate-200 pt-5 text-xs leading-5 text-slate-500"><strong className="text-slate-700">Private output:</strong> dealership credentials appear only inside Blocks 3 and 4 after you generate and copy them. They are not stored by this page.</div>
          </aside>

          <section>
            <div className="rounded-2xl bg-[#14243d] px-6 py-6 text-white shadow-sm">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-red-200">Step 2</p>
              <h2 className="mt-2 text-2xl font-bold">Copy the five outputs into GoHighLevel</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">Use the modules in numerical order on the QR Pass Page. Paste Output 5 into the appointment-SMS workflow’s QR image URL field.</p>
            </div>

            {packageQuery.error && <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-800">{packageQuery.error.message}</div>}
            {!generated && !packageQuery.isFetching && <div className="mt-6 grid min-h-96 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-xl text-[#ed2726]">1</div><h3 className="mt-4 text-lg font-bold">Select a dealership to generate its modules</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">The completed set will appear here as five separate copy-ready boxes.</p></div></div>}
            {generated && <div className="mt-6 space-y-5">{outputs.map(item => {
              const value = generated[item.key];
              return <article key={item.key} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col justify-between gap-3 border-b border-slate-200 bg-slate-50 px-5 py-4 sm:flex-row sm:items-center"><div className="flex gap-3"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#ed2726] text-xs font-black text-white">{item.number}</span><div><h3 className="font-bold">{item.title}</h3><p className="text-xs text-slate-600">{item.placement}</p></div></div><button onClick={() => copy(item.key, value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#14243d] transition hover:border-[#ed2726] hover:text-[#ed2726]">{copied === item.key ? "Copied" : "Copy code"}</button></div><textarea value={value} readOnly spellCheck={false} aria-label={`${item.title} code`} className="min-h-56 w-full resize-y border-0 bg-slate-950 p-5 font-mono text-xs leading-5 text-slate-100 outline-none" /></article>;
            })}</div>}
          </section>
        </div>
      </section>
    </main>
  );
}
