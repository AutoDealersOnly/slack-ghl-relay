import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildPinLookupContactPayload,
  contactBelongsToLocation,
  defaultMarketingPipeline,
  pinLookupLoadInput,
  pinLookupOpportunitySaveInput,
  pinLookupPinSearchInput,
  pinLookupSaveInput,
  resetPinLookupDealershipCacheForTests,
  savePinLookupContact,
  savePinLookupOpportunity,
  searchPinCode,
} from "./pin-code-lookup";

const environment = {
  GHL_API_KEY: process.env.GHL_API_KEY,
  GHL_LOCATION_ID: process.env.GHL_LOCATION_ID,
  PIN_CODE_LOOKUP_ACCESS_TOKEN: process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN,
};

afterEach(() => {
  vi.unstubAllGlobals();
  resetPinLookupDealershipCacheForTests();
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function setupEnvironment() {
  process.env.GHL_API_KEY = "ado-test-key";
  process.env.GHL_LOCATION_ID = "ado-location";
  process.env.PIN_CODE_LOOKUP_ACCESS_TOKEN = "pin-lookup-test-access";
}

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("universal PIN Code Lookup contract", () => {
  it("rejects a PIN lookup when the private menu-link value is wrong", async () => {
    setupEnvironment();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchPinCode("wrong-access", "dealer-location", "12345")).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the matching dealership key only on the server and returns no configuration data", async () => {
    setupEnvironment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ records: [{ id: "dealer-record", properties: { dealership_name: "ABC Dealer", loc_id: "dealer-location", api_key: "dealer-private-key" } }] }))
      .mockResolvedValueOnce(response({ customFields: [{ id: "pin-field-id", fieldKey: "contact.pin_code" }] }))
      .mockResolvedValueOnce(response({ contacts: [{ id: "contact-1", firstName: "Jane", lastName: "Smith", phone: "5551112222" }] }))
      .mockResolvedValueOnce(response({ contact: { id: "contact-1", locationId: "dealer-location", firstName: "Jane", lastName: "Smith", customFields: [{ id: "pin-field-id", fieldValue: "12345" }], opportunities: [{ id: "opportunity-1", name: "Appointment Follow-up", status: "open", monetaryValue: 2500 }] } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await searchPinCode("pin-lookup-test-access", "dealer-location", "12345");

    expect(result).toMatchObject({ kind: "contact", contact: { id: "contact-1", firstName: "Jane", customFields: { pin_code: "12345" }, opportunities: [{ id: "opportunity-1", name: "Appointment Follow-up", status: "open", monetaryValue: 2500 }] } });
    expect(JSON.stringify(result)).not.toContain("dealer-private-key");
    const customFieldRequest = fetchMock.mock.calls[1];
    expect(customFieldRequest?.[1]?.headers).toMatchObject({ Authorization: "Bearer dealer-private-key" });
  });

  it("keeps a loaded contact isolated to the location supplied by the menu link", () => {
    expect(contactBelongsToLocation({ locationId: "dealer-location" }, "dealer-location")).toBe(true);
    expect(contactBelongsToLocation({ locationId: "different-location" }, "dealer-location")).toBe(false);
    expect(contactBelongsToLocation({}, "dealer-location")).toBe(false);
  });

  it("validates location and contact references before a lookup or save request can be made", () => {
    expect(pinLookupPinSearchInput.safeParse({ access: "value", locationId: "bad context!", pin: "12345" }).success).toBe(false);
    expect(pinLookupLoadInput.safeParse({ access: "value", locationId: "dealer-location", contactId: "../other" }).success).toBe(false);
    expect(pinLookupSaveInput.safeParse({ access: "value", locationId: "dealer-location", contactId: "contact-1", form: { customFields: { unexpected_field: "value" } } }).success).toBe(true);
  });

  it("submits only approved non-empty fields and never overwrites an existing customer PIN", () => {
    const payload = buildPinLookupContactPayload({
      firstName: "Jane", lastName: "", email: "", phone: "", address1: "", city: "", state: "", postalCode: "",
      customFields: { pin_code: "99999", make: "Honda", unexpected_field: "ignore", notes: "" },
    }, { pin_code: "pin-id", make: "make-id", notes: "notes-id" });

    expect(payload).toEqual({ firstName: "Jane", customFields: [{ id: "make-id", key: "contact.make", fieldValue: "Honda" }] });
  });

  it("updates the already loaded contact ID when a caller phone number changes and never creates a duplicate", async () => {
    setupEnvironment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ records: [{ properties: { loc_id: "dealer-location", api_key: "dealer-private-key" } }] }))
      .mockResolvedValueOnce(response({ customFields: [] }))
      .mockResolvedValueOnce(response({ contact: { id: "contact-1", locationId: "dealer-location", firstName: "Michael", phone: "+17065555555" } }))
      .mockResolvedValueOnce(response({ contact: { id: "contact-1", locationId: "dealer-location", firstName: "Michael", phone: "+17067777777" } }));
    vi.stubGlobal("fetch", fetchMock);

    const saved = await savePinLookupContact("pin-lookup-test-access", "dealer-location", "contact-1", {
      firstName: "Michael", lastName: "", email: "", phone: "+17067777777", address1: "", city: "", state: "", postalCode: "", customFields: {},
    });

    expect(saved).toMatchObject({ id: "contact-1", phone: "+17067777777" });
    expect(fetchMock.mock.calls[3]?.[0]).toContain("/contacts/contact-1");
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({ method: "PUT" });
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(1);
  });

  it("defaults the opportunity form to the Marketing Pipeline when the dealership has one", () => {
    expect(defaultMarketingPipeline([
      { id: "sales", name: "Sales Pipeline", stages: [] },
      { id: "marketing", name: "Marketing Pipeline", stages: [{ id: "new-lead", name: "New Lead" }] },
    ])).toMatchObject({ id: "marketing", name: "Marketing Pipeline" });
  });

  it("validates the opportunity save form and refuses an opportunity not attached to the selected customer", async () => {
    expect(pinLookupOpportunitySaveInput.safeParse({
      access: "value", locationId: "dealer-location", contactId: "contact-1",
      form: { opportunityId: "other-opportunity", name: "Follow-up", pipelineId: "marketing", pipelineStageId: "new-lead", status: "open" },
    }).success).toBe(true);
    expect(pinLookupOpportunitySaveInput.safeParse({
      access: "value", locationId: "dealer-location", contactId: "contact-1",
      form: { name: "Follow-up", pipelineId: "invalid pipeline!", status: "open" },
    }).success).toBe(false);

    setupEnvironment();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ records: [{ properties: { loc_id: "dealer-location", api_key: "dealer-private-key" } }] }))
      .mockResolvedValueOnce(response({ customFields: [] }))
      .mockResolvedValueOnce(response({ contact: { id: "contact-1", locationId: "dealer-location", opportunities: [] } }))
      .mockResolvedValueOnce(response({ pipelines: [{ id: "marketing", name: "Marketing Pipeline", stages: [{ id: "new-lead", name: "New Lead" }] }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(savePinLookupOpportunity("pin-lookup-test-access", "dealer-location", "contact-1", {
      opportunityId: "other-opportunity", name: "Follow-up", pipelineId: "marketing", pipelineStageId: "new-lead", status: "open",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
