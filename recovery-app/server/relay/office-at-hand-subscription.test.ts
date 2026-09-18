import { describe, expect, it } from "vitest";
import {
  buildAbcOnlyTelephonyEventFilters,
  isOfficeAtHandAbcTestDealerName,
  normalizeOfficeAtHandPhoneNumber,
  toOfficeAtHandTestFeedStatus,
} from "./office-at-hand-subscription";

describe("ABC-only OfficeAtHand test subscription", () => {
  it("uses only inbound event filters for one or two exact ABC tracking numbers", () => {
    const filters = buildAbcOnlyTelephonyEventFilters(["407-555-1212", "407-555-3434"]);
    expect(filters).toHaveLength(8);
    expect(filters.every(filter => filter.includes("direction=Inbound") && filter.includes("phoneNumber=%2B1407") && !filter.includes("recording"))).toBe(true);
    expect(filters.some(filter => filter.includes("statusCode=Setup"))).toBe(true);
    expect(filters.some(filter => filter.includes("statusCode=Disconnected"))).toBe(true);
  });

  it("normalizes only valid North American or E.164 tracking numbers", () => {
    expect(normalizeOfficeAtHandPhoneNumber("(407) 555-1212")).toBe("+14075551212");
    expect(normalizeOfficeAtHandPhoneNumber("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizeOfficeAtHandPhoneNumber("not-a-number")).toBe("");
  });

  it("permits only the exact ABC Dealer record name for the separate test feed", () => {
    expect(isOfficeAtHandAbcTestDealerName("ABC Dealer")).toBe(true);
    expect(isOfficeAtHandAbcTestDealerName(" abc dealer ")).toBe(true);
    expect(isOfficeAtHandAbcTestDealerName("ABC Dealer Group")).toBe(false);
    expect(isOfficeAtHandAbcTestDealerName("Another Dealership")).toBe(false);
  });

  it("maps the current time-limited feed state without a provider request", () => {
    expect(toOfficeAtHandTestFeedStatus({
      dealerRecordId: "selected-test-dealer",
      expiresAt: new Date("2026-09-11T20:09:53.347Z"),
    })).toEqual({
      active: true,
      dealershipRecordId: "selected-test-dealer",
      expiresAt: new Date("2026-09-11T20:09:53.347Z"),
    });
    expect(toOfficeAtHandTestFeedStatus(null)).toEqual({ active: false, dealershipRecordId: null, expiresAt: null });
  });
});
