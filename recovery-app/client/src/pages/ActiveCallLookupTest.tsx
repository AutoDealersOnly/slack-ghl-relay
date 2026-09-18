import { trpc } from "@/lib/trpc";
import { useState } from "react";

type ContactSummary = { id: string; firstName: string; lastName: string; email: string; phone: string };
type Contact = ContactSummary & { address1: string; city: string; state: string; postalCode: string; customFields: Record<string, string> };
type ContactForm = Omit<Contact, "id">;

const emptyForm = (): ContactForm => ({ firstName: "", lastName: "", email: "", phone: "", address1: "", city: "", state: "", postalCode: "", customFields: {} });
const contactToForm = (contact: Contact): ContactForm => ({ firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone, address1: contact.address1, city: contact.city, state: contact.state, postalCode: contact.postalCode, customFields: { ...contact.customFields } });
const contactName = (contact: Pick<ContactSummary, "firstName" | "lastName">) => [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed customer";

function getProtectedAccessValue() {
  return new URLSearchParams(window.location.search).get("access")?.trim() ?? "";
}

function ContactMatches({ contacts, onSelect, loading }: { contacts: ContactSummary[]; onSelect: (contactId: string) => void; loading: boolean }) {
  if (!contacts.length) return null;
  return (
    <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-bold text-amber-950">Choose the matching existing customer</p>
      <p className="mt-1 text-sm leading-6 text-amber-900">This test flow will only load an existing contact. It cannot create a new one.</p>
      <div className="mt-3 divide-y divide-amber-200 overflow-hidden rounded-lg border border-amber-200 bg-white">
        {contacts.map(contact => (
          <div key={contact.id} className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center">
            <div><p className="font-bold text-slate-950">{contactName(contact)}</p><p className="mt-0.5 text-sm text-slate-600">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "No phone or email"}</p></div>
            <button type="button" disabled={loading} onClick={() => onSelect(contact.id)} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#14243d] hover:border-amber-500 disabled:opacity-50">Select customer</button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function ActiveCallLookupTest() {
  const access = getProtectedAccessValue();
  const [dealershipRecordId, setDealershipRecordId] = useState("");
  const [selectedCallId, setSelectedCallId] = useState("");
  const [matches, setMatches] = useState<ContactSummary[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [pin, setPin] = useState("");
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const activeCalls = trpc.activeCallLookupTest.current.useQuery({ access }, { enabled: Boolean(access), refetchInterval: 5000, refetchOnWindowFocus: true });
  const dealerships = trpc.activeCallLookupTest.dealerships.useQuery({ access }, { enabled: Boolean(access) });
  const feedStatus = trpc.activeCallLookupTest.feedStatus.useQuery({ access }, { enabled: Boolean(access), refetchInterval: 5000, refetchOnWindowFocus: true });
  const startFeed = trpc.activeCallLookupTest.startOneHourTestFeed.useMutation({ onSuccess: () => void feedStatus.refetch() });
  const searchSelectedCaller = trpc.activeCallLookupTest.searchSelectedCaller.useMutation();
  const searchSelectedPin = trpc.activeCallLookupTest.searchSelectedPin.useMutation();
  const loadSelectedContact = trpc.activeCallLookupTest.loadSelectedContact.useMutation();
  const saveSelectedContact = trpc.activeCallLookupTest.saveSelectedContact.useMutation();
  const activeFeedExpiresAt = feedStatus.data?.active === true ? feedStatus.data.expiresAt : null;
  const feedIsActive = Boolean(activeFeedExpiresAt);
  const selectedCall = activeCalls.data?.find(call => call.id === selectedCallId) ?? null;
  const busy = searchSelectedCaller.isPending || searchSelectedPin.isPending || loadSelectedContact.isPending || saveSelectedContact.isPending;
  const toneStyles = { success: "border-emerald-200 bg-emerald-50 text-emerald-950", warning: "border-amber-200 bg-amber-50 text-amber-950", error: "border-red-200 bg-red-50 text-red-900" };
  const errorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;

  const resetSelection = () => {
    setSelectedCallId("");
    setMatches([]);
    setContact(null);
    setForm(emptyForm());
    setPin("");
    setNotice(null);
  };
  const showLoadedContact = (next: Contact, message: string) => {
    setContact(next);
    setForm(contactToForm(next));
    setMatches([]);
    setNotice({ tone: "success", message });
  };
  const loadContact = async (callId: string, contactId: string) => {
    try {
      showLoadedContact(await loadSelectedContact.mutateAsync({ access, callId, contactId }), "Existing customer loaded. Review the caller number before saving any change.");
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "The selected customer could not be loaded.") });
    }
  };
  const searchCallerPhone = async (callId: string) => {
    setSelectedCallId(callId);
    setMatches([]);
    setContact(null);
    setForm(emptyForm());
    setPin("");
    setNotice(null);
    try {
      const results = await searchSelectedCaller.mutateAsync({ access, callId });
      if (results.length === 1) {
        await loadContact(callId, results[0].id);
        return;
      }
      setMatches(results);
      setNotice({ tone: results.length ? "warning" : "warning", message: results.length ? "More than one existing customer uses this caller number. Select the correct customer below." : "No existing customer uses this caller number. Ask for the PIN code to continue the separate test lookup." });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "The caller number could not be searched.") });
    }
  };
  const searchByPin = async () => {
    if (!selectedCallId) return;
    if (!pin.trim()) {
      setNotice({ tone: "warning", message: "Ask the caller for their PIN code first." });
      return;
    }
    setMatches([]);
    try {
      const result = await searchSelectedPin.mutateAsync({ access, callId: selectedCallId, pin });
      if (result.kind === "contact") {
        showLoadedContact(result.contact, `Existing customer loaded: ${contactName(result.contact)}.`);
        return;
      }
      if (result.kind === "matches") {
        setMatches(result.contacts);
        setNotice({ tone: "warning", message: "More than one customer has that PIN. Select the correct existing customer below." });
        return;
      }
      setNotice({ tone: "warning", message: "That PIN did not return an existing customer. This separate test does not create new customers." });
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "The PIN lookup could not be completed.") });
    }
  };
  const savePhone = async () => {
    if (!selectedCallId || !contact) return;
    try {
      const saved = await saveSelectedContact.mutateAsync({ access, callId: selectedCallId, contactId: contact.id, form });
      showLoadedContact(saved, `Changes saved to the existing customer record for ${contactName(saved)}. No duplicate customer was created.`);
    } catch (error) {
      setNotice({ tone: "error", message: errorMessage(error, "The existing customer record could not be updated.") });
    }
  };

  if (!access) return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><section className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Separate test workspace</p><h1 className="mt-3 text-2xl font-bold">Active Call Lookup — Test</h1><p className="mt-3 leading-7 text-slate-300">Open this page from its separate authorized test link. The current PIN Code Lookup page is not used here.</p></section></main>;

  return (
    <main className="min-h-screen bg-[#f3f5f7] px-5 py-10 text-slate-950 sm:px-8">
      <section className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b-4 border-amber-500 bg-[#14243d] px-6 py-6 text-white">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-200">Separate test workspace</p>
          <h1 className="mt-2 text-2xl font-black tracking-tight">Active Call Lookup — Test</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">This is separate from the current PIN Code Lookup page. It cannot answer, route, record, transfer, hold, or change any call.</p>
        </div>
        <div className="space-y-5 p-6">
          <div className={`rounded-xl border p-4 text-sm leading-6 ${feedIsActive ? "border-emerald-200 bg-emerald-50 text-emerald-950" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
            {feedIsActive && activeFeedExpiresAt ? `The separate ABC-only test feed is active until ${new Date(activeFeedExpiresAt).toLocaleTimeString()}. It will not renew automatically.` : "The separate OfficeAtHand test app is authorized. A new ABC-only one-hour test feed still requires separate approval. Nothing here is connected to live call events now."}
          </div>
          <section className="rounded-xl border border-slate-200 bg-slate-50 p-5">
            <p className="font-bold text-[#14243d]">Choose the ABC Dealer test account</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">Only the exact ABC Dealer record is available in this test. The selection does not show a tracking number or start a feed by itself.</p>
            <select aria-label="Test dealership" className="mt-3 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-950" value={dealershipRecordId} onChange={event => setDealershipRecordId(event.target.value)}>
              <option value="">Choose ABC Dealer…</option>
              {dealerships.data?.map(dealer => <option key={dealer.dealershipRecordId} value={dealer.dealershipRecordId}>{dealer.dealershipName}</option>)}
            </select>
            <button type="button" className="mt-3 rounded-lg bg-[#14243d] px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!dealershipRecordId || startFeed.isPending || feedIsActive} onClick={() => startFeed.mutate({ access, dealershipRecordId })}>
              {startFeed.isPending ? "Starting the one-hour test feed…" : feedIsActive ? "The one-hour read-only test feed is active" : "Start the one-hour read-only test feed"}
            </button>
            {startFeed.data ? <p className="mt-3 text-sm font-medium text-emerald-800">The test feed is active until {new Date(startFeed.data.expiresAt).toLocaleTimeString()}. It will not renew automatically.</p> : null}
            {startFeed.error ? <p className="mt-3 text-sm font-medium text-red-700">The test feed was not started. No call-center setting was changed.</p> : null}
          </section>
          <section className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-[#14243d]">Incoming calls — test board</p><p className="mt-1 text-sm text-slate-600">Choose the call you are answering before any customer search is available.</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">Read-only call feed</span></div>
            {activeCalls.isLoading ? <p className="mt-4 text-sm text-slate-600">Checking for current calls…</p> : null}
            {activeCalls.isError ? <p className="mt-4 text-sm text-red-700">The protected test link could not load current calls.</p> : null}
            {activeCalls.data?.length === 0 ? <p className="mt-4 rounded-lg bg-slate-50 p-4 text-sm text-slate-700">{feedIsActive ? "The ABC-only test feed is active. Waiting for a current inbound test call." : "No current test calls. The expired test feed has not been renewed."}</p> : null}
            <div className="mt-4 space-y-3">
              {activeCalls.data?.map(call => <article key={call.id} className={`rounded-lg border p-4 ${call.id === selectedCallId ? "border-amber-400 bg-amber-50" : "border-slate-200"}`}><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><div className="flex items-center gap-2"><p className="font-bold text-slate-950">{call.callerPhone}</p><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">{call.status}</span></div><p className="mt-2 text-sm text-slate-600">Called tracking number: {call.dialedPhone}</p></div><button type="button" disabled={busy} onClick={() => void searchCallerPhone(call.id)} className="shrink-0 rounded-lg bg-[#14243d] px-3 py-2 text-sm font-bold text-white disabled:opacity-50">{call.id === selectedCallId ? "Search this caller again" : "Choose this call"}</button></div></article>)}
            </div>
          </section>
          {selectedCall ? <section className="rounded-xl border border-amber-200 bg-amber-50 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Selected active test call</p><p className="mt-1 font-bold text-slate-950">Caller: {selectedCall.callerPhone}</p></div><button type="button" onClick={resetSelection} className="text-sm font-bold text-[#14243d] underline underline-offset-4">Clear selection</button></div><p className="mt-3 text-sm leading-6 text-amber-950">The caller-number search runs only for this selected current test call. If it does not find a customer, ask for the PIN code; this page will not create a contact.</p><div className="mt-4 flex gap-2"><input value={pin} onChange={event => setPin(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void searchByPin(); }} placeholder="Customer PIN code" className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none focus:border-amber-500" /><button type="button" disabled={busy} onClick={() => void searchByPin()} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm font-bold text-[#14243d] disabled:opacity-50">{searchSelectedPin.isPending ? "Searching…" : "Search by PIN"}</button></div></section> : null}
          {notice ? <div className={`rounded-xl border p-4 text-sm font-medium ${toneStyles[notice.tone]}`}>{notice.message}</div> : null}
          <ContactMatches contacts={matches} onSelect={contactId => selectedCallId && void loadContact(selectedCallId, contactId)} loading={loadSelectedContact.isPending} />
          {contact && selectedCall ? <section className="overflow-hidden rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-200 bg-slate-50 p-5"><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">Existing customer only</p><h2 className="mt-1 text-xl font-bold text-[#14243d]">{contactName(contact)}</h2><p className="mt-2 text-sm leading-6 text-slate-600">The calling number is {selectedCall.callerPhone}. Saving is optional and uses this existing customer’s ID, so it cannot create a duplicate.</p></div><div className="grid gap-4 p-5 md:grid-cols-2"><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">First Name</span><input value={form.firstName} onChange={event => setForm(current => ({ ...current, firstName: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950" /></label><label className="block"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Last Name</span><input value={form.lastName} onChange={event => setForm(current => ({ ...current, lastName: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950" /></label><label className="block md:col-span-2"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Phone</span><div className="flex gap-2"><input value={form.phone} onChange={event => setForm(current => ({ ...current, phone: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950" /><button type="button" onClick={() => setForm(current => ({ ...current, phone: selectedCall.callerPhone }))} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#14243d]">Use calling number</button></div></label><label className="block md:col-span-2"><span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Email</span><input value={form.email} onChange={event => setForm(current => ({ ...current, email: event.target.value }))} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950" /></label></div><div className="flex flex-col-reverse gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:justify-end"><button type="button" onClick={resetSelection} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700">Cancel</button><button type="button" disabled={busy} onClick={() => void savePhone()} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white disabled:bg-slate-300">{saveSelectedContact.isPending ? "Saving…" : "Save Changes to Existing Customer"}</button></div></section> : null}
          <p className="text-xs leading-5 text-slate-500">Appointment and opportunity actions are intentionally not part of this separate test connection.</p>
        </div>
      </section>
    </main>
  );
}
