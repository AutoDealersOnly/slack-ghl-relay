import { describe, expect, it } from "vitest";

describe("OfficeAtHand active-call module startup", () => {
  it("loads its database subscription helper at runtime without starting a phone integration", async () => {
    const activeCalls = await import("./office-at-hand-active-calls");

    expect(activeCalls.receiveOfficeAtHandActiveCallNotification).toBeTypeOf("function");
    expect(activeCalls.getActiveCallLookupTestEntries).toBeTypeOf("function");
  });
});
