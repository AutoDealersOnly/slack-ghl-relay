import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";

type CustomFields = Record<string, string>;
type Contact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  customFields: CustomFields;
};
type FormState = Omit<Contact, "id">;
type TabId = "contact" | "vehicle" | "desired" | "notes";

const PLACEHOLDER_PINS = new Set(["2003", "2003*", "*2003"]);
const ADO_LOGO = "/manus-storage/ado-logo-hires_78935c88.png";
const FIELD_LABELS: Record<string, string> = {
  apartment_number: "Apartment / Unit",
  year: "Year",
  mileage: "Mileage",
  current_payment: "Current Payment",
  apr: "APR",
  lienholder: "Lienholder",
  pay_off: "Payoff",
  remaining_payments: "Remaining Payments",
  term_end: "Term End",
  purchase_date: "Purchase Date",
  purchase_type: "Purchase Type",
  last_service: "Last Service",
  kbb_book_value: "KBB Book Value",
  options: "Options",
  condition: "Condition",
  advertised_offer: "Advertised Offer",
  number_of_payments: "Number of Payments",
  makemodeltrim: "Make / Model / Trim",
  make: "Make",
  model: "Model",
  trim: "Trim",
  vin: "VIN",
  d__year: "Desired Year",
  dmake: "Desired Make",
  dmodel: "Desired Model",
  dtrim: "Desired Trim",
  dvin: "Desired VIN",
  stock: "Desired Stock #",
  dodometer: "Desired Odometer",
  dcondition: "Desired Condition",
  cashfinancelease: "Cash / Finance / Lease",
  desired_car_payment: "Desired Payment",
  desired_car_term: "Desired Term",
  exterior_color: "Exterior Color",
  interior_color: "Interior Color",
  dcertified: "Certified",
  dwarranty: "Warranty",
  dcomments: "Desired Vehicle Comments",
  notes: "Notes",
  agent: "Agent",
  appt_status: "Appointment Status",
  appointment_time: "Appointment Time",
};
const TAB_FIELDS: Record<Exclude<TabId, "contact">, string[]> = {
  vehicle: ["year", "make", "model", "trim", "vin", "mileage", "current_payment", "apr", "lienholder", "pay_off", "remaining_payments", "term_end", "purchase_date", "purchase_type", "last_service", "kbb_book_value", "options", "condition", "advertised_offer", "number_of_payments", "makemodeltrim"],
  desired: ["d__year", "dmake", "dmodel", "dtrim", "dvin", "stock", "dodometer", "dcondition", "cashfinancelease", "desired_car_payment", "desired_car_term", "exterior_color", "interior_color", "dcertified", "dwarranty", "dcomments"],
  notes: ["notes", "agent", "appt_status", "appointment_time"],
};
const emptyForm = (): FormState => ({ firstName: "", lastName: "", email: "", phone: "", address1: "", city: "", state: "", postalCode: "", customFields: {} });
const contactToForm = (contact: Contact): FormState => ({ firstName: contact.firstName, lastName: contact.lastName, email: contact.email, phone: contact.phone, address1: contact.address1, city: contact.city, state: contact.state, postalCode: contact.postalCode, customFields: { ...contact.customFields } });
const displayName = (contact: Pick<Contact, "firstName" | "lastName">) => [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Unnamed contact";

function Field({ label, value, onChange, type = "text", wide = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; wide?: boolean }) {
  return (
    <label className={wide ? "block md:col-span-2" : "block"}>
      <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-950 outline-none transition focus:border-[#ed2726] focus:ring-2 focus:ring-red-100" />
    </label>
  );
}

function ContactMatches({ contacts, onSelect, loading }: { contacts: Array<Pick<Contact, "id" | "firstName" | "lastName" | "email" | "phone">>; onSelect: (id: string) => void; loading: boolean }) {
  if (!contacts.length) return null;
  return (
    <section className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-sm font-bold text-amber-950">Choose the correct customer</p>
      <div className="mt-3 divide-y divide-amber-200 overflow-hidden rounded-lg border border-amber-200 bg-white">
        {contacts.map(contact => (
          <div key={contact.id} className="flex flex-col justify-between gap-3 p-3 sm:flex-row sm:items-center">
            <div><p className="font-bold text-slate-950">{displayName(contact)}</p><p className="mt-0.5 text-sm text-slate-600">{[contact.phone, contact.email].filter(Boolean).join(" · ") || "No phone or email"}</p></div>
            <button type="button" disabled={loading} onClick={() => onSelect(contact.id)} className="shrink-0 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#14243d] hover:border-[#ed2726] hover:text-[#ed2726] disabled:opacity-50">Select</button>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function PinCodeLookup() {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const access = params.get("access")?.trim() ?? "";
  const locationId = (params.get("locationId") ?? params.get("location"))?.trim() ?? "";
  const [pin, setPin] = useState("");
  const [retryPin, setRetryPin] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [showFallback, setShowFallback] = useState(false);
  const [showNameSearch, setShowNameSearch] = useState(false);
  const [matches, setMatches] = useState<Array<Pick<Contact, "id" | "firstName" | "lastName" | "email" | "phone">>>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [manual, setManual] = useState(false);
  const [tab, setTab] = useState<TabId>("contact");
  const [notice, setNotice] = useState<{ tone: "success" | "warning" | "error"; message: string } | null>(null);
  const bootstrap = trpc.pinLookup.bootstrap.useQuery({ access, locationId }, { enabled: Boolean(access && locationId), retry: false });
  const searchPin = trpc.pinLookup.searchPin.useMutation();
  const searchPhone = trpc.pinLookup.searchPhone.useMutation();
  const searchName = trpc.pinLookup.searchName.useMutation();
  const loadContact = trpc.pinLookup.loadContact.useMutation();
  const saveContact = trpc.pinLookup.saveContact.useMutation();
  const createContact = trpc.pinLookup.createContact.useMutation();
  const busy = searchPin.isPending || searchPhone.isPending || searchName.isPending || loadContact.isPending || saveContact.isPending || createContact.isPending;
  const setField = (field: keyof Omit<FormState, "customFields">, value: string) => setForm(current => ({ ...current, [field]: value }));
  const setCustomField = (field: string, value: string) => setForm(current => ({ ...current, customFields: { ...current.customFields, [field]: value } }));
  const errorMessage = (error: unknown, fallback: string) => error instanceof Error && error.message ? error.message : fallback;
  const showLoadedContact = (next: Contact, message: string) => { setContact(next); setForm(contactToForm(next)); setManual(false); setMatches([]); setShowFallback(false); setNotice({ tone: "success", message }); setTab("contact"); };
  const selectContact = async (contactId: string) => { try { showLoadedContact(await loadContact.mutateAsync({ access, locationId, contactId }), "Contact loaded."); } catch (error) { setNotice({ tone: "error", message: errorMessage(error, "The contact could not be loaded.") }); } };
  const runPinSearch = async (attempt = pin) => {
    const value = attempt.trim();
    if (!value) { setNotice({ tone: "warning", message: "Enter a customer PIN code first." }); return; }
    setContact(null); setManual(false); setMatches([]); setShowNameSearch(false); setNotice(null);
    try {
      const result = await searchPin.mutateAsync({ access, locationId, pin: value });
      if (result.kind === "contact") { showLoadedContact(result.contact, `Contact found: ${displayName(result.contact)}.`); return; }
      if (result.kind === "matches") { setMatches(result.contacts); setShowFallback(false); setNotice({ tone: "warning", message: "More than one customer has this PIN. Choose the correct customer below." }); return; }
      setShowFallback(true); setNotice({ tone: "warning", message: PLACEHOLDER_PINS.has(value) ? "This is a placeholder PIN Code, likely from an email campaign. Search by phone or name to find the customer." : `PIN ${value} was not found. Search by phone, try another PIN, or create a customer manually.` });
    } catch (error) { setNotice({ tone: "error", message: errorMessage(error, "The PIN search could not be completed.") }); }
  };
  const runPhoneSearch = async () => {
    if (!phone.trim()) { setNotice({ tone: "warning", message: "Enter a phone number to search." }); return; }
    setMatches([]);
    try { const results = await searchPhone.mutateAsync({ access, locationId, query: phone }); if (results.length === 1) { await selectContact(results[0].id); return; } setMatches(results); setShowNameSearch(results.length === 0); setNotice({ tone: "warning", message: results.length ? "Select the matching customer below." : "No customer matched that phone number. You can search by name or enter a customer manually." }); } catch (error) { setNotice({ tone: "error", message: errorMessage(error, "The phone search could not be completed.") }); }
  };
  const runNameSearch = async () => {
    if (!name.trim()) { setNotice({ tone: "warning", message: "Enter a name to search." }); return; }
    setMatches([]);
    try { const results = await searchName.mutateAsync({ access, locationId, query: name }); if (results.length === 1) { await selectContact(results[0].id); return; } setMatches(results); setNotice({ tone: "warning", message: results.length ? "Select the matching customer below." : "No customer matched that name. You can enter a customer manually." }); } catch (error) { setNotice({ tone: "error", message: errorMessage(error, "The name search could not be completed.") }); }
  };
  const startManualEntry = () => { setContact(null); setForm(emptyForm()); setManual(true); setMatches([]); setShowFallback(false); setTab("contact"); setNotice({ tone: "warning", message: "Enter the customer information below, then choose Create Contact. The searched PIN will be assigned when it is not a placeholder value." }); };
  const save = async () => { try { if (manual) { const saved = await createContact.mutateAsync({ access, locationId, pin: PLACEHOLDER_PINS.has(pin.trim()) ? undefined : pin.trim() || undefined, form }); showLoadedContact(saved, `New contact created: ${displayName(saved)}.`); } else if (contact) { const saved = await saveContact.mutateAsync({ access, locationId, contactId: contact.id, form }); showLoadedContact(saved, `Changes saved for ${displayName(saved)}.`); } } catch (error) { setNotice({ tone: "error", message: errorMessage(error, "The customer record could not be saved.") }); } };
  const reset = () => { setPin(""); setRetryPin(""); setPhone(""); setName(""); setShowFallback(false); setShowNameSearch(false); setMatches([]); setContact(null); setForm(emptyForm()); setManual(false); setNotice(null); setTab("contact"); };
  if (!access || !locationId) return <main className="grid min-h-screen place-items-center bg-slate-950 p-6 text-white"><section className="max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-8 shadow-2xl"><p className="text-xs font-bold uppercase tracking-[0.2em] text-red-300">ADO internal tool</p><h1 className="mt-3 text-2xl font-bold">PIN Code Lookup</h1><p className="mt-3 leading-7 text-slate-300">Open this tool from its authorized GoHighLevel custom-menu link.</p></section></main>;
  const pageError = bootstrap.error?.message;
  const toneStyles = { success: "border-emerald-200 bg-emerald-50 text-emerald-900", warning: "border-amber-200 bg-amber-50 text-amber-950", error: "border-red-200 bg-red-50 text-red-900" };
  const tabs: Array<{ id: TabId; label: string }> = [{ id: "contact", label: "Contact Info" }, { id: "vehicle", label: "Current Vehicle" }, { id: "desired", label: "Desired Vehicle" }, { id: "notes", label: "Notes & Status" }];
  const hasForm = Boolean(contact || manual);
  return <main className="min-h-screen bg-[#f3f5f7] text-slate-950"><header className="border-b-4 border-[#ed2726] bg-[#14243d] text-white"><div className="mx-auto max-w-6xl px-5 py-4 sm:px-8"><img src={ADO_LOGO} alt="Auto Dealers Only" className="mx-auto h-9 w-auto object-contain" /><div className="mt-4 border-l-4 border-[#ed2726] pl-4"><p className="text-[10px] font-bold uppercase tracking-[0.2em] text-red-200">PIN Code Lookup</p><h1 className="mt-1 text-2xl font-black tracking-tight">{bootstrap.data?.dealershipName ?? "Loading dealership…"}</h1><div className="mt-2 space-y-1 text-sm font-bold text-slate-100"><p>{bootstrap.data?.dealershipAddress ?? ""}</p><p>{bootstrap.data?.dealershipHours ? `Hours: ${bootstrap.data.dealershipHours}` : ""}</p></div></div></div></header><section className="mx-auto max-w-6xl px-5 py-7 sm:px-8">{bootstrap.isLoading && <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">Preparing dealership information…</div>}{pageError && <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm font-medium text-red-900">{pageError}</div>}{!bootstrap.isLoading && !pageError && <div className="grid gap-7 lg:grid-cols-[340px_minmax(0,1fr)]"><aside className="h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm lg:sticky lg:top-6"><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ed2726]">Find a customer</p><label htmlFor="pin" className="mt-4 block text-sm font-bold">Enter Customer PIN Code</label><div className="mt-2 flex gap-2"><input id="pin" value={pin} onChange={event => setPin(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void runPinSearch(); }} placeholder="e.g. 12345" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#ed2726] focus:ring-2 focus:ring-red-100" autoComplete="off" /><button type="button" onClick={() => void runPinSearch()} disabled={busy} className="rounded-lg bg-[#ed2726] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#c91c1b] disabled:bg-slate-300">{searchPin.isPending ? "Searching…" : "Look Up"}</button></div>{bootstrap.data?.missingPinField && <p className="mt-3 text-sm font-medium text-red-700">The required PIN Code field is not available in this subaccount.</p>}{(contact || manual || showFallback || matches.length > 0) && <button type="button" onClick={reset} className="mt-4 text-sm font-bold text-[#14243d] underline underline-offset-4 hover:text-[#ed2726]">Clear and start over</button>}</aside><section>{notice && <div className={`rounded-xl border p-4 text-sm font-medium ${toneStyles[notice.tone]}`}>{notice.message}</div>}{showFallback && <section className="mt-5 rounded-2xl border border-amber-200 bg-white p-5 shadow-sm"><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">PIN not found</p><h2 className="mt-2 text-xl font-bold">Find the customer another way</h2><p className="mt-2 text-sm leading-6 text-slate-600">Use the phone number first. If that does not find the customer, search by name or enter them manually.</p><label className="mt-5 block text-sm font-bold">Try another PIN</label><div className="mt-2 flex gap-2"><input value={retryPin} onChange={event => setRetryPin(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { setPin(retryPin); void runPinSearch(retryPin); } }} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#ed2726]" /><button type="button" onClick={() => { setPin(retryPin); void runPinSearch(retryPin); }} disabled={busy} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-[#14243d] hover:border-[#ed2726]">Search by PIN</button></div><label className="mt-4 block text-sm font-bold">Customer phone number</label><div className="mt-2 flex gap-2"><input value={phone} onChange={event => setPhone(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void runPhoneSearch(); }} placeholder="e.g. 5551234567" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#ed2726]" /><button type="button" onClick={() => void runPhoneSearch()} disabled={busy} className="rounded-lg bg-[#14243d] px-3 py-2 text-sm font-bold text-white disabled:bg-slate-300">{searchPhone.isPending ? "Searching…" : "Search by Phone"}</button></div>{showNameSearch && <><label className="mt-4 block text-sm font-bold">Customer name</label><div className="mt-2 flex gap-2"><input value={name} onChange={event => setName(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void runNameSearch(); }} placeholder="e.g. Smith or John Smith" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#ed2726]" /><button type="button" onClick={() => void runNameSearch()} disabled={busy} className="rounded-lg bg-[#14243d] px-3 py-2 text-sm font-bold text-white disabled:bg-slate-300">{searchName.isPending ? "Searching…" : "Search by Name"}</button></div></>}<button type="button" onClick={startManualEntry} className="mt-5 rounded-lg bg-[#e65c00] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#c54e00]">+ Enter Customer Manually</button></section>}<ContactMatches contacts={matches} onSelect={id => void selectContact(id)} loading={loadContact.isPending} />{!hasForm && !showFallback && !matches.length && <div className="mt-5 grid min-h-80 place-items-center rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center"><div><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-50 text-lg font-black text-[#ed2726]">PIN</div><h2 className="mt-4 text-xl font-bold">Look up a customer by PIN code</h2><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">Their customer record will appear here when it is found in this dealership’s GoHighLevel account.</p></div></div>}{hasForm && <section className="mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="border-b border-slate-200 bg-slate-50 px-5 py-4"><div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center"><div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#ed2726]">{manual ? "New customer" : "Customer record"}</p><h2 className="mt-1 text-xl font-bold">{manual ? "Enter customer details" : displayName(contact!)}</h2></div>{contact && <a href={`https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(contact.id)}`} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#14243d] underline underline-offset-4 hover:text-[#ed2726]">Open Customer in GHL</a>}</div></div><div className="flex overflow-x-auto border-b border-slate-200 bg-white px-3">{tabs.map(item => <button type="button" key={item.id} onClick={() => setTab(item.id)} className={`shrink-0 border-b-2 px-3 py-3 text-sm font-bold ${tab === item.id ? "border-[#ed2726] text-[#ed2726]" : "border-transparent text-slate-600 hover:text-slate-950"}`}>{item.label}</button>)}</div><div className="p-5">{tab === "contact" && <div className="grid gap-4 md:grid-cols-2"><Field label="First Name" value={form.firstName} onChange={value => setField("firstName", value)} /><Field label="Last Name" value={form.lastName} onChange={value => setField("lastName", value)} /><Field label="Email" value={form.email} onChange={value => setField("email", value)} type="email" /><Field label="Phone" value={form.phone} onChange={value => setField("phone", value)} type="tel" /><Field label="Address" value={form.address1} onChange={value => setField("address1", value)} wide /><Field label="Apartment / Unit" value={form.customFields.apartment_number ?? ""} onChange={value => setCustomField("apartment_number", value)} /><div className="hidden md:block" /><Field label="City" value={form.city} onChange={value => setField("city", value)} /><Field label="State" value={form.state} onChange={value => setField("state", value)} /><Field label="Postal Code" value={form.postalCode} onChange={value => setField("postalCode", value)} /></div>}{(["vehicle", "desired", "notes"] as TabId[]).includes(tab) && <div className="grid gap-4 md:grid-cols-2">{TAB_FIELDS[tab as Exclude<TabId, "contact">].map(field => <Field key={field} label={FIELD_LABELS[field] ?? field} value={form.customFields[field] ?? ""} onChange={value => setCustomField(field, value)} wide={field === "options" || field === "advertised_offer" || field === "dcomments" || field === "notes"} />)}</div>}<div className="mt-7 flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end"><button type="button" onClick={reset} className="rounded-lg border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-slate-400">Cancel</button><button type="button" onClick={() => void save()} disabled={busy} className="rounded-lg bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:bg-slate-300">{saveContact.isPending || createContact.isPending ? "Saving…" : manual ? "Create Contact" : "Save Changes to GHL"}</button></div></div></section>}</section></div>}</section></main>;
}
