import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetPinLookupDealershipCacheForTests } from "./pin-code-lookup";

const { validEventToken, validPageAccess } = vi.hoisted(() => ({
  validEventToken: vi.fn(),
  validPageAccess: vi.fn(),
}));
const { encryptValue, decryptValue } = vi.hoisted(() => ({
  encryptValue: vi.fn((value: string) => `encrypted:${value}`),
  decryptValue: vi.fn((value: string) => value.replace("encrypted:", "")),
}));
const { upsertCall, removeCall, listCalls, currentSubscription, currentTestFeed } = vi.hoisted(() => ({
  upsertCall: vi.fn(),
  removeCall: vi.fn(),
  listCalls: vi.fn(),
  currentSubscription: vi.fn(),
  currentTestFeed: vi.fn(),
}));

vi.mock("./active-call-lookup-test-access", () => ({
  hasActiveCallLookupTestAccess: validPageAccess,
  hasActiveCallWebhookValidationToken: validEventToken,
}));
vi.mock("./office-at-hand-crypto", () => ({
  encryptOfficeAtHandSecret: encryptValue,
  decryptOfficeAtHandSecret: decryptValue,
}));
vi.mock("./db", () => ({
  upsertOfficeAtHandActiveCall: upsertCall,
  removeOfficeAtHandActiveCall: removeCall,
  listCurrentOfficeAtHandActiveCalls: listCalls,
  hasCurrentOfficeAtHandTestSubscription: currentSubscription,
  getCurrentOfficeAtHandTestSubscription: currentTestFeed,
}));

import {
  getActiveCallLookupTestEntries,
  loadSelectedActiveCallContact,
  receiveOfficeAtHandActiveCallNotification,
  saveSelectedActiveCallContact,
  searchSelectedActiveCallByPin,
  searchSelectedActiveCallByPhone,
} from "./office-at-hand-active-calls";

const environment = {
  GHL_API_KEY: process.env.GHL_API_KEY,
  GHL_LOCATION_ID: process.env.GHL_LOCATION_ID,
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

const inboundSetup = {
  subscriptionId: "abc-test-subscription",
  body: {
    telephonySessionId: "session-test-1",
    sequence: 7,
    parties: [{
      id: "party-test-1",
      direction: "Inbound",
      from: { phoneNumber: "+15550001111" },
      to: { phoneNumber: "+15550002222" },
      status: { code: "Setup" },
    }],
  },
};

describe("separate OfficeAtHand active-call test receiver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    validEventToken.mockReturnValue(true);
    validPageAccess.mockReturnValue(true);
    currentSubscription.mockResolvedValue(true);
    currentTestFeed.mockResolvedValue({ dealerRecordId: "abc-dealer-record", expiresAt: new Date("2026-09-11T20:00:00Z") });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    resetPinLookupDealershipCacheForTests();
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("rejects an event that lacks the provider validation token before touching storage", async () => {
    validEventToken.mockReturnValue(false);
    await expect(receiveOfficeAtHandActiveCallNotification({ validationToken: "wrong", payload: inboundSetup }))
      .resolves.toEqual({ accepted: false, processed: 0 });
    expect(upsertCall).not.toHaveBeenCalled();
    expect(removeCall).not.toHaveBeenCalled();
  });

  it("stores only a validated inbound active call in encrypted form", async () => {
    await expect(receiveOfficeAtHandActiveCallNotification({ validationToken: "accepted", payload: inboundSetup }))
      .resolves.toEqual({ accepted: true, processed: 1 });
    expect(upsertCall).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: "session-test-1",
      partyId: "party-test-1",
      status: "Setup",
      callerPhoneCiphertext: "encrypted:+15550001111",
      dialedPhoneCiphertext: "encrypted:+15550002222",
    }));
  });

  it("rejects a provider event that is not from the currently approved ABC-only test feed", async () => {
    currentSubscription.mockResolvedValue(false);
    await expect(receiveOfficeAtHandActiveCallNotification({ validationToken: "accepted", payload: inboundSetup }))
      .resolves.toEqual({ accepted: false, processed: 0 });
    expect(upsertCall).not.toHaveBeenCalled();
  });

  it("ignores outbound parties and removes only an ended inbound call", async () => {
    const outbound = structuredClone(inboundSetup);
    outbound.body.parties[0].direction = "Outbound";
    await expect(receiveOfficeAtHandActiveCallNotification({ validationToken: "accepted", payload: outbound }))
      .resolves.toEqual({ accepted: true, processed: 0 });
    expect(upsertCall).not.toHaveBeenCalled();

    const ended = structuredClone(inboundSetup);
    ended.body.parties[0].status.code = "Disconnected";
    await expect(receiveOfficeAtHandActiveCallNotification({ validationToken: "accepted", payload: ended }))
      .resolves.toEqual({ accepted: true, processed: 1 });
    expect(removeCall).toHaveBeenCalledWith("session-test-1", "party-test-1");
  });

  it("returns current entries only through the separate protected test link", async () => {
    listCalls.mockResolvedValue([{ id: 4, status: "Answered", receivedAt: new Date("2026-09-11T18:00:00Z"), callerPhoneCiphertext: "encrypted:+15550001111", dialedPhoneCiphertext: "encrypted:+15550002222" }]);
    await expect(getActiveCallLookupTestEntries("separate-access")).resolves.toEqual([{
      id: "4", callerPhone: "+15550001111", dialedPhone: "+15550002222", status: "Active", receivedAt: new Date("2026-09-11T18:00:00Z"),
    }]);
    validPageAccess.mockReturnValue(false);
    await expect(getActiveCallLookupTestEntries("live-pin-access")).rejects.toThrow("not authorized");
  });

  it("searches only the caller number from an operator-selected current test call", async () => {
    process.env.GHL_API_KEY = "ado-test-key";
    process.env.GHL_LOCATION_ID = "ado-location";
    listCalls.mockResolvedValue([{ id: 4, status: "Answered", receivedAt: new Date(), callerPhoneCiphertext: "encrypted:+15550001111", dialedPhoneCiphertext: "encrypted:+15550002222" }]);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ records: [{ id: "abc-dealer-record", properties: { dealership_name: "ABC Dealer", loc_id: "dealer-location", api_key: "dealer-test-key" } }] }))
      .mockResolvedValueOnce(response({ customFields: [] }))
      .mockResolvedValueOnce(response({ contacts: [{ id: "contact-1", firstName: "Jane", phone: "+15550001111" }] }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(searchSelectedActiveCallByPhone("separate-access", "4")).resolves.toEqual([{ id: "contact-1", firstName: "Jane", lastName: "", email: "", phone: "+15550001111" }]);
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/contacts/search");
    expect(fetchMock.mock.calls[2]?.[1]).toMatchObject({ method: "POST" });
  });

  it("allows a PIN fallback only after the operator selects a current test call", async () => {
    listCalls.mockResolvedValue([{ id: 4, status: "Setup", receivedAt: new Date(), callerPhoneCiphertext: "encrypted:+15550001111", dialedPhoneCiphertext: "encrypted:+15550002222" }]);

    await expect(searchSelectedActiveCallByPin("separate-access", "4", "2003")).resolves.toEqual({ kind: "fallback", contacts: [] });
  });

  it("does not load or save a contact when the separate test feed is no longer active", async () => {
    currentTestFeed.mockResolvedValue(null);
    const form = { firstName: "", lastName: "", email: "", phone: "+15550001111", address1: "", city: "", state: "", postalCode: "", customFields: {} };

    await expect(loadSelectedActiveCallContact("separate-access", "4", "contact-1")).rejects.toThrow("no longer active");
    await expect(saveSelectedActiveCallContact("separate-access", "4", "contact-1", form)).rejects.toThrow("no longer active");
  });
});
