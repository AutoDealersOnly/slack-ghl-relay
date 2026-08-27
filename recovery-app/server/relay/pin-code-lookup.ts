import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getRelayConfig } from "./config";
import { ghlHeaders } from "./ghl";
import { hasPinCodeLookupAccess } from "./pin-code-lookup-access";
import type { DealershipProperties, GhlCustomObjectRecord } from "./types";

const GHL_BASE_URL = "https://services.leadconnectorhq.com";
const GHL_VERSION = "v3";
const GHL_PIPELINE_READ_VERSION = "2021-07-28";
const PLACEHOLDER_PINS = new Set(["2003", "2003*", "*2003"]);
let dealershipRecordsCache: { expiresAt: number; records: DealerRecord[] } | null = null;
let dealershipRecordsInFlight: Promise<DealerRecord[]> | null = null;

export function resetPinLookupDealershipCacheForTests() {
  dealershipRecordsCache = null;
  dealershipRecordsInFlight = null;
}

export const PIN_LOOKUP_FIELD_KEYS = [
  "pin_code", "apartment_number", "year", "mileage", "current_payment", "apr", "lienholder", "pay_off",
  "remaining_payments", "term_end", "purchase_date", "purchase_type", "last_service", "kbb_book_value",
  "options", "condition", "advertised_offer", "number_of_payments", "makemodeltrim", "make", "model", "trim",
  "vin", "d__year", "dmake", "dmodel", "dtrim", "dvin", "stock", "dodometer", "dcondition",
  "cashfinancelease", "desired_car_payment", "desired_car_term", "exterior_color", "interior_color", "dcertified",
  "dwarranty", "dcomments", "notes", "agent", "appt_status", "appointment_time",
] as const;

export type PinLookupFieldKey = (typeof PIN_LOOKUP_FIELD_KEYS)[number];
export type PinLookupFieldMap = Partial<Record<PinLookupFieldKey, string>>;

type DealerRecord = GhlCustomObjectRecord<DealershipProperties>;
type GhlCustomField = { id?: string; fieldKey?: string; name?: string };
type GhlCustomFieldValue = { id?: string; value?: unknown; fieldValue?: unknown };
type GhlOpportunity = { id?: string; name?: string; status?: string; monetaryValue?: number | string };
type GhlPipelineStage = { id?: string; name?: string };
type GhlPipeline = { id?: string; name?: string; stages?: GhlPipelineStage[] };
type GhlContact = {
  id?: string;
  locationId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  address1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  customFields?: GhlCustomFieldValue[];
  opportunities?: GhlOpportunity[];
};

export type PinLookupContact = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  city: string;
  state: string;
  postalCode: string;
  customFields: Partial<Record<PinLookupFieldKey, string>>;
  opportunities: Array<{ id: string; name: string; status: string; monetaryValue: number | null }>;
};

export type PinLookupContactSummary = Pick<PinLookupContact, "id" | "firstName" | "lastName" | "email" | "phone">;
export type PinLookupPipeline = { id: string; name: string; stages: Array<{ id: string; name: string }> };

const accessInput = z.object({ access: z.string().trim().min(1).max(512) });
const locationInput = z.string().trim().regex(/^[A-Za-z0-9_-]{6,128}$/, "Invalid dealership context.");
const contactIdInput = z.string().trim().regex(/^[A-Za-z0-9_-]{6,255}$/, "Invalid contact reference.");
const textInput = (max: number) => z.string().trim().max(max).default("");

const contactFormInput = z.object({
  firstName: textInput(120),
  lastName: textInput(120),
  email: textInput(254),
  phone: textInput(64),
  address1: textInput(255),
  city: textInput(120),
  state: textInput(64),
  postalCode: textInput(32),
  customFields: z.record(z.string().max(128), z.string().max(5000)).default({}),
});

export const pinLookupBootstrapInput = accessInput.extend({ locationId: locationInput });
export const pinLookupPinSearchInput = pinLookupBootstrapInput.extend({ pin: z.string().trim().min(1).max(128) });
export const pinLookupTextSearchInput = pinLookupBootstrapInput.extend({ query: z.string().trim().min(1).max(255) });
export const pinLookupLoadInput = pinLookupBootstrapInput.extend({ contactId: contactIdInput });
export const pinLookupSaveInput = pinLookupLoadInput.extend({ form: contactFormInput });
export const pinLookupCreateInput = pinLookupBootstrapInput.extend({ pin: z.string().trim().max(128).optional(), form: contactFormInput });
const opportunityStatusInput = z.enum(["open", "won", "lost", "abandoned"]);
const opportunityFormInput = z.object({
  opportunityId: contactIdInput.optional(),
  name: z.string().trim().min(1).max(255),
  pipelineId: contactIdInput,
  pipelineStageId: contactIdInput.optional(),
  status: opportunityStatusInput.default("open"),
  monetaryValue: z.number().finite().min(0).max(100_000_000).optional(),
});
export const pinLookupOpportunityOptionsInput = pinLookupLoadInput;
export const pinLookupOpportunitySaveInput = pinLookupLoadInput.extend({ form: opportunityFormInput });

type DealerContext = {
  locationId: string;
  dealershipName: string;
  dealershipAddress: string;
  dealershipHours: string;
  apiKey: string;
  fields: PinLookupFieldMap;
};

export type PinLookupDealershipSummary = {
  locationId: string;
  dealershipName: string;
  ready: boolean;
};

function text(value: unknown): string {
  return String(value ?? "").trim();
}

function property(record: DealerRecord, key: keyof DealershipProperties): string {
  return text(record.properties?.[key]);
}

function requireAccess(access: string): void {
  if (!hasPinCodeLookupAccess(access)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "This PIN Code Lookup link is not authorized." });
  }
}

function normalizeFieldKey(value: string): string {
  return value.replace(/^contact\./, "").trim();
}

function isKnownField(value: string): value is PinLookupFieldKey {
  return (PIN_LOOKUP_FIELD_KEYS as readonly string[]).includes(value);
}

function cleanCustomFields(values: Record<string, string>, fields: PinLookupFieldMap, allowPin: boolean) {
  const payload: Array<{ id: string; key: string; fieldValue: string }> = [];
  for (const [key, rawValue] of Object.entries(values)) {
    if (!isKnownField(key) || (!allowPin && key === "pin_code")) continue;
    const id = fields[key];
    const value = text(rawValue);
    // Preserve the recovered page's behavior: blank values do not overwrite saved values.
    if (!id || !value) continue;
    payload.push({ id, key: `contact.${key}`, fieldValue: value });
  }
  return payload;
}

export function buildPinLookupContactPayload(
  form: z.infer<typeof contactFormInput>,
  fields: PinLookupFieldMap,
  options: { includeLocationId?: string; pin?: string } = {}
) {
  const payload: Record<string, unknown> = {};
  const standard = ["firstName", "lastName", "email", "phone", "address1", "city", "state", "postalCode"] as const;
  for (const field of standard) {
    if (form[field]) payload[field] = form[field];
  }
  if (options.includeLocationId) payload.locationId = options.includeLocationId;
  const submitted = { ...form.customFields };
  if (options.pin) submitted.pin_code = options.pin;
  const customFields = cleanCustomFields(submitted, fields, Boolean(options.pin));
  if (customFields.length) payload.customFields = customFields;
  return payload;
}

export function contactBelongsToLocation(contact: Pick<GhlContact, "locationId">, locationId: string): boolean {
  return Boolean(contact.locationId && contact.locationId === locationId);
}

function ghlFetch(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      controller.abort();
      reject(new Error("GoHighLevel did not respond in time."));
    }, 15_000);
  });
  const request = fetch(url, { ...init, signal: controller.signal });
  return Promise.race([request, timeout]).finally(() => {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  });
}

async function getDealershipRecords(): Promise<DealerRecord[]> {
  if (dealershipRecordsCache && dealershipRecordsCache.expiresAt > Date.now()) {
    return dealershipRecordsCache.records;
  }
  if (dealershipRecordsInFlight) return dealershipRecordsInFlight;
  dealershipRecordsInFlight = loadDealershipRecords();
  try {
    return await dealershipRecordsInFlight;
  } finally {
    dealershipRecordsInFlight = null;
  }
}

async function loadDealershipRecords(): Promise<DealerRecord[]> {
  const config = getRelayConfig();
  if (!config.ghlApiKey || !config.ghlLocationId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "ADO Dealership lookup is not configured." });
  }
  const records: DealerRecord[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const response = await ghlFetch(`${GHL_BASE_URL}/objects/custom_objects.dealerships/records/search`, {
      method: "POST",
      headers: ghlHeaders(config.ghlApiKey, "2021-07-28", config.ghlLocationId),
      body: JSON.stringify({ locationId: config.ghlLocationId, page, pageLimit: 100, query: "", searchAfter: [] }),
    });
    if (!response.ok) {
      throw new TRPCError({ code: "BAD_GATEWAY", message: "ADO could not retrieve dealership settings." });
    }
    const body = (await response.json()) as { records?: DealerRecord[] };
    const pageRecords = Array.isArray(body.records) ? body.records : [];
    records.push(...pageRecords);
    if (pageRecords.length < 100) break;
  }
  dealershipRecordsCache = { records, expiresAt: Date.now() + 5 * 60_000 };
  return records;
}

async function readJson<T>(response: Response, action: string): Promise<T> {
  if (!response.ok) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: `GoHighLevel could not complete the ${action}.` });
  }
  return (await response.json()) as T;
}

async function resolveContext(access: string, locationId: string): Promise<DealerContext> {
  requireAccess(access);
  const matches = (await getDealershipRecords()).filter(record => property(record, "loc_id") === locationId);
  if (matches.length !== 1) {
    throw new TRPCError({ code: "NOT_FOUND", message: "This dealership is not configured for PIN Code Lookup." });
  }
  const dealership = matches[0];
  const apiKey = property(dealership, "api_key");
  if (!apiKey) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This dealership is missing its protected PIN Lookup connection." });
  }
  const response = await fetch(`${GHL_BASE_URL}/locations/${encodeURIComponent(locationId)}/customFields?model=contact`, {
    headers: ghlHeaders(apiKey, GHL_VERSION),
  });
  const body = await readJson<{ customFields?: GhlCustomField[] }>(response, "custom-field setup");
  const fields: PinLookupFieldMap = {};
  for (const field of body.customFields ?? []) {
    const key = normalizeFieldKey(text(field.fieldKey));
    if (isKnownField(key) && field.id) fields[key] = field.id;
  }
  const dealershipAddress = [property(dealership, "street_address"), property(dealership, "city"), property(dealership, "state"), property(dealership, "zip")]
    .filter(Boolean)
    .join(", ");
  return {
    locationId,
    dealershipName: property(dealership, "dealership_name") || "Dealership",
    dealershipAddress,
    dealershipHours: property(dealership, "hours"),
    apiKey,
    fields,
  };
}

function toSummary(contact: GhlContact): PinLookupContactSummary {
  return {
    id: text(contact.id),
    firstName: text(contact.firstName),
    lastName: text(contact.lastName),
    email: text(contact.email),
    phone: text(contact.phone),
  };
}

function toContact(contact: GhlContact, fields: PinLookupFieldMap): PinLookupContact {
  const customFields: Partial<Record<PinLookupFieldKey, string>> = {};
  const fieldKeyById = new Map(Object.entries(fields).map(([key, id]) => [id, key as PinLookupFieldKey]));
  for (const field of contact.customFields ?? []) {
    const key = field.id ? fieldKeyById.get(field.id) : undefined;
    if (key) customFields[key] = text(field.fieldValue ?? field.value);
  }
  return {
    ...toSummary(contact),
    address1: text(contact.address1),
    city: text(contact.city),
    state: text(contact.state),
    postalCode: text(contact.postalCode),
    customFields,
    opportunities: (contact.opportunities ?? []).map(opportunity => ({
      id: text(opportunity.id),
      name: text(opportunity.name) || "Opportunity",
      status: text(opportunity.status) || "Unknown",
      monetaryValue: Number.isFinite(Number(opportunity.monetaryValue)) ? Number(opportunity.monetaryValue) : null,
    })),
  };
}

async function getContact(context: DealerContext, contactId: string): Promise<PinLookupContact> {
  const response = await fetch(`${GHL_BASE_URL}/contacts/${encodeURIComponent(contactId)}`, {
    headers: ghlHeaders(context.apiKey, GHL_VERSION),
  });
  const body = await readJson<{ contact?: GhlContact }>(response, "contact lookup");
  const contact = body.contact;
  if (!contact || !contactBelongsToLocation(contact, context.locationId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "That contact is not available in this dealership." });
  }
  return toContact(contact, context.fields);
}

async function searchContacts(context: DealerContext, body: Record<string, unknown>, action: string) {
  const response = await fetch(`${GHL_BASE_URL}/contacts/search`, {
    method: "POST",
    headers: ghlHeaders(context.apiKey, GHL_VERSION),
    body: JSON.stringify({ locationId: context.locationId, pageLimit: 20, ...body }),
  });
  const result = await readJson<{ contacts?: GhlContact[] }>(response, action);
  return (result.contacts ?? []).map(toSummary).filter(contact => Boolean(contact.id));
}

export async function getPinLookupBootstrap(access: string, locationId: string) {
  const context = await resolveContext(access, locationId);
  return {
    dealershipName: context.dealershipName,
    dealershipAddress: context.dealershipAddress,
    dealershipHours: context.dealershipHours,
    availableFields: PIN_LOOKUP_FIELD_KEYS.filter(key => Boolean(context.fields[key])),
    missingPinField: !context.fields.pin_code,
  };
}

function toPipeline(pipeline: GhlPipeline): PinLookupPipeline | null {
  const id = text(pipeline.id);
  if (!id) return null;
  return {
    id,
    name: text(pipeline.name) || "Unnamed Pipeline",
    stages: (pipeline.stages ?? []).map(stage => ({ id: text(stage.id), name: text(stage.name) || "Unnamed Stage" })).filter(stage => Boolean(stage.id)),
  };
}

async function getOpportunityPipelines(context: DealerContext): Promise<PinLookupPipeline[]> {
  const response = await ghlFetch(`${GHL_BASE_URL}/opportunities/pipelines?locationId=${encodeURIComponent(context.locationId)}`, {
    headers: ghlHeaders(context.apiKey, GHL_PIPELINE_READ_VERSION),
  });
  const body = await readJson<{ pipelines?: GhlPipeline[] }>(response, "pipeline list");
  return (body.pipelines ?? []).map(toPipeline).filter((pipeline): pipeline is PinLookupPipeline => Boolean(pipeline));
}

export function defaultMarketingPipeline(pipelines: PinLookupPipeline[]): PinLookupPipeline | undefined {
  return pipelines.find(pipeline => /marketing/i.test(pipeline.name));
}

export async function getPinLookupOpportunityOptions(access: string, locationId: string, contactId: string) {
  const context = await resolveContext(access, locationId);
  await getContact(context, contactId);
  const pipelines = await getOpportunityPipelines(context);
  const defaultPipeline = defaultMarketingPipeline(pipelines);
  return {
    pipelines,
    defaultPipelineId: defaultPipeline?.id ?? "",
    defaultStageId: defaultPipeline?.stages[0]?.id ?? "",
  };
}

/** Read-only pipeline diagnostic. It does not request customer data or create/update an opportunity. */
export async function listPinLookupPipelines(access: string, locationId: string) {
  const pipelines = await getOpportunityPipelines(await resolveContext(access, locationId));
  const defaultPipeline = defaultMarketingPipeline(pipelines);
  return {
    pipelines,
    defaultPipelineId: defaultPipeline?.id ?? "",
    defaultPipelineName: defaultPipeline?.name ?? "",
  };
}

export async function savePinLookupOpportunity(
  access: string,
  locationId: string,
  contactId: string,
  form: z.infer<typeof opportunityFormInput>
) {
  const context = await resolveContext(access, locationId);
  const contact = await getContact(context, contactId);
  const pipelines = await getOpportunityPipelines(context);
  const pipeline = pipelines.find(item => item.id === form.pipelineId);
  if (!pipeline) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a pipeline available in this dealership." });
  }
  if (form.pipelineStageId && !pipeline.stages.some(stage => stage.id === form.pipelineStageId)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Choose a stage from the selected pipeline." });
  }
  if (form.opportunityId && !contact.opportunities.some(opportunity => opportunity.id === form.opportunityId)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "That opportunity is not attached to this customer." });
  }
  const payload: Record<string, unknown> = {
    pipelineId: form.pipelineId,
    name: form.name,
    pipelineStageId: form.pipelineStageId,
    status: form.status,
  };
  if (form.monetaryValue !== undefined) payload.monetaryValue = form.monetaryValue;
  const updating = Boolean(form.opportunityId);
  if (!updating) {
    payload.locationId = context.locationId;
    payload.contactId = contact.id;
  }
  const response = await fetch(
    updating ? `${GHL_BASE_URL}/opportunities/${encodeURIComponent(form.opportunityId!)}` : `${GHL_BASE_URL}/opportunities/`,
    { method: updating ? "PUT" : "POST", headers: ghlHeaders(context.apiKey, GHL_VERSION), body: JSON.stringify(payload) }
  );
  const body = await readJson<{ opportunity?: GhlOpportunity }>(response, updating ? "opportunity update" : "opportunity creation");
  if (!body.opportunity?.id) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "GoHighLevel did not return the saved opportunity." });
  }
  return {
    id: text(body.opportunity.id),
    name: text(body.opportunity.name) || form.name,
    status: text(body.opportunity.status) || form.status,
    monetaryValue: Number.isFinite(Number(body.opportunity.monetaryValue)) ? Number(body.opportunity.monetaryValue) : form.monetaryValue ?? null,
    created: !updating,
  };
}

/** Read-only, server-side diagnostic helper. It never returns a dealership API key. */
export async function listPinLookupDealerships(access: string): Promise<PinLookupDealershipSummary[]> {
  requireAccess(access);
  return (await getDealershipRecords())
    .map(record => ({
      locationId: property(record, "loc_id"),
      dealershipName: property(record, "dealership_name") || "Unnamed Dealership",
      ready: Boolean(property(record, "loc_id") && property(record, "api_key")),
    }))
    .filter(item => Boolean(item.locationId))
    .sort((a, b) => a.dealershipName.localeCompare(b.dealershipName));
}

export async function searchPinCode(access: string, locationId: string, pin: string) {
  if (PLACEHOLDER_PINS.has(pin.trim())) return { kind: "fallback" as const, contacts: [] as PinLookupContactSummary[] };
  const context = await resolveContext(access, locationId);
  const pinFieldId = context.fields.pin_code;
  if (!pinFieldId) {
    throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This subaccount does not have the required PIN Code custom field." });
  }
  const contacts = await searchContacts(context, {
    filters: [{ field: `customFields.${pinFieldId}`, operator: "eq", value: pin.trim() }],
    pageLimit: 5,
  }, "PIN lookup");
  if (!contacts.length) return { kind: "fallback" as const, contacts };
  if (contacts.length === 1) return { kind: "contact" as const, contact: await getContact(context, contacts[0].id) };
  return { kind: "matches" as const, contacts };
}

export async function searchPinLookupByPhone(access: string, locationId: string, phone: string) {
  const context = await resolveContext(access, locationId);
  return searchContacts(context, { filters: [{ field: "phone", operator: "eq", value: phone.trim() }], pageLimit: 10 }, "phone search");
}

export async function searchPinLookupByName(access: string, locationId: string, query: string) {
  const context = await resolveContext(access, locationId);
  const response = await fetch(`${GHL_BASE_URL}/contacts/?locationId=${encodeURIComponent(context.locationId)}&query=${encodeURIComponent(query.trim())}&limit=20`, {
    headers: ghlHeaders(context.apiKey, GHL_VERSION),
  });
  const body = await readJson<{ contacts?: GhlContact[] }>(response, "name search");
  return (body.contacts ?? []).map(toSummary).filter(contact => Boolean(contact.id));
}

export async function loadPinLookupContact(access: string, locationId: string, contactId: string) {
  return getContact(await resolveContext(access, locationId), contactId);
}

export async function savePinLookupContact(
  access: string,
  locationId: string,
  contactId: string,
  form: z.infer<typeof contactFormInput>
) {
  const context = await resolveContext(access, locationId);
  await getContact(context, contactId);
  const payload = buildPinLookupContactPayload(form, context.fields);
  if (!Object.keys(payload).length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter at least one value before saving." });
  }
  const response = await fetch(`${GHL_BASE_URL}/contacts/${encodeURIComponent(contactId)}`, {
    method: "PUT",
    headers: ghlHeaders(context.apiKey, GHL_VERSION),
    body: JSON.stringify(payload),
  });
  const body = await readJson<{ contact?: GhlContact }>(response, "contact update");
  const contact = body.contact;
  if (!contact || !contactBelongsToLocation(contact, context.locationId)) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "GoHighLevel did not return the updated dealership contact." });
  }
  return toContact(contact, context.fields);
}

export async function createPinLookupContact(
  access: string,
  locationId: string,
  pin: string | undefined,
  form: z.infer<typeof contactFormInput>
) {
  const context = await resolveContext(access, locationId);
  if (!form.firstName && !form.lastName && !form.email && !form.phone) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Enter a name, email, or phone number before creating a contact." });
  }
  const payload = buildPinLookupContactPayload(form, context.fields, { includeLocationId: context.locationId, pin: pin?.trim() });
  const response = await fetch(`${GHL_BASE_URL}/contacts/`, {
    method: "POST",
    headers: ghlHeaders(context.apiKey, GHL_VERSION),
    body: JSON.stringify(payload),
  });
  const body = await readJson<{ contact?: GhlContact }>(response, "contact creation");
  const contact = body.contact;
  if (!contact || !contactBelongsToLocation(contact, context.locationId)) {
    throw new TRPCError({ code: "BAD_GATEWAY", message: "GoHighLevel did not return the new dealership contact." });
  }
  return toContact(contact, context.fields);
}
